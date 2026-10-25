const $=s=>document.querySelector(s);
const svg=$("#svg"),layersEl=$("#layers"),insp=$("#inspector");
let items=[],sel=null,tool="select",nid=1,drag=null,hist=[],multiSelection=[],snapGuides=[];
const KEYS={v:"select",r:"rect",o:"ellipse",l:"line",p:"pen",t:"text",b:"button"};
const collabChannel="canvas-pro-collab";
const collabStoreKey="canvas-pro-sync-state";
let grid=true, gridSize=20, snapEnabled=true;
let designTokens=[{name:"Primary",value:"#6558e8"},{name:"Ink",value:"#222222"},{name:"Success",value:"#18a957"},{name:"Warning",value:"#ffb703"},{name:"Accent",value:"#ff5da2"}];
let variantPresets=[{id:1,name:"Primary",fill:"#6558e8",stroke:"#ffffff",text:"Click me"},{id:2,name:"Secondary",fill:"#f0f1f4",stroke:"#222222",text:"Secondary"},{id:3,name:"Danger",fill:"#f24822",stroke:"#ffffff",text:"Delete"}];
let components=[];
let prototypeLinks={};
let collabStatusEl=null;

function esc(t){return t.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c])}
function pt(e){const r=svg.getBoundingClientRect();return{x:(e.clientX-r.left)*900/r.width,y:(e.clientY-r.top)*620/r.height}}
function snap(){hist.push(JSON.stringify({items,nid}));if(hist.length>60)hist.shift()}
function saveCollabState(){
  const payload={items,nid,sel,tool,designTokens,components,prototypeLinks,screen:pagesData?pagesData.findIndex(p=>p.name===($("#fname")&&$("#fname").value||"Page 1")):0};
  localStorage.setItem(collabStoreKey,JSON.stringify(payload));
  if("BroadcastChannel" in window){
    try{const ch=new BroadcastChannel(collabChannel);ch.postMessage(payload);ch.close();}catch(e){}
  }
}
function applyCollabState(payload){
  if(!payload||!Array.isArray(payload.items))return;
  items=payload.items; nid=payload.nid||items.length+1; sel=payload.sel||null; tool=payload.tool||tool; designTokens=payload.designTokens||designTokens; components=payload.components||components; prototypeLinks=payload.prototypeLinks||prototypeLinks;
  render(); if(typeof select==="function")select(sel); if(collabStatusEl)collabStatusEl.textContent="Synced";
}
function setupCollab(){
  collabStatusEl=$("#collabStatus");
  if(!collabStatusEl)return;
  collabStatusEl.onclick=()=>{
    const next=collabStatusEl.textContent.includes("Local")?"Synced": "Local sync";
    collabStatusEl.textContent=next;
    collabStatusEl.classList.toggle("syncing",next.includes("Synced"));
  };
  if("BroadcastChannel" in window){
    const channel=new BroadcastChannel(collabChannel);
    channel.onmessage=e=>{if(e.data){applyCollabState(e.data);collabStatusEl.textContent="Live sync";collabStatusEl.classList.add("syncing");}}
    window.addEventListener("beforeunload",()=>channel.close());
  }
  window.addEventListener("storage",e=>{if(e.key===collabStoreKey&&e.newValue){applyCollabState(JSON.parse(e.newValue));}});
  const existing=localStorage.getItem(collabStoreKey); if(existing)applyCollabState(JSON.parse(existing));
}
function currentSelection(){
  const ids = multiSelection.length ? [...multiSelection] : (sel == null ? [] : [sel]);
  return ids.filter(id => {
    const item = items.find(x => x.id === id);
    return item && !item.hidden && !item.locked;
  });
}
function applySelectionSet(ids){
  multiSelection = [...new Set((ids||[]).filter(Boolean))].filter(id => {
    const item = items.find(x => x.id === id);
    return item && !item.hidden && !item.locked;
  });
  sel = multiSelection[0] ?? null;
}
function toggleSelection(id){
  if(id==null) return;
  const group = currentSelection();
  if(group.includes(id)) {
    const next = group.filter(v => v !== id);
    applySelectionSet(next);
  } else {
    applySelectionSet([...group, id]);
  }
  render();
  if(sel!=null){ const i=items.find(x=>x.id===sel); if(i) select(sel); }
}
function renderComponentLibrary(){
  const root=$("#componentList"); if(!root) return;
  root.innerHTML=(components.length?components.map(c=>`<div class="component-card"><span>${esc(c.name)}</span><button data-comp="${c.id}">Insert</button></div>`).join(""):"<div class=\"hint\">Save a reusable component from the selected element.</div>");
  root.querySelectorAll("[data-comp]").forEach(btn=>{
    btn.onclick=()=>{
      const comp=components.find(c=>String(c.id)===btn.dataset.comp); if(!comp)return;
      const item={...comp.prototype,id:nid++,x:(comp.prototype.x||100)+24,y:(comp.prototype.y||100)+24,componentId:comp.id};
      items.push(item); select(item.id); render(); saveCollabState();
    };
  });
}
function renderTokenList(){
  const root=$("#tokenList"); if(!root) return;
  root.innerHTML=(designTokens.length ? designTokens.map((t,index)=>`<div class="token-row"><button class="token-chip" data-token="${esc(t.value)}" style="background:${t.value};color:${t.value==="#ffffff"?"#111":"#fff"};border-color:${t.value}">${esc(t.name)}</button><button class="token-remove" data-token-remove="${index}" title="Remove token">×</button></div>`).join("") : '<div class="hint">No design tokens yet.</div>') + '<div class="prototype-row"><button class="mbtn" id="addTokenBtn">Add token</button></div>';
  root.querySelectorAll("[data-token]").forEach(btn=>btn.onclick=()=>{
    const i=cs(); if(!i) return;
    if(i.t==="line"||i.t==="pen") i.stroke=btn.dataset.token; else i.fill=btn.dataset.token;
    render(); select(i.id); saveCollabState();
  });
  root.querySelectorAll("[data-token-remove]").forEach(btn=>btn.onclick=()=>{
    const idx=Number(btn.dataset.tokenRemove); if(Number.isNaN(idx)) return;
    designTokens.splice(idx,1); renderTokenList(); saveCollabState();
  });
  const addBtn=document.getElementById("addTokenBtn"); if(addBtn){ addBtn.onclick=()=>{
    const name=prompt("Token name","Accent"); if(!name) return;
    const value=prompt("Token value","#6558e8"); if(!value) return;
    designTokens.push({name,value}); renderTokenList(); saveCollabState();
  }; }
}
function applyVariantPreset(preset){
  const i=cs(); if(!i) return;
  if(preset.fill) i.fill = preset.fill;
  if(preset.stroke) i.stroke = preset.stroke;
  if(preset.text && (i.t==="button"||i.t==="text")) i.text = preset.text;
  if(preset.sw) i.sw = preset.sw;
  render(); select(i.id); saveCollabState();
}
function renderVariantList(){
  const root=$("#variantList"); if(!root) return;
  root.innerHTML=(variantPresets.length ? variantPresets.map(p=>`<div class="token-row"><button class="variant-chip" data-variant="${p.id}" style="background:${p.fill};color:${p.fill==="#ffffff"?"#111":"#fff"};border-color:${p.fill}">${esc(p.name)}</button><button class="token-remove" data-variant-remove="${p.id}" title="Remove variant">×</button></div>`).join("") : '<div class="hint">No variants yet.</div>') + '<div class="prototype-row"><button class="mbtn" id="saveVariantBtn">Save current</button><button class="mbtn" id="addVariantBtn">Add variant</button></div>';
  root.querySelectorAll("[data-variant]").forEach(btn=>btn.onclick=()=>{
    const preset = variantPresets.find(p => String(p.id) === btn.dataset.variant); if(!preset) return;
    applyVariantPreset(preset);
  });
  root.querySelectorAll("[data-variant-remove]").forEach(btn=>btn.onclick=()=>{
    const id=Number(btn.dataset.variantRemove); if(Number.isNaN(id)) return;
    variantPresets=variantPresets.filter(p=>p.id!==id); renderVariantList();
  });
  const addBtn=document.getElementById("addVariantBtn"); if(addBtn){ addBtn.onclick=()=>{
    const i=cs(); const name=prompt("Variant name","Default"); if(!name) return;
    const fill=prompt("Variant fill","#6558e8");
    const stroke=prompt("Variant stroke","#ffffff");
    const text=(i&&((i.t==="button"||i.t==="text"))) ? i.text : "";
    variantPresets.push({id:Date.now(),name,fill:fill||"#6558e8",stroke:stroke||"#ffffff",text:text||name}); renderVariantList(); saveCollabState();
  }; }
  const saveBtn=document.getElementById("saveVariantBtn"); if(saveBtn){ saveBtn.onclick=()=>{
    const i=cs(); if(!i) return;
    const name=prompt("Variant name", i.t==="button" ? "Primary button" : i.name || i.t);
    if(!name) return;
    variantPresets.push({id:Date.now(),name,fill:i.fill||"#6558e8",stroke:i.stroke||"#ffffff",text:(i.t==="button"||i.t==="text")?i.text:name,sw:i.sw||2}); renderVariantList(); saveCollabState();
  }; }
}
function buildHandoffCSS(){
  const tokenBlock = designTokens.map(t => `  --${t.name.toLowerCase().replace(/\s+/g, '-')}: ${t.value};`).join("\n");
  const current = cs();
  const currentBlock = current ? `
  --selected-fill: ${current.fill || '#6558e8'};
  --selected-stroke: ${current.stroke || '#222222'};
  --selected-font-size: ${current.fs || 14};
  --selected-opacity: ${current.op ?? 1};` : "";
  return `:root {\n${tokenBlock}${currentBlock}\n}`;
}
function renderHandoffPanel(){
  const root = document.getElementById("handoffPanel");
  if(!root) return;
  root.innerHTML = `<pre class="handoff-box">${esc(buildHandoffCSS())}</pre><button class="mbtn" id="copyHandoffBtn">Copy CSS</button>`;
  const copyBtn = document.getElementById("copyHandoffBtn");
  if(copyBtn){ copyBtn.onclick = async ()=>{
    try{ await navigator.clipboard.writeText(buildHandoffCSS()); copyBtn.textContent = "Copied"; setTimeout(()=>copyBtn.textContent = "Copy CSS", 1200); }
    catch(e){ copyBtn.textContent = "Copy failed"; }
  }; }
}
function registerDesignSystem(){
  const right=$(".right"); if(!right||$("#componentList")) return;
  const system=document.createElement("div");
  system.innerHTML=`<div class="sec"><h3>System</h3><div class="prototype-row"><button class="mbtn" id="saveCompBtn">Save as component</button><button class="mbtn" id="addScreenBtn">Add screen</button><button class="mbtn" id="toggleGridBtn">${grid?"Snap on":"Snap off"}</button></div><div id="componentList" class="component-list"></div></div><div class="sec"><h3>Prototype</h3><div class="prototype-row"><select id="prototypeTarget"></select><button class="mbtn" id="prototypeBtn">Link</button></div></div><div class="sec"><h3>Comments</h3><textarea id="commentInput" rows="2" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;resize:vertical"></textarea><div class="prototype-row" style="margin-top:8px"><button class="mbtn" id="addCommentBtn">Add note</button></div><div id="commentList" class="component-list"></div></div><div class="sec"><h3>Tokens</h3><div id="tokenList" class="token-list"></div></div><div class="sec"><h3>Variants</h3><div id="variantList" class="token-list"></div></div><div class="sec"><h3>Handoff</h3><div id="handoffPanel"></div></div>`;
  right.append(system);
  $("#saveCompBtn").onclick=()=>{
    const i=cs(); if(!i) return;
    const name=prompt("Component name", i.t==="button"?"Primary button":i.t.charAt(0).toUpperCase()+i.t.slice(1));
    if(!name) return;
    components.push({id:Date.now(),name,prototype:JSON.parse(JSON.stringify(i))});
    renderComponentLibrary(); saveCollabState();
  };
  $("#addScreenBtn").onclick=()=>{
    const screenName=`Screen ${pagesData.length+1}`; pagesData.push({name:screenName,items:[]});
    drawPages();
    const next=pagesData.length-1; goPage(next); select(null); saveCollabState();
  };
  $("#toggleGridBtn").onclick=()=>{
    grid=!grid; snapEnabled=grid; $("#toggleGridBtn").textContent = grid ? "Snap on" : "Snap off"; render();
  };
  $("#addCommentBtn").onclick=()=>{
    const input=$("#commentInput"); const text=input.value.trim(); if(!text) return;
    const anchor = cs() || {x:110,y:120};
    items.push({id:nid++,t:"comment",x:anchor.x+20,y:anchor.y+20,w:150,h:80,text,fill:"#f24822",stroke:"#ffffff",sw:2,op:1});
    input.value=""; renderCommentList(); render(); saveCollabState();
  };
  $("#prototypeBtn").onclick=()=>{
    const i=cs(); const target=$("#prototypeTarget").value; if(!i||!target) return;
    prototypeLinks[i.id]=Number(target); saveCollabState();
    const preview=(document.getElementById("app").classList.contains("preview"));
    if(preview){ goPage(Number(target)); }
    else { alert(`Prototype link set: ${pagesData[Number(target)]?.name || "screen"}`); }
  };
  const refreshPrototypeOptions=()=>{
    const target=$("#prototypeTarget"); if(!target) return;
    target.innerHTML=pagesData.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join("");
    if(pagesData.length>1){
      const current = Number((document.getElementById("fname") && document.getElementById("fname").value) || 0);
      target.value = String(Math.min(pagesData.length-1, current || 0));
    }
  };
  const _drawPages=window.drawPages; window.drawPages=()=>{ _drawPages&&_drawPages(); refreshPrototypeOptions(); };
  refreshPrototypeOptions(); renderComponentLibrary(); renderTokenList(); renderVariantList(); renderCommentList(); renderHandoffPanel();
}
function applyResponsiveMode(mode){
  const page=$(".page"); if(!page) return;
  const map={desktop:900,tablet:768,phone:390};
  const width=map[mode]||900;
  page.style.width=Math.min(width, 100)+"px";
  page.style.maxWidth="100%";
  if(mode==="phone"){page.style.borderRadius="18px"; page.style.boxShadow="0 10px 40px rgba(0,0,0,.15)";} else {page.style.borderRadius="0"; page.style.boxShadow="0 8px 35px #0002";}
}
function setResponsiveControls(){
  const right=$(".right"); if(!right||$("#responsiveMode")) return;
  const wrap=document.createElement("div");
  wrap.className="sec";
  wrap.innerHTML=`<h3>Responsive</h3><div class="prototype-row"><select id="responsiveMode"><option value="desktop">Desktop</option><option value="tablet">Tablet</option><option value="phone">Phone</option></select><button class="mbtn" id="applyResponsive">Apply</button></div>`;
  right.append(wrap);
  $("#applyResponsive").onclick=()=>applyResponsiveMode($("#responsiveMode").value);
}
function snapValue(v){return snapEnabled ? Math.round(v/gridSize)*gridSize : v}
function bw(i){return Math.max(80,i.text.length*8+32)}
function renderCommentList(){
  const list=$("#commentList");
  if(!list) return;
  const comments = items.filter(i=>i.t==="comment");
  list.innerHTML = comments.length ? comments.map(c=>`<div class="comment-entry"><strong>Comment</strong><p>${esc(c.text)}</p><button data-comment-id="${c.id}">Open</button></div>`).join("") : '<div class="hint">No comments yet. Add one to leave feedback.</div>';
  list.querySelectorAll("[data-comment-id]").forEach(btn=>btn.onclick=()=>{
    const id=Number(btn.dataset.commentId), target=items.find(i=>i.id===id); if(!target) return; select(id); render();
  });
}

function shape(i){
  const st=`fill="${i.fill || '#ffffff'}" stroke="${i.stroke || '#222222'}" stroke-width="${i.sw || 2}"`;
  const ln=`fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  let b="";
  const pos = getEffectivePosition(i);
  if(i.t==="rect")b=`<rect width="${i.w}" height="${i.h}" rx="${i.rad ?? 8}" ${st}/>`;
  else if(i.t==="ellipse")b=`<ellipse cx="${i.w/2}" cy="${i.h/2}" rx="${i.w/2}" ry="${i.h/2}" ${st}/>`;
  else if(i.t==="frame")b=`<rect width="${i.w}" height="${i.h}" rx="${i.rad ?? 12}" fill="${i.fill || '#ffffff'}" stroke="${i.stroke || '#dfe3eb'}" stroke-width="${i.sw || 1}" stroke-dasharray="6 6"/>`;
  else if(i.t==="line")b=`<line x2="${i.x2}" y2="${i.y2}" stroke="transparent" stroke-width="16"/><line x2="${i.x2}" y2="${i.y2}" stroke="${i.stroke}" stroke-width="${i.sw}" stroke-linecap="round"/>`;
  else if(i.t==="pen"){const d="M"+i.pts.map(p=>p.join(" ")).join("L");b=`<path d="${d}" ${ln} stroke="transparent" stroke-width="16"/><path d="${d}" ${ln} stroke="${i.stroke}" stroke-width="${i.sw}"/>`}
  else if(i.t==="text")b=`<text y="28" font-size="${i.fs || 28}" font-weight="700" fill="${i.fill}" font-family="Inter,system-ui,sans-serif">${esc(i.text)}</text>`;
  else if(i.t==="button")b=`<rect width="${bw(i)}" height="40" rx="7" fill="${i.fill}"/><text x="${bw(i)/2}" y="21" text-anchor="middle" dominant-baseline="central" font-size="${i.fs || 14}" font-weight="600" fill="${i.stroke}" font-family="Inter,system-ui,sans-serif">${esc(i.text)}</text>`;
  else if(i.t==="comment")b=`<circle cx="14" cy="14" r="14" fill="#f24822"/><text x="14" y="15" text-anchor="middle" dominant-baseline="central" font-size="14">💬</text><text x="36" y="19" font-size="13" fill="#222">${esc(i.text)}</text>`;
  const rotation = i.r ? ` rotate(${i.r} ${(i.w||0)/2} ${(i.h||0)/2})` : "";
  return `<g data-id="${i.id}" transform="translate(${pos.x} ${pos.y})${rotation}" style="cursor:${tool==="select"?"move":"crosshair"}"><g opacity="${i.op??1}">${b}</g></g>`;
}
function rectIntersects(a, b){
  return !(a.x > b.x + b.width || a.x + a.width < b.x || a.y > b.y + b.height || a.y + a.height < b.y);
}
function render(){
  const visibleItems = items.filter(i => !i.hidden);
  const gridMarkup = grid ? `<defs><pattern id="gridPattern" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse"><path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#dfe3ea" stroke-width="1"/></pattern></defs><rect width="900" height="620" fill="url(#gridPattern)" opacity="0.9" pointer-events="none"/>` : "";
  const guideMarkup = snapGuides.length ? snapGuides.map(g => g.axis === "x" ? `<line x1="${g.value}" y1="0" x2="${g.value}" y2="620" stroke="#6ea8fe" stroke-width="1.5" stroke-dasharray="5 5"/>` : `<line x1="0" y1="${g.value}" x2="900" y2="${g.value}" stroke="#6ea8fe" stroke-width="1.5" stroke-dasharray="5 5"/>`).join("") : "";
  const marqueeMarkup = drag && drag.mode === "marquee" ? (() => {
    const x = Math.min(drag.start.x, drag.current.x);
    const y = Math.min(drag.start.y, drag.current.y);
    const w = Math.abs(drag.current.x - drag.start.x);
    const h = Math.abs(drag.current.y - drag.start.y);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(101,88,232,0.08)" stroke="#6558e8" stroke-width="1" stroke-dasharray="6 4" pointer-events="none"/>`;
  })() : "";
  svg.innerHTML = gridMarkup + visibleItems.map(shape).join("") + guideMarkup + marqueeMarkup;
  const selected = new Set(currentSelection());
  const selectionBounds = getSelectionBounds();
  if(selectionBounds){
    svg.insertAdjacentHTML("beforeend", `<rect data-selection-box="true" x="${selectionBounds.x - 4}" y="${selectionBounds.y - 4}" width="${selectionBounds.width + 8}" height="${selectionBounds.height + 8}" fill="none" stroke="#6558e8" stroke-width="1.5" stroke-dasharray="5 3" pointer-events="all" style="cursor:move"/>`);
    if(selected.size > 1) renderGroupSelectionHandles();
  }
  if (selected.size === 1) {
    const active = items.find(x => x.id === [...selected][0]);
    if (active) {
      const bounds = getItemBounds(active);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      svg.insertAdjacentHTML("beforeend", `<line x1="${centerX}" y1="0" x2="${centerX}" y2="620" stroke="#7aa2ff" stroke-width="1" stroke-dasharray="4 4" opacity="0.7"/><line x1="0" y1="${centerY}" x2="900" y2="${centerY}" stroke="#7aa2ff" stroke-width="1" stroke-dasharray="4 4" opacity="0.7"/>`);
    }
  }
  selected.forEach(id => {
    const g=svg.querySelector(`[data-id="${id}"]`);
    if(g){const b=g.getBBox();g.insertAdjacentHTML("beforeend",`<rect x="${b.x-4}" y="${b.y-4}" width="${b.width+8}" height="${b.height+8}" fill="none" stroke="#6558e8" stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>`)}
  });
  if(selected.size === 1){
    const item = items.find(x => x.id === [...selected][0]);
    if(item && !item.hidden && !item.locked && item.t !== "line" && item.t !== "pen") renderSelectionHandles();
  }
  renderCommentList();
  layersEl.innerHTML="";
  [...items].reverse().forEach(i=>{
    const row=document.createElement("div");
    row.style.display="flex"; row.style.alignItems="center"; row.style.gap="4px"; row.style.margin="4px 0";
    const b=document.createElement("button");
    b.className="layer"+(selected.has(i.id)?" active":"");
    const ic={rect:"▢",ellipse:"◯",line:"╱",pen:"✎",text:"T",button:"▭",frame:"▣",comment:"💬"}[i.t];
    b.textContent=(i.hidden?"◌":"◍") + " " + ic + "  "+((i.t==="text"||i.t==="button"||i.t==="comment")?i.text:i.t);
    b.style.flex="1";
    b.style.textAlign="left";
    b.onclick=()=>select(i.id);
    const vis=document.createElement("button");
    vis.textContent=i.hidden?"Show":"Hide";
    vis.title=i.hidden?"Show layer":"Hide layer";
    vis.style.padding="4px 6px"; vis.style.border="1px solid #ddd"; vis.style.borderRadius="5px"; vis.style.background="transparent"; vis.style.color="inherit";
    vis.onclick=(e)=>{e.stopPropagation(); i.hidden=!i.hidden; if(i.hidden) { const current = currentSelection(); if(current.includes(i.id)) applySelectionSet(current.filter(id=>id!==i.id)); } render(); saveCollabState();};
    const lock=document.createElement("button");
    lock.textContent=i.locked?"Unlock":"Lock";
    lock.title=i.locked?"Unlock layer":"Lock layer";
    lock.style.padding="4px 6px"; lock.style.border="1px solid #ddd"; lock.style.borderRadius="5px"; lock.style.background="transparent"; lock.style.color="inherit";
    lock.onclick=(e)=>{e.stopPropagation(); i.locked=!i.locked; if(i.locked){ const current = currentSelection(); if(current.includes(i.id)) applySelectionSet(current.filter(id=>id!==i.id)); } render(); saveCollabState();};
    row.appendChild(b); row.appendChild(vis); row.appendChild(lock); layersEl.appendChild(row);
  });
}
function setTool(t){
  tool=t;
  document.querySelectorAll("#tools button").forEach(b=>b.classList.toggle("on",b.dataset.tool===t));
  render();
}
function field(label, id, type, val, opts = {}) {
  const attr = [];
  if (opts.min != null) attr.push(`min="${opts.min}"`);
  if (opts.max != null) attr.push(`max="${opts.max}"`);
  if (opts.step != null) attr.push(`step="${opts.step}"`);
  if (opts.placeholder != null) attr.push(`placeholder="${esc(String(opts.placeholder))}"`);
  return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(String(val))}" ${attr.join(" ")}></div>`;
}
function getItemBounds(item){
  if(!item)return {x:0,y:0,width:0,height:0};
  const pos = getEffectivePosition(item);
  if(item.t==="line"){
    const x=Math.min(pos.x,pos.x+(item.x2||0));
    const y=Math.min(pos.y,pos.y+(item.y2||0));
    return {x,y,width:Math.abs(item.x2||0),height:Math.abs(item.y2||0)};
  }
  if(item.t==="pen"&&Array.isArray(item.pts)&&item.pts.length){
    const xs=item.pts.map(p=>p[0]); const ys=item.pts.map(p=>p[1]);
    return {x:Math.min(...xs)+pos.x,y:Math.min(...ys)+pos.y,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
  }
  if((item.t==="button"||item.t==="text") && !item.w && !item.h){
    const width = item.t==="button" ? bw(item) : Math.max(80, (item.text||"" ).length * 10 + 24);
    const height = item.t==="button" ? 40 : 36;
    return {x:pos.x||0,y:pos.y||0,width,height};
  }
  return {x:pos.x||0,y:pos.y||0,width:item.w||0,height:item.h||0};
}
function renderSelectionHandles(){
  const selected = currentSelection();
  if(selected.length !== 1) return;
  const item = items.find(x => x.id === selected[0]);
  if(!item || item.t === "line" || item.t === "pen") return;
  const bounds = getItemBounds(item);
  const handleSize = 8;
  const handles = [
    {name:"nw", x: bounds.x - 4, y: bounds.y - 4},
    {name:"n", x: bounds.x + bounds.width/2 - 4, y: bounds.y - 4},
    {name:"ne", x: bounds.x + bounds.width - 4, y: bounds.y - 4},
    {name:"e", x: bounds.x + bounds.width - 4, y: bounds.y + bounds.height/2 - 4},
    {name:"se", x: bounds.x + bounds.width - 4, y: bounds.y + bounds.height - 4},
    {name:"s", x: bounds.x + bounds.width/2 - 4, y: bounds.y + bounds.height - 4},
    {name:"sw", x: bounds.x - 4, y: bounds.y + bounds.height - 4},
    {name:"w", x: bounds.x - 4, y: bounds.y + bounds.height/2 - 4}
  ];
  const group = svg.querySelector(`[data-id="${item.id}"]`);
  if(!group) return;
  group.insertAdjacentHTML("beforeend", handles.map(h=>`<rect data-handle="${h.name}" x="${h.x}" y="${h.y}" width="${handleSize}" height="${handleSize}" rx="2" fill="#ffffff" stroke="#6558e8" stroke-width="1.5" style="cursor:nesw-resize" pointer-events="all"/>`).join(""));
}
function renderGroupSelectionHandles(){
  const ids = currentSelection();
  if(ids.length < 2) return;
  const bounds = getSelectionBounds();
  if(!bounds) return;
  const handleSize = 8;
  const handles = [
    {name:"nw", x: bounds.x - 4, y: bounds.y - 4},
    {name:"n", x: bounds.x + bounds.width/2 - 4, y: bounds.y - 4},
    {name:"ne", x: bounds.x + bounds.width - 4, y: bounds.y - 4},
    {name:"e", x: bounds.x + bounds.width - 4, y: bounds.y + bounds.height/2 - 4},
    {name:"se", x: bounds.x + bounds.width - 4, y: bounds.y + bounds.height - 4},
    {name:"s", x: bounds.x + bounds.width/2 - 4, y: bounds.y + bounds.height - 4},
    {name:"sw", x: bounds.x - 4, y: bounds.y + bounds.height - 4},
    {name:"w", x: bounds.x - 4, y: bounds.y + bounds.height/2 - 4}
  ];
  svg.insertAdjacentHTML("beforeend", handles.map(h=>`<rect data-selection-handle="${h.name}" x="${h.x}" y="${h.y}" width="${handleSize}" height="${handleSize}" rx="2" fill="#ffffff" stroke="#6558e8" stroke-width="1.5" style="cursor:nesw-resize" pointer-events="all"/>`).join(""));
}
function getSelectionBounds(){
  const ids = currentSelection();
  if(!ids.length) return null;
  const bounds = ids.map(id => items.find(item => item.id === id)).filter(Boolean).map(getItemBounds);
  if(!bounds.length) return null;
  const xs = bounds.flatMap(b => [b.x, b.x + b.width]);
  const ys = bounds.flatMap(b => [b.y, b.y + b.height]);
  return {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
}
function getParent(item){
  if (!item || !item.parentId) return null;
  return items.find(x => x.id === item.parentId) || null;
}
function getEffectivePosition(item){
  const parent = getParent(item);
  if (!parent) return {x: item.x ?? 0, y: item.y ?? 0};
  return {x: (item.x ?? 0) + (parent.x ?? 0), y: (item.y ?? 0) + (parent.y ?? 0)};
}
function getSnapGuidesForItem(item){
  const bounds = getItemBounds(item);
  const {x, y} = getEffectivePosition(item);
  const guides = [];
  for(const other of items){
    if(other.id === item.id) continue;
    const b = getItemBounds(other);
    const xPositions = [b.x, b.x + b.width, b.x + b.width/2, b.x - bounds.width, b.x + b.width - bounds.width];
    const yPositions = [b.y, b.y + b.height, b.y + b.height/2, b.y - bounds.height, b.y + b.height - bounds.height];
    xPositions.forEach(xp => guides.push({axis:"x", value:xp, dist: Math.abs(x - xp)}));
    yPositions.forEach(yp => guides.push({axis:"y", value:yp, dist: Math.abs(y - yp)}));
  }
  return guides.filter(g => g.dist <= 12);
}
function getSnapGuides(item, targetX, targetY){
  const threshold=12;
  const bounds=getItemBounds(item);
  const currentWidth=bounds.width||0;
  const currentHeight=bounds.height||0;
  const guides=[];
  const pageX=[0, 900, 450];
  const pageY=[0, 620, 310];
  for (const value of pageX) {
    const dist = Math.abs(targetX - value);
    if (dist <= threshold) guides.push({axis: "x", value});
    const leftAlign = Math.abs((targetX + currentWidth) - value);
    if (leftAlign <= threshold) guides.push({axis: "x", value: value - currentWidth});
  }
  for (const value of pageY) {
    const dist = Math.abs(targetY - value);
    if (dist <= threshold) guides.push({axis: "y", value});
    const topAlign = Math.abs((targetY + currentHeight) - value);
    if (topAlign <= threshold) guides.push({axis: "y", value: value - currentHeight});
  }
  for(const other of items){
    if(other.id===item.id) continue;
    const b=getItemBounds(other);
    const xCandidates=[
      {dist:Math.abs(targetX-b.x), value:b.x},
      {dist:Math.abs(targetX-(b.x+b.width)), value:b.x+b.width},
      {dist:Math.abs(targetX+currentWidth-b.x), value:b.x-currentWidth},
      {dist:Math.abs(targetX+currentWidth-(b.x+b.width)), value:b.x+b.width-currentWidth},
      {dist:Math.abs(targetX+currentWidth/2-(b.x+b.width/2)), value:b.x+b.width/2-currentWidth/2}
    ].sort((a,b)=>a.dist-b.dist);
    const xMatch=xCandidates[0];
    if(xMatch && xMatch.dist<=threshold) guides.push({axis:"x", value:xMatch.value});
    const yCandidates=[
      {dist:Math.abs(targetY-b.y), value:b.y},
      {dist:Math.abs(targetY-(b.y+b.height)), value:b.y+b.height},
      {dist:Math.abs(targetY+currentHeight-b.y), value:b.y-currentHeight},
      {dist:Math.abs(targetY+currentHeight-(b.y+b.height)), value:b.y+b.height-currentHeight},
      {dist:Math.abs(targetY+currentHeight/2-(b.y+b.height/2)), value:b.y+b.height/2-currentHeight/2}
    ].sort((a,b)=>a.dist-b.dist);
    const yMatch=yCandidates[0];
    if(yMatch && yMatch.dist<=threshold) guides.push({axis:"y", value:yMatch.value});
  }
  return guides;
}
function applyObjectSnap(item, targetX, targetY){
  const guides=getSnapGuides(item,targetX,targetY);
  snapGuides=guides;
  let nextX=targetX;
  let nextY=targetY;
  guides.forEach(g=>{ if(g.axis==="x") nextX=g.value; if(g.axis==="y") nextY=g.value; });
  return {x:nextX,y:nextY};
}
function distributeSelection(mode='horizontal'){
  const ids = currentSelection();
  const selected = ids.length ? ids.map(id => items.find(x => x.id === id)).filter(Boolean) : items.slice();
  if(selected.length < 2) return;
  const sorted=[...selected].sort((a,b)=>{
    const ab=getItemBounds(a), bb=getItemBounds(b);
    return mode==='horizontal' ? ab.x - bb.x : ab.y - bb.y;
  });
  const first=getItemBounds(sorted[0]);
  const last=getItemBounds(sorted[sorted.length-1]);
  const totalSpan = mode==='horizontal' ? (last.x + last.width) - first.x : (last.y + last.height) - first.y;
  const used = sorted.reduce((sum,item)=>sum + (mode==='horizontal' ? getItemBounds(item).width : getItemBounds(item).height),0);
  const gap = sorted.length>1 ? (totalSpan - used) / (sorted.length - 1) : 0;
  let cursor = mode==='horizontal' ? first.x : first.y;
  sorted.forEach(item=>{
    const bounds=getItemBounds(item);
    if(mode==='horizontal'){
      item.x = snapValue(cursor);
      cursor += bounds.width + gap;
    } else {
      item.y = snapValue(cursor);
      cursor += bounds.height + gap;
    }
  });
  render(); saveCollabState();
}
function stackSelection(mode='horizontal', gap=20){
  const ids = currentSelection();
  const selected = ids.length ? ids.map(id => items.find(x => x.id === id)).filter(Boolean) : items.slice();
  if(selected.length < 2) return;
  const sorted=[...selected].sort((a,b)=>{
    const ab=getItemBounds(a), bb=getItemBounds(b);
    return mode==='horizontal' ? ab.x - bb.x : ab.y - bb.y;
  });
  let cursor = mode==='horizontal' ? Math.min(...sorted.map(item => getItemBounds(item).x)) : Math.min(...sorted.map(item => getItemBounds(item).y));
  sorted.forEach((item,index)=>{
    const bounds=getItemBounds(item);
    if(mode==='horizontal'){
      item.x = snapValue(index === 0 ? cursor : cursor + gap);
      cursor = item.x + bounds.width;
    } else {
      item.y = snapValue(index === 0 ? cursor : cursor + gap);
      cursor = item.y + bounds.height;
    }
  });
  render(); saveCollabState();
}
function alignSelection(mode){
  const ids = currentSelection();
  if(!ids.length) return;
  const selectionItems = ids.map(id => items.find(x => x.id === id)).filter(Boolean);
  if(!selectionItems.length) return;
  const target = svg.querySelector(`[data-id="${selectionItems[0].id}"]`); if(!target) return;
  const bounds = target.getBBox();
  snap();
  selectionItems.forEach(item => {
    const b = getItemBounds(item);
    if(mode==="left") item.x = 0 + (b.x - b.x);
    else if(mode==="center") item.x = 450 - (bounds.width / 2) + (b.x - bounds.x);
    else if(mode==="right") item.x = 900 - bounds.width + (b.x - bounds.x);
    else if(mode==="top") item.y = 0 + (b.y - b.y);
    else if(mode==="middle") item.y = 310 - (bounds.height / 2) + (b.y - bounds.y);
    else if(mode==="bottom") item.y = 620 - bounds.height + (b.y - bounds.y);
  });
  render(); if(sel!=null) select(sel); saveCollabState();
}
function select(id){
  const i = id == null ? null : items.find(x=>x.id===id);
  if(i && (i.hidden || i.locked)) { applySelectionSet([]); render(); return; }
  applySelectionSet(id == null ? [] : [id]);
  render();
  const selectedItem = items.find(x=>x.id===id);
  if(!selectedItem){
    insp.className="hint";
    insp.textContent="Pick a tool below, then tap or drag on the canvas.";
    return;
  }

  insp.className="";
  const hasText = i.t === "text" || i.t === "button" || i.t === "comment";
  const fills = ["rect","ellipse","text","button","comment","frame"].includes(i.t);
  const strokes = ["rect","ellipse","line","pen","button","frame"].includes(i.t);
  const shapeLike = ["rect","ellipse","button","frame"].includes(i.t);
  const componentInfo = i.componentId ? '<div class="field"><label>Component</label><button type="button" id="detachInstanceBtn">Detach instance</button></div>' : "";
  const frameActions = i.t !== "frame" ? '<div class="field"><label>Frame</label><button type="button" id="attachFrameBtn">Add to selected frame</button></div>' : '<div class="field"><label>Frame</label><button type="button" id="detachFrameBtn">Detach from frame</button></div>';
  const content = [
    `<div class="field"><label>Type</label><strong style="display:block;padding:8px 0;color:#5144cf">${i.t.toUpperCase()}</strong></div>`,
    componentInfo,
    frameActions,
    hasText ? field("Text","f_text","text", i.text || "") : "",
    fills ? field("Fill","f_fill","color", i.fill || "#6558e8") : "",
    strokes ? field("Stroke","f_stroke","color", i.stroke || "#222222") : "",
    shapeLike ? field("Corner radius","f_rad","range", Number(i.rad ?? 8), {min:0, max:40, step:1}) : "",
    shapeLike ? field("Rotation","f_rot","range", Number(i.r ?? 0), {min:-180, max:180, step:1}) : "",
    field("X","f_x","number", Number(i.x ?? 0), {min:0, max:900, step:1}),
    field("Y","f_y","number", Number(i.y ?? 0), {min:0, max:620, step:1}),
    shapeLike ? field("Width","f_w","number", Number(i.w ?? 0), {min:0, max:900, step:1}) : "",
    shapeLike ? field("Height","f_h","number", Number(i.h ?? 0), {min:0, max:620, step:1}) : "",
    strokes ? field("Stroke width","f_sw","range", Number(i.sw ?? 2), {min:1, max:30, step:1}) : "",
    field("Opacity","f_op","range", Math.round((i.op ?? 1) * 100), {min:0, max:100, step:1}),
    hasText ? field("Font size","f_fs","number", Number(i.fs ?? (i.t === "button" ? 14 : 28)), {min:8, max:120, step:1}) : "",
    '<div class="field"><label>Align</label><div style="display:flex;flex-wrap:wrap;gap:6px"><button type="button" data-align="left">Left</button><button type="button" data-align="center">Center</button><button type="button" data-align="right">Right</button><button type="button" data-align="top">Top</button><button type="button" data-align="middle">Middle</button><button type="button" data-align="bottom">Bottom</button></div></div>',
    '<div class="field"><label>Distribute</label><div style="display:flex;flex-wrap:wrap;gap:6px"><button type="button" data-distribute="horizontal">Horiz.</button><button type="button" data-distribute="vertical">Vert.</button></div></div>',
    '<div class="field"><label>Layout</label><div style="display:flex;flex-wrap:wrap;gap:6px"><button type="button" data-auto="stack-h">Stack H</button><button type="button" data-auto="stack-v">Stack V</button><button type="button" data-auto="space-16">Gap 16</button><button type="button" data-auto="space-24">Gap 24</button></div></div>',
    '<div class="field"><label>Effects</label><div style="display:flex;flex-wrap:wrap;gap:8px"><label><input type="checkbox" data-prop-flag="sh" ' + (i.sh ? "checked" : "") + '> Drop shadow</label><label><input type="checkbox" data-prop-flag="an" ' + (i.an ? "checked" : "") + '> Pulse</label></div></div>',
    '<div class="field"><label>Layer</label><div style="display:flex;flex-wrap:wrap;gap:6px"><button type="button" data-layer-state="toggle-hide">' + (i.hidden ? 'Show' : 'Hide') + '</button><button type="button" data-layer-state="toggle-lock">' + (i.locked ? 'Unlock' : 'Lock') + '</button></div></div>',
    '<button class="delete" id="del">Delete element</button>'
  ].join("");

  insp.innerHTML = content;

  const bindProp = (selector, key, transform = v => v) => {
    const el = insp.querySelector(selector);
    if (!el) return;
    el.oninput = () => {
      const nextValue = transform(el.value);
      i[key] = nextValue;
      render();
      renderHandoffPanel();
    };
  };

  bindProp("#f_text", "text");
  bindProp("#f_fill", "fill");
  bindProp("#f_stroke", "stroke");
  bindProp("#f_rad", "rad", Number);
  bindProp("#f_rot", "r", Number);
  bindProp("#f_x", "x", Number);
  bindProp("#f_y", "y", Number);
  bindProp("#f_w", "w", Number);
  bindProp("#f_h", "h", Number);
  bindProp("#f_sw", "sw", Number);
  bindProp("#f_op", "op", v => Number(v) / 100);
  bindProp("#f_fs", "fs", Number);

  insp.querySelectorAll("[data-prop-flag]").forEach(flag => {
    flag.onchange = (event) => {
      const key = event.target.dataset.propFlag;
      i[key] = event.target.checked;
      render();
      renderHandoffPanel();
    };
  });

  const del = insp.querySelector("#del");
  if (del) del.onclick = () => remove();
  const detach = insp.querySelector("#detachInstanceBtn");
  if (detach) {
    detach.onclick = () => {
      delete i.componentId;
      delete i.sourceComponentId;
      render();
      select(i.id);
      saveCollabState();
    };
  }
  const attachToFrameBtn = insp.querySelector("#attachFrameBtn");
  if (attachToFrameBtn) {
    attachToFrameBtn.onclick = () => {
      const frame = items.find(x => x.t === "frame" && x.id !== i.id);
      if (!frame) return;
      i.parentId = frame.id;
      i.x = Math.max(20, (i.x ?? 0) - (frame.x ?? 0));
      i.y = Math.max(20, (i.y ?? 0) - (frame.y ?? 0));
      render();
      select(i.id);
      saveCollabState();
    };
  }
  const detachFrameBtn = insp.querySelector("#detachFrameBtn");
  if (detachFrameBtn) {
    detachFrameBtn.onclick = () => {
      const parent = getParent(i);
      if (!parent) return;
      i.x = (i.x ?? 0) + (parent.x ?? 0);
      i.y = (i.y ?? 0) + (parent.y ?? 0);
      delete i.parentId;
      render();
      select(i.id);
      saveCollabState();
    };
  }

  insp.querySelectorAll("[data-align]").forEach(btn => btn.onclick = () => alignSelection(btn.dataset.align));
  insp.querySelectorAll("[data-distribute]").forEach(btn => btn.onclick = () => distributeSelection(btn.dataset.distribute));
  insp.querySelectorAll("[data-auto]").forEach(btn => btn.onclick = () => {
    const action = btn.dataset.auto;
    if (action === "stack-h") stackSelection("horizontal", 24);
    else if (action === "stack-v") stackSelection("vertical", 24);
    else if (action === "space-16") stackSelection("horizontal", 16);
    else if (action === "space-24") stackSelection("vertical", 24);
    renderHandoffPanel();
  });
  insp.querySelectorAll("[data-layer-state]").forEach(btn => btn.onclick = () => {
    const state = btn.dataset.layerState;
    if (state === "toggle-hide") {
      i.hidden = !i.hidden;
      if (i.hidden) {
        const current = currentSelection();
        if (current.includes(i.id)) applySelectionSet(current.filter(id => id !== i.id));
      }
    }
    if (state === "toggle-lock") {
      i.locked = !i.locked;
      if (i.locked) {
        const current = currentSelection();
        if (current.includes(i.id)) applySelectionSet(current.filter(id => id !== i.id));
      }
    }
    render(); saveCollabState();
  });
}
function remove(){
  const ids = currentSelection();
  if(!ids.length)return;
  snap();
  items=items.filter(x=>!ids.includes(x.id));
  applySelectionSet([]); select(null);
}
insp.addEventListener("focusin",snap);

function handleCanvasPointerDown(e){
  if (drag && drag.pointerId === e.pointerId) return;
  const hit = e.target && (e.target === svg || (e.target.closest && svg.contains(e.target)) || svg.contains(e.target));
  if (!hit) return;
  const p=pt(e),g=e.target.closest ? e.target.closest("[data-id]") : null;
  const handle=e.target.closest ? e.target.closest("[data-handle]") : null;
  const groupHandle=e.target.closest ? e.target.closest("[data-selection-handle]") : null;
  const selectionBox = e.target.closest ? e.target.closest("[data-selection-box]") : null;
  svg.setPointerCapture(e.pointerId);
  if(tool==="select"){
    if(g){
      const i=items.find(x=>x.id===Number(g.dataset.id));
      if(i && i.locked){ e.preventDefault(); return; }
    }
    if(groupHandle){
      const ids = currentSelection();
      if(ids.length > 1){
        const startBounds = getSelectionBounds();
        const handle = groupHandle.dataset.selectionHandle;
        const anchorMap = {
          nw:{x:startBounds.x+startBounds.width,y:startBounds.y+startBounds.height},
          n:{x:startBounds.x+startBounds.width/2,y:startBounds.y+startBounds.height},
          ne:{x:startBounds.x,y:startBounds.y+startBounds.height},
          e:{x:startBounds.x,y:startBounds.y+startBounds.height/2},
          se:{x:startBounds.x,y:startBounds.y},
          s:{x:startBounds.x+startBounds.width/2,y:startBounds.y},
          sw:{x:startBounds.x+startBounds.width,y:startBounds.y},
          w:{x:startBounds.x+startBounds.width,y:startBounds.y+startBounds.height/2}
        };
        e.preventDefault();
        e.stopPropagation();
        drag={pointerId:e.pointerId, mode:"group-resize", ids, sx:p.x, sy:p.y, handle, startBounds, anchor: anchorMap[handle], startItems: ids.map(id => ({id, item: JSON.parse(JSON.stringify(items.find(x => x.id === id) || {}))}))};
        return;
      }
    }
    if(selectionBox){
      const ids = currentSelection();
      if(ids.length > 1){
        e.preventDefault();
        e.stopPropagation();
        drag={pointerId:e.pointerId, mode:"group-move", ids, sx:p.x, sy:p.y, start: ids.map(id => ({id, item: items.find(x => x.id === id)}))};
        return;
      }
    }
    if(handle){
      const itemId = Number(handle.closest("[data-id]")?.dataset.id || g?.dataset.id || sel);
      const i=items.find(x=>x.id===itemId); if(!i) return;
      e.preventDefault();
      e.stopPropagation();
      drag={pointerId:e.pointerId, mode:"resize",i,handle:handle.dataset.handle,sx:p.x,sy:p.y,startBounds:getItemBounds(i)};
      return;
    }
    if(!g){
      e.preventDefault();
      e.stopPropagation();
      drag={pointerId:e.pointerId, mode:"marquee", start:p, current:p, additive: !!(e.shiftKey || e.metaKey)};
      if(!drag.additive){ applySelectionSet([]); }
      return;
    }
    const i=items.find(x=>x.id===Number(g.dataset.id));
    if(document.getElementById("app").classList.contains("preview") && prototypeLinks[i.id] != null){
      e.preventDefault();
      goPage(Number(prototypeLinks[i.id]));
      return;
    }
    if(e.shiftKey || e.metaKey){
      e.preventDefault();
      e.stopPropagation();
      toggleSelection(i.id);
      return;
    }
    snap();select(i.id);
    e.preventDefault();
    e.stopPropagation();
    drag={pointerId:e.pointerId, mode:"move",i,sx:p.x,sy:p.y,ox:i.x,oy:i.y};
    return;
  }
  snap();
  const i={id:nid++,t:tool,x:snapValue(p.x),y:snapValue(p.y),w:0,h:0,fill:"#d9d4ff",stroke:"#6558e8",sw:2,text:""};
  if(tool==="line"){i.x2=0;i.y2=0;i.stroke="#222222";i.sw=3}
  if(tool==="pen"){i.pts=[[0,0]];i.stroke="#222222";i.sw=4}
  if(tool==="frame"){i.t="frame";i.w=240;i.h=180;i.fill="#ffffff";i.stroke="#dfe3eb";i.sw=1;i.rad=12}
  if(tool==="text"){i.text="Your headline";i.fill="#222222";i.x=snapValue(p.x);i.y=snapValue(p.y)}
  if(tool==="button"){i.text="Click me";i.fill="#6558e8";i.stroke="#ffffff"}
  items.push(i);
  drag={mode:"draw",i,sx:p.x,sy:p.y};
  if(tool==="text"||tool==="button"||tool==="frame"){drag=null;setTool("select");select(i.id);return}
  render();
}
svg.addEventListener("pointerdown", handleCanvasPointerDown);
document.addEventListener("pointerdown", handleCanvasPointerDown, true);
function handleDragPointerMove(e){
  if(!drag) return;
  if(drag.pointerId != null && e.pointerId !== drag.pointerId) return;
  const p=pt(e),i=drag.i;
  if(i && i.locked) return;
  if(drag.mode==="marquee"){
    drag.current = p;
    const left = Math.min(drag.start.x, p.x);
    const top = Math.min(drag.start.y, p.y);
    const right = Math.max(drag.start.x, p.x);
    const bottom = Math.max(drag.start.y, p.y);
    const selectionBox = {x:left, y:top, width:right-left, height:bottom-top};
    const ids = items.filter(item => {
      if(item.hidden || item.locked) return false;
      const bounds = getItemBounds(item);
      return rectIntersects(bounds, selectionBox);
    }).map(item => item.id);
    if(drag.additive){
      applySelectionSet([...new Set([...currentSelection(), ...ids])]);
    } else {
      applySelectionSet(ids);
    }
    render();
    return;
  }
  if(drag.mode==="move"){const snapped=applyObjectSnap(i,drag.ox+p.x-drag.sx,drag.oy+p.y-drag.sy); i.x=snapValue(snapped.x); i.y=snapValue(snapped.y)}
  else if(drag.mode==="group-move"){
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    drag.ids.forEach(id => {
      const item = items.find(x => x.id === id);
      if(!item || item.locked) return;
      const start = drag.start.find(s => s.id === id);
      if(!start) return;
      item.x = snapValue((start.item.x || 0) + dx);
      item.y = snapValue((start.item.y || 0) + dy);
    });
  }
  else if(drag.mode==="group-resize"){
    const startBounds = drag.startBounds;
    if(!startBounds) return;
    const anchor = drag.anchor || {x:startBounds.x,y:startBounds.y};
    const handle = drag.handle;
    const pointerX = p.x;
    const pointerY = p.y;
    let left = anchor.x;
    let top = anchor.y;
    let right = anchor.x;
    let bottom = anchor.y;
    if(handle === "nw"){ left = Math.min(anchor.x, pointerX); top = Math.min(anchor.y, pointerY); right = anchor.x; bottom = anchor.y; }
    else if(handle === "n"){ left = startBounds.x; right = startBounds.x + startBounds.width; top = Math.min(anchor.y, pointerY); bottom = anchor.y; }
    else if(handle === "ne"){ right = Math.max(anchor.x, pointerX); top = Math.min(anchor.y, pointerY); left = anchor.x; bottom = anchor.y; }
    else if(handle === "e"){ left = anchor.x; right = Math.max(anchor.x, pointerX); top = startBounds.y; bottom = startBounds.y + startBounds.height; }
    else if(handle === "se"){ right = Math.max(anchor.x, pointerX); bottom = Math.max(anchor.y, pointerY); left = anchor.x; top = anchor.y; }
    else if(handle === "s"){ left = startBounds.x; right = startBounds.x + startBounds.width; top = anchor.y; bottom = Math.max(anchor.y, pointerY); }
    else if(handle === "sw"){ left = Math.min(anchor.x, pointerX); bottom = Math.max(anchor.y, pointerY); right = anchor.x; top = anchor.y; }
    else if(handle === "w"){ left = Math.min(anchor.x, pointerX); right = anchor.x; top = startBounds.y; bottom = startBounds.y + startBounds.height; }
    const nextBounds = {x:Math.min(left,right), y:Math.min(top,bottom), width:Math.max(20, Math.abs(right-left)), height:Math.max(20, Math.abs(bottom-top))};
    const sx = nextBounds.width / Math.max(startBounds.width, 1);
    const sy = nextBounds.height / Math.max(startBounds.height, 1);
    drag.ids.forEach(id => {
      const item = items.find(x => x.id === id);
      if(!item || ["line","pen"].includes(item.t)) return;
      const start = drag.startItems.find(s => s.id === id);
      if(!start) return;
      const source = getItemBounds(start.item);
      const relX = (source.x - startBounds.x) / Math.max(startBounds.width, 1);
      const relY = (source.y - startBounds.y) / Math.max(startBounds.height, 1);
      const relW = source.width / Math.max(startBounds.width, 1);
      const relH = source.height / Math.max(startBounds.height, 1);
      const nextX = nextBounds.x + relX * nextBounds.width;
      const nextY = nextBounds.y + relY * nextBounds.height;
      const nextW = Math.max(12, nextBounds.width * relW);
      const nextH = Math.max(12, nextBounds.height * relH);
      item.x = snapValue(nextX);
      item.y = snapValue(nextY);
      if (item.t === "rect" || item.t === "ellipse" || item.t === "frame") {
        item.w = snapValue(nextW);
        item.h = snapValue(nextH);
      }
      if (item.t === "button" || item.t === "text") {
        item.x = snapValue(nextX);
        item.y = snapValue(nextY);
        item.w = snapValue(Math.max(nextW, item.t === "button" ? 90 : 80));
        item.h = snapValue(Math.max(nextH, 40));
      }
    });
  }
  else if(drag.mode==="resize"){
    const b=drag.startBounds;
    let x=b.x, y=b.y, w=b.width, h=b.height;
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if(drag.handle.includes("e")) w = Math.max(12, b.width + dx);
    if(drag.handle.includes("s")) h = Math.max(12, b.height + dy);
    if(drag.handle.includes("w")){ x = b.x + dx; w = Math.max(12, b.width - dx); }
    if(drag.handle.includes("n")){ y = b.y + dy; h = Math.max(12, b.height - dy); }
    if(i.t==="rect"||i.t==="ellipse"||i.t==="button"){
      i.x = snapValue(x); i.y = snapValue(y); i.w = snapValue(w); i.h = snapValue(h);
      if(i.t==="button") i.w = Math.max(90, i.w);
    }
  }
  else if(i.t==="rect"||i.t==="ellipse"){i.x=snapValue(Math.min(drag.sx,p.x));i.y=snapValue(Math.min(drag.sy,p.y));i.w=snapValue(Math.abs(p.x-drag.sx));i.h=snapValue(Math.abs(p.y-drag.sy))}
  else if(i.t==="line"){i.x2=snapValue(p.x-drag.sx);i.y2=snapValue(p.y-drag.sy)}
  else if(i.t==="pen"){i.pts.push([+(p.x-drag.sx).toFixed(1),+(p.y-drag.sy).toFixed(1)])}
  render();
}

svg.addEventListener("pointermove",handleDragPointerMove);
window.addEventListener("pointermove",handleDragPointerMove);
window.addEventListener("pointerup",endDrag);
window.addEventListener("pointercancel",endDrag);

function endDrag(){
  if(!drag)return;
  const i=drag.i,mode=drag.mode;
  if(mode === "marquee"){
    const dx = Math.abs(drag.current.x - drag.start.x);
    const dy = Math.abs(drag.current.y - drag.start.y);
    if(dx < 3 && dy < 3){
      if(!drag.additive) applySelectionSet([]);
      else if(!currentSelection().length) applySelectionSet([]);
    }
    drag = null;
    render();
    return;
  }
  drag=null;
  if(mode==="draw"){
    if((i.t==="rect"||i.t==="ellipse")&&(i.w<6||i.h<6)){i.w=140;i.h=90}
    if(i.t==="line"&&Math.hypot(i.x2,i.y2)<6){items=items.filter(x=>x!==i);render();return}
    if(i.t==="pen"&&i.pts.length<2)i.pts.push([0.1,0.1]);
    if(i.t!=="pen")setTool("select");
    if(i.t==="comment") i.text=i.text||"New note";
    select(i.id);
  }
}
svg.addEventListener("pointerup",endDrag);
svg.addEventListener("pointercancel",endDrag);

document.querySelectorAll("#tools button").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$("#undo").onclick=()=>{
  if(!hist.length)return;
  const s=JSON.parse(hist.pop());items=s.items;nid=s.nid;select(null);
};
document.addEventListener("keydown",e=>{
  if(e.target.tagName==="INPUT")return;
  if(e.key==="Delete"||e.key==="Backspace"){remove();return}
  if((e.ctrlKey||e.metaKey)&&e.key==="a"){e.preventDefault(); applySelectionSet(items.map(i=>i.id)); render(); return;}
  if((e.ctrlKey||e.metaKey)&&e.key==="z"){$("#undo").click();return}
  if((e.ctrlKey||e.metaKey)&&e.key==="ArrowRight"){const next = Math.min(pagesData.length-1, cur+1); if(next!==cur) goPage(next); return;}
  if((e.ctrlKey||e.metaKey)&&e.key==="ArrowLeft"){const next = Math.max(0, cur-1); if(next!==cur) goPage(next); return;}
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key) && !e.shiftKey && !e.metaKey && !e.ctrlKey){
    e.preventDefault();
    const step = grid ? gridSize : 10;
    const ids = currentSelection();
    ids.forEach(id => {
      const item = items.find(x => x.id === id);
      if(!item) return;
      if(e.key === "ArrowLeft") item.x = (item.x ?? 0) - step;
      if(e.key === "ArrowRight") item.x = (item.x ?? 0) + step;
      if(e.key === "ArrowUp") item.y = (item.y ?? 0) - step;
      if(e.key === "ArrowDown") item.y = (item.y ?? 0) + step;
    });
    render(); if(sel!=null) select(sel); saveCollabState(); return;
  }
  const t=KEYS[e.key.toLowerCase()];if(t&&!e.ctrlKey&&!e.metaKey)setTool(t);
});
$("#preview").onclick=()=>{
  const on=$("#app").classList.toggle("preview");
  $("#preview").textContent=on?"Exit preview":"Preview";
  if(on){sel=null;render()}
};

// starter content
items.push({id:nid++,t:"text",x:100,y:90,w:0,h:0,fill:"#222222",stroke:"#6558e8",sw:2,text:"Your headline"});
items.push({id:nid++,t:"button",x:124,y:150,w:0,h:0,fill:"#6558e8",stroke:"#ffffff",sw:2,text:"Click me"});
setTool("select");
const D=document,left=$(".left");
const pagesData=[{name:"Page 1",items:null}];let cur=0,pageBg="#ffffff",zoom=1;
let styles=[{name:"Primary",color:"#6558e8"},{name:"Ink",color:"#222222"}];
const cs=()=>items.find(x=>x.id===sel);
const rnd=()=>"#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0");
function mk(t,p){snap();const i={id:nid++,t,x:100,y:100,w:0,h:0,fill:"#d9d4ff",stroke:"#6558e8",sw:2,text:"",...p};items.push(i);select(i.id);return i}
function modal(title,text,note){
  const m=D.createElement("div");
  m.style.cssText="position:fixed;inset:0;background:#0007;z-index:50;display:grid;place-items:center;padding:16px";
  m.innerHTML=`<div style="background:#fff;border-radius:12px;padding:16px;width:min(560px,100%)"><h3>${title}</h3><textarea readonly style="width:100%;height:220px;font:12px monospace;border:1px solid #ddd;border-radius:6px;padding:8px"></textarea><p class="hint">${note||""}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="mbtn" id="mc">Copy</button><button class="mbtn" id="mx">Close</button></div></div>`;
  const ta=m.querySelector("textarea");ta.value=text;
  m.querySelector("#mx").onclick=()=>m.remove();
  m.querySelector("#mc").onclick=()=>{ta.select();try{navigator.clipboard.writeText(text)}catch(e){}};
  D.body.append(m);
}
function svgCode(sc){
  const c=svg.cloneNode(true);c.querySelectorAll("[stroke-dasharray]").forEach(n=>n.remove());
  c.setAttribute("width",900*sc);c.setAttribute("height",620*sc);c.removeAttribute("style");
  c.setAttribute("style","background:"+pageBg);c.setAttribute("xmlns","http://www.w3.org/2000/svg");return c.outerHTML;
}

/* shape / render extensions: comments, rotation, radius, font size, shadow, animation, grid, page color */
const _shape=shape;
shape=function(i){
  if(i.t==="comment")return `<g data-id="${i.id}" transform="translate(${i.x} ${i.y})" style="cursor:pointer"><g opacity="${i.op??1}"><circle cx="14" cy="14" r="14" fill="#f24822"/><text x="14" y="15" text-anchor="middle" dominant-baseline="central" font-size="14">💬</text><text x="36" y="19" font-size="13" fill="#222">${esc(i.text)}</text></g></g>`;
  let s=_shape(i);const cx=(i.w||0)/2,cy=(i.h||0)/2;
  s=s.replace(`translate(${i.x} ${i.y})`,`translate(${i.x} ${i.y}) rotate(${i.r||0} ${cx} ${cy})`);
  if(i.rad!=null)s=s.replace('rx="6"',`rx="${i.rad}"`);
  if(i.fs)s=s.replace(/font-size="\d+"/,`font-size="${i.fs}"`);
  if(i.sh)s=s.replace('style="cursor:','style="filter:drop-shadow(0 6px 8px #0006);cursor:');
  if(i.an)s=s.replace('<g opacity=','<g style="animation:pulse 1s ease-in-out infinite" opacity=');
  return s;
};
const _render=render;
render=function(){
  _render();svg.style.background=pageBg;
  if(grid){
    const existing=svg.querySelector("#gp"); if(existing) existing.remove();
    svg.insertAdjacentHTML("afterbegin",'<defs><pattern id="gp" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#f24822" stroke-opacity=".3"/></pattern></defs><rect width="900" height="620" fill="url(#gp)" pointer-events="none"/>');
  }
};

/* inspector extensions: position, size, rotation, radius, font size, align, effects */
const _select=select;
select=function(id){
  _select(id);const i=items.find(x=>x.id===id);if(!i)return;
  const f=(l,k,v,t="number")=>`<div class="field"><label>${l}</label><input data-k="${k}" type="${t}" value="${esc(String(t==="number"?Math.round(v):v))}"></div>`;
  const shp=i.t==="rect"||i.t==="ellipse",tx=i.t==="text"||i.t==="button";
  const h=`<div class="field"><label>Align to page</label><div style="display:flex;gap:4px">${["⇤","↔","⇥","⤒","↕","⤓"].map((a,n)=>`<button data-al="${n}" style="flex:1;padding:6px">${a}</button>`).join("")}</div></div>`
   +`<div class="field"><label>Layer order</label><div style="display:flex;gap:4px"><button data-z="-1" style="flex:1;padding:6px">Backward</button><button data-z="1" style="flex:1;padding:6px">Forward</button></div><input data-zi type="number" min="1" value="${items.indexOf(i)+1}" title="Z-Index" style="margin-top:6px;width:100%;padding:8px;border:1px solid #333;border-radius:6px"></div>`
   +(i.t==="comment"?f("Comment","text",i.text,"text"):"")
   +f("X","x",i.x)+f("Y","y",i.y)+(shp?f("Width","w",i.w)+f("Height","h",i.h):"")
   +f("Rotation °","r",i.r||0)+(i.t==="rect"?f("Corner radius","rad",i.rad??6):"")+(tx?f("Font size","fs",i.fs||(i.t==="text"?28:14)):"")
   +`<label style="display:block;margin:8px 0"><input type="checkbox" data-c="sh" ${i.sh?"checked":""}> Drop shadow</label><label style="display:block;margin:8px 0"><input type="checkbox" data-c="an" ${i.an?"checked":""}> Pulse animation</label>`;
  $("#del").insertAdjacentHTML("beforebegin",h);
  insp.querySelectorAll("[data-k]").forEach(el=>el.oninput=()=>{i[el.dataset.k]=el.type==="number"?Number(el.value)||0:el.value;render()});
  insp.querySelectorAll("[data-c]").forEach(el=>el.onchange=()=>{i[el.dataset.c]=el.checked;render()});
  insp.querySelectorAll("[data-al]").forEach(el=>el.onclick=()=>{
    snap();const g=svg.querySelector(`[data-id="${i.id}"]>g`),b=g.getBBox(),n=+el.dataset.al;
    if(n<3)i.x=[0,(900-b.width)/2,900-b.width][n]-b.x;else i.y=[0,(620-b.height)/2,620-b.height][n-3]-b.y;
    render();select(i.id);
  });
};

/* frame + comment tools, code view */
svg.addEventListener("pointerdown",()=>{
  if(!drag||!drag.i)return;const i=drag.i;
  if(tool==="frame"){i.t="rect";i.frame=true;i.fill="#ffffff";i.stroke="#bbbbbb";i.sw=1;i.rad=0}
  if(tool==="comment")i.text="New comment";
});
const tl=$("#tools");
tl.insertAdjacentHTML("beforeend",'<button data-tool="comment" title="Comment (C)">💬</button><button id="codeBtn" title="Code">{ }</button>');
tl.querySelector("[data-tool=select]").insertAdjacentHTML("afterend",'<button data-tool="frame" title="Frame (F)">#</button>');
tl.querySelectorAll("[data-tool=frame],[data-tool=comment]").forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
KEYS.f="frame";KEYS.c="comment";
$("#codeBtn").onclick=()=>{sel=null;render();modal("Code",`<!doctype html>\n<html><body style="margin:0">\n${svgCode(1)}\n</body></html>`,"HTML with inline SVG for the current page.")};

/* header: menu, zoom, share, avatar */
$("#undo").textContent="↶";
const hb=$("#preview");
if(!document.getElementById("menuBtn")) $("#undo").insertAdjacentHTML("beforebegin",'<button id="menuBtn">☰</button>');
if(!document.getElementById("zoom")) hb.insertAdjacentHTML("beforeend",'<select id="zoom" class="mini-select" title="Zoom"><option value="0.5">50%</option><option value="1" selected>100%</option><option value="1.5">150%</option><option value="2">200%</option><option value="2.5">250%</option><option value="3">300%</option></select>');
if(!document.getElementById("share")) hb.insertAdjacentHTML("afterend",'<button id="share" class="utility-btn">Share</button>');
if(!document.querySelector(".avatar")) hb.insertAdjacentHTML("afterend",'<div class="avatar" aria-label="Current user">R</div>');
$("#menuBtn").onclick=()=>left.classList.toggle("open");
$("#zoom").onchange=e=>{zoom=+e.target.value;$(".page").style.width=zoom===1?"":`min(${900*zoom}px,${100*zoom}%)`};
$("#share").onclick=()=>modal("Share",location.href,"Anyone with this link can view the published page.");
hb.textContent="▷ Preview";
const _pv=hb.onclick;hb.onclick=()=>{_pv();hb.textContent=$("#app").classList.contains("preview")?"Exit preview":"▷ Preview"};

/* left panel tabs: File / Assets / Tools / Variables / Agent */
const pFile=D.createElement("div");while(left.firstChild)pFile.append(left.firstChild);
const mkp=()=>{const d=D.createElement("div");d.hidden=true;return d};
const pAssets=mkp(),pTools=mkp(),pVars=mkp(),pAgent=mkp();
const names=["File","Assets","Tools","Vars","Agent"],panels=[pFile,pAssets,pTools,pVars,pAgent];
const tabs=D.createElement("div");tabs.className="tabs";
names.forEach((n,k)=>{const b=D.createElement("button");b.textContent=n;b.onclick=()=>{panels.forEach((p,j)=>p.hidden=j!==k);[...tabs.children].forEach((c,j)=>c.classList.toggle("on",j===k))};tabs.append(b)});
left.append(tabs,...panels);tabs.children[0].click();
pFile.prepend(Object.assign(D.createElement("div"),{innerHTML:'<input id="fname" value="Untitled" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:14px"><h3>Pages <button class="mbtn" id="addPage" style="float:right;padding:0 8px">+</button></h3><div id="pages" style="margin-bottom:18px"></div>'}));
const pg=$("#pages");
function drawPages(){pg.innerHTML="";pagesData.forEach((p,n)=>{const b=D.createElement("button");b.className="layer"+(n===cur?" active":"");b.textContent=p.name;b.onclick=()=>goPage(n);pg.append(b)})}
function goPage(n){
  const next = Math.max(0, Math.min(pagesData.length - 1, n));
  pagesData[cur].items = items;
  cur = next;
  items = pagesData[cur].items || [];
  hist = [];
  if(document.getElementById("fname")) document.getElementById("fname").value = pagesData[cur].name;
  select(null);
  drawPages();
}
$("#addPage").onclick=()=>{pagesData.push({name:"Page "+(pagesData.length+1),items:[]});goPage(pagesData.length-1)};
drawPages();

/* assets */
const LIBS=[
 ["iOS and iPadOS 27 UI Kit",[["Nav bar",()=>{mk("rect",{w:360,h:56,fill:"#f2f2f7",stroke:"#d1d1d6",sw:1,rad:0});mk("text",{x:150,y:105,fs:20,fill:"#222222",text:"Title"})}],["Tab bar",()=>mk("rect",{y:480,w:360,h:60,fill:"#f2f2f7",stroke:"#d1d1d6",sw:1,rad:0})]]],
 ["Material 3 Design Kit",[["Filled button",()=>mk("button",{fill:"#6750a4",stroke:"#ffffff",text:"Filled button"})],["FAB",()=>{mk("ellipse",{w:56,h:56,fill:"#eaddff",stroke:"#6750a4",sh:true});mk("text",{x:118,y:101,fs:28,fill:"#6750a4",text:"+"})}]]],
 ["Simple Design System",[["Card",()=>{mk("rect",{w:240,h:140,fill:"#ffffff",stroke:"#dddddd",sw:1,rad:12,sh:true});mk("text",{x:116,y:116,fs:20,fill:"#222222",text:"Card title"})}],["Heading",()=>mk("text",{fs:40,fill:"#222222",text:"Heading"})],["Input",()=>{mk("rect",{w:220,h:40,fill:"#ffffff",stroke:"#cccccc",sw:1,rad:8});mk("text",{x:110,y:101,fs:14,fill:"#888888",text:"Placeholder"})}]]]];
pAssets.innerHTML='<h3>Assets</h3><input id="aq" placeholder="Search all libraries" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"><div id="alist"></div>';
function drawAssets(){const q=$("#aq").value.toLowerCase(),el=$("#alist");el.innerHTML="";
  LIBS.forEach(([n,cs_])=>{const c=cs_.filter(x=>x[0].toLowerCase().includes(q)||n.toLowerCase().includes(q));if(!c.length)return;
    const h=D.createElement("h3");h.style.marginTop="16px";h.textContent=n;el.append(h);
    c.forEach(([cn,fn])=>{const b=D.createElement("button");b.className="add-button";b.textContent="◇  "+cn;b.onclick=()=>{fn();if(innerWidth<=800)left.classList.remove("open")};el.append(b)})})}
$("#aq").oninput=drawAssets;drawAssets();

/* tools */
const TOOLS=[["Randomize colors","Shuffle every fill",()=>{snap();items.forEach(i=>{if(i.t!=="line"&&i.t!=="pen")i.fill=rnd()});render()}],
 ["Bloom","Scatter 12 soft circles",()=>{snap();for(let k=0;k<12;k++){const s=20+Math.random()*60;items.push({id:nid++,t:"ellipse",x:Math.random()*800,y:Math.random()*540,w:s,h:s,fill:rnd(),stroke:"#ffffff",sw:1,text:"",op:.8})}render()}],
 ["Mirror layout","Flip horizontally",()=>{snap();items.forEach(i=>{const g=svg.querySelector(`[data-id="${i.id}"]>g`),b=g?g.getBBox():{x:0,width:0};i.x=900-i.x-2*b.x-b.width});render()}],
 ["Clear canvas","Remove everything",()=>{snap();items=[];select(null)}]];
pTools.innerHTML='<h3>Tools</h3><input id="tq" placeholder="Search all tools" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px"><div id="tlist" style="margin-top:10px"></div>';
function drawTools(){const q=$("#tq").value.toLowerCase(),el=$("#tlist");el.innerHTML="";
  TOOLS.filter(t=>t[0].toLowerCase().includes(q)).forEach(([n,d,fn])=>{const b=D.createElement("button");b.className="row";b.innerHTML=`<span><b>${n}</b><br><span class="hint">${d}</span></span>`;b.onclick=fn;el.append(b)})}
$("#tq").oninput=drawTools;drawTools();

/* variables + styles */
function applyColor(c){const i=cs();if(!i)return;snap();i[i.t==="line"||i.t==="pen"?"stroke":"fill"]=c;render();select(i.id)}
function drawVars(){
  pVars.innerHTML='<h3>Variables <button class="mbtn" id="addVar" style="float:right;padding:0 8px">+</button></h3><p class="hint">Tap a color to apply it to the selected element.</p>';
  const sw=$("#swatches");if(sw)sw.innerHTML="";
  styles.forEach(s=>{
    const b=D.createElement("button");b.className="row";b.innerHTML=`<span class="sw" style="background:${s.color}"></span>${esc(s.name)} <span class="hint">${s.color}</span>`;b.onclick=()=>applyColor(s.color);pVars.append(b);
    if(sw){const c=D.createElement("button");c.className="sw";c.title=s.name;c.style.background=s.color;c.onclick=()=>applyColor(s.color);sw.append(c)}
  });
  $("#addVar").onclick=()=>addStyle();
}
function addStyle(){const i=cs();styles.push({name:"Color "+(styles.length+1),color:i?(i.t==="line"||i.t==="pen"?i.stroke:i.fill):"#0d99ff"});drawVars()}

/* agent */
pAgent.innerHTML='<h3>Agent</h3><div class="log" id="log"><p>Ask for changes, e.g. add a red circle, add text "Hello", make it bigger, delete, undo.</p></div><input id="aask" placeholder="Ask for changes" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px">';
const hex=w=>{const x=D.createElement("canvas").getContext("2d");x.fillStyle="#010101";x.fillStyle=w;return x.fillStyle==="#010101"?null:x.fillStyle};
function say(t,me){const p=D.createElement("p");if(me)p.className="me";p.textContent=t;$("#log").append(p)}
function agent(txt){
  say(txt,1);const t=txt.toLowerCase(),q=txt.match(/["“'](.+?)["”']/),col=t.split(/\W+/).map(hex).find(Boolean);
  const m=t.match(/(rect|square|circle|ellipse|line|text|button|frame|comment)/);
  if(/^(add|create|make|draw)/.test(t)&&(m||/^(add|create)/.test(t))){
    const k=m?m[1]:"rect",o={};if(col)o.fill=col;
    if(k==="rect"||k==="square"){mk("rect",{w:140,h:k==="square"?140:90,...o})}
    else if(k==="circle"||k==="ellipse")mk("ellipse",{w:100,h:100,...o});
    else if(k==="line")mk("line",{x2:200,y2:0,stroke:col||"#222222",sw:3});
    else if(k==="text")mk("text",{text:q?q[1]:"New text",fill:col||"#222222"});
    else if(k==="button")mk("button",{text:q?q[1]:"Click me",fill:col||"#6558e8",stroke:"#ffffff"});
    else if(k==="frame")mk("rect",{w:300,h:200,fill:"#ffffff",stroke:"#bbbbbb",sw:1,rad:0,frame:true});
    else mk("comment",{text:q?q[1]:"New comment"});
    return say("Added a "+k+".");
  }
  const i=cs();
  if(/delete|remove/.test(t))return i?(remove(),say("Deleted.")):say("Select something first.");
  if(/undo/.test(t))return $("#undo").click(),say("Undone.");
  if(!i)return say("Select an element first, or ask me to add one.");
  snap();
  if(/resize/.test(t)){i.w=200;i.h=200}
  else if(/bigger|larger|grow/.test(t)){i.w*=1.25;i.h*=1.25;i.fs=Math.round((i.fs||(i.t==="text"?28:14))*1.25)}
  else if(/smaller|shrink/.test(t)){i.w*=.8;i.h*=.8;i.fs=Math.round((i.fs||(i.t==="text"?28:14))*.8)}
  else if(col){i[i.t==="line"||i.t==="pen"?"stroke":"fill"]=col}
  else return say("I can add shapes, recolor, resize, delete and undo.");
  render();select(i.id);say("Done.");
}
$("#aask").onkeydown=e=>{if(e.key==="Enter"&&e.target.value.trim()){agent(e.target.value.trim());e.target.value=""}};

/* right panel: page, styles, export */
const ex=D.createElement("div");
ex.innerHTML=`<div class="sec"><h3>Page</h3><div class="field"><input id="pbg" type="color" value="#ffffff"></div></div>
<div class="sec"><h3>Styles <span><button class="mbtn" id="stPlus" style="padding:0 8px">+</button><span class="menu" id="stMenu" hidden></span></span></h3><div id="swatches" style="display:flex;flex-wrap:wrap;gap:8px"></div></div>
<div class="sec"><h3>Export</h3><div style="display:flex;gap:6px"><select id="exs"><option value="1">1x</option><option value="2">2x</option></select><button class="mbtn" id="exb" style="flex:1">Export SVG</button></div></div>`;
$(".right").append(ex);
$("#pbg").oninput=e=>{pageBg=e.target.value;render()};
const menu=$("#stMenu");
const ACT={Text:i=>{i.fs=i.fs?0:40},Color:()=>addStyle(),Effect:i=>{i.sh=!i.sh},Animation:i=>{i.an=!i.an},"Layout guide":()=>{grid=!grid}};
menu.innerHTML=Object.keys(ACT).map(k=>`<button>${k}</button>`).join("");
$("#stPlus").onclick=()=>menu.hidden=!menu.hidden;
menu.querySelectorAll("button").forEach(b=>b.onclick=()=>{const i=cs(),a=ACT[b.textContent];menu.hidden=true;if(i||/Color|Layout/.test(b.textContent)){if(i&&!/Color|Layout/.test(b.textContent))snap();a(i);render();if(i)select(i.id)}});
$("#exb").onclick=()=>{sel=null;render();modal("Export SVG",svgCode(+$("#exs").value),"Copy this SVG into a .svg file. PNG and PDF are not available in published pages.")};
/* pan: hand tool, or drag empty space in Move mode */
const area=$(".canvas-area");let pan=null;
tl.querySelector("[data-tool=select]").insertAdjacentHTML("afterend",'<button data-tool="hand" title="Pan (H)">✋</button>');
tl.querySelector("[data-tool=hand]").onclick=()=>setTool("hand");KEYS.h="hand";
svg.addEventListener("pointerdown",e=>{
  if(!(tool==="hand"||(tool==="select"&&!e.target.closest("[data-id]"))))return;
  e.stopImmediatePropagation();svg.setPointerCapture(e.pointerId);
  pan={x:e.clientX,y:e.clientY,l:area.scrollLeft,t:area.scrollTop,moved:false};
},true);
svg.addEventListener("pointermove",e=>{
  if(!pan)return;const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
  if(Math.abs(dx)+Math.abs(dy)>4)pan.moved=true;
  area.scrollLeft=pan.l-dx;area.scrollTop=pan.t-dy;
});
const endPan=()=>{if(pan&&!pan.moved&&tool==="select")select(null);pan=null};
svg.addEventListener("pointerup",endPan);svg.addEventListener("pointercancel",endPan);
/* pinch to zoom */
area.style.touchAction="pan-x pan-y";
const ptrs=new Map();let pinch=null,raf=0;
function setZoom(z,mx,my){
  z=Math.min(3,Math.max(0.3,z));if(Math.abs(z-zoom)<0.005)return;const r=z/zoom;zoom=z;
  $(".page").style.width=`min(${900*z}px,${100*z}%)`;
  area.scrollLeft=(area.scrollLeft+mx)*r-mx;area.scrollTop=(area.scrollTop+my)*r-my;
  const sel_=$("#zoom");let o=sel_.querySelector("#zc");
  if(o)o.remove();
  const pre=[...sel_.options].find(x=>Math.abs(+x.value-z)<0.01);
  if(pre)sel_.value=pre.value;
  else{o=new Option(Math.round(z*100)+"%",z);o.id="zc";const nx=[...sel_.options].find(x=>+x.value>z);sel_.add(o,nx||null);sel_.value=z}
}
const dist=()=>{const [a,b]=[...ptrs.values()];return{d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
area.addEventListener("pointerdown",e=>{
  if(e.pointerType==="mouse")return;
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){
    if(drag&&drag.mode==="draw"){items=items.filter(x=>x!==drag.i);hist.pop()}
    drag=null;pan=null;pinch={d:dist().d,z:zoom};render();
  }
  if(ptrs.size>=2)e.stopPropagation();
},true);
area.addEventListener("pointermove",e=>{
  if(!ptrs.has(e.pointerId))return;
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size>=2&&pinch){
    e.stopPropagation();const c=dist(),r=area.getBoundingClientRect();
    const zz=pinch.z*c.d/pinch.d,zx=c.x-r.left,zy=c.y-r.top;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>setZoom(zz,zx,zy));
  }
},true);
const endP=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null};
area.addEventListener("pointerup",endP,true);area.addEventListener("pointercancel",endP,true);
/* floating edit bar for the selected element */
const stage=$(".stage"),bar=D.createElement("div");bar.className="ebar";bar.hidden=true;stage.append(bar);
function place(){
  const g=sel!=null&&cs()&&svg.querySelector(`[data-id="${sel}"]`);
  if(!g){bar.hidden=true;return}
  bar.hidden=false;
  const r=g.getBoundingClientRect(),s=stage.getBoundingClientRect(),w=bar.offsetWidth,h=bar.offsetHeight;
  let t=r.top-s.top-h-10;if(t<8)t=r.bottom-s.top+10;
  t=Math.min(t,s.height-h-70);
  bar.style.left=Math.max(8,Math.min(s.width-w-8,r.left+r.width/2-s.left-w/2))+"px";
  bar.style.top=Math.max(8,t)+"px";
}
function buildBar(){
  const i=cs();bar.innerHTML="";if(!i){place();return}
  const key=i.t==="line"||i.t==="pen"?"stroke":"fill",tx=["text","button","comment"].includes(i.t);
  let h="";
  if(tx)h+=`<input type="text" id="eb_t" value="${esc(i.text)}">`;
  if(/^#[0-9a-f]{6}$/i.test(i[key]))h+=`<input type="color" id="eb_c" value="${i[key]}">`;
  h+=`<input type="range" id="eb_o" min="10" max="100" value="${Math.round((i.op??1)*100)}"><button id="eb_d" title="Duplicate">⧉</button><button id="eb_x" title="Delete">🗑</button><button id="eb_m" title="More options">⚙</button>`;
  bar.innerHTML=h;
  const on=(id,fn)=>{const e=bar.querySelector(id);if(e){e.onfocus=snap;e.oninput=fn}};
  on("#eb_t",e=>{i.text=e.target.value;render()});
  on("#eb_c",e=>{i[key]=e.target.value;render()});
  on("#eb_o",e=>{i.op=e.target.value/100;render()});
  bar.querySelector("#eb_d").onclick=()=>{snap();const c={...i,id:nid++,x:i.x+20,y:i.y+20};if(i.pts)c.pts=i.pts.map(p=>[...p]);items.push(c);select(c.id)};
  bar.querySelector("#eb_x").onclick=()=>remove();
  bar.querySelector("#eb_m").onclick=()=>$(".right").classList.toggle("big");
  place();
}
const _s3=select;select=function(id){_s3(id);buildBar()};
const _r3=render;render=function(){_r3();place()};
area.addEventListener("scroll",place);addEventListener("resize",place);
new ResizeObserver(place).observe(svg);
/* Canvas Pro behaviours: wheel zoom, alt/middle-drag pan, layer order */
area.addEventListener("wheel",e=>{e.preventDefault();const r=area.getBoundingClientRect();setZoom(zoom*(e.deltaY>0?0.9:1.1),e.clientX-r.left,e.clientY-r.top)},{passive:false});
svg.addEventListener("pointerdown",e=>{
  if(!(e.button===1||e.altKey))return;
  e.stopImmediatePropagation();svg.setPointerCapture(e.pointerId);
  pan={x:e.clientX,y:e.clientY,l:area.scrollLeft,t:area.scrollTop,moved:true};
},true);
insp.addEventListener("click",e=>{
  const z=e.target.dataset&&e.target.dataset.z;if(!z||sel==null)return;
  const k=items.findIndex(x=>x.id===sel),n=k+Number(z);
  if(n<0||n>=items.length)return;
  snap();[items[k],items[n]]=[items[n],items[k]];render();
});
/* resize + rotate handles, double-click to edit text */
let hd=null;
const _r4=render;
render=function(){
  _r4();
  const i=cs(),g=i&&svg.querySelector(`[data-id="${sel}"]`);if(!g)return;
  const b=g.firstElementChild.getBBox(),sc=svg.getBoundingClientRect().width/900||1,r=Math.max(6,13/sc),A="#6558e8",mx=b.x+b.width/2;
  let h=`<line x1="${mx}" y1="${b.y-4}" x2="${mx}" y2="${b.y-r*2.4}" stroke="${A}" stroke-width="${1.5/sc}"/><circle data-h="rot" cx="${mx}" cy="${b.y-r*2.4}" r="${r}" fill="#fff" stroke="${A}" stroke-width="${2/sc}" style="cursor:grab"/>`;
  if(i.t==="rect"||i.t==="ellipse")h+=`<rect data-h="se" x="${b.x+b.width+4-r}" y="${b.y+b.height+4-r}" width="${r*2}" height="${r*2}" rx="${r/3}" fill="#fff" stroke="${A}" stroke-width="${2/sc}" style="cursor:nwse-resize"/>`;
  g.insertAdjacentHTML("beforeend",h);place();
};
new ResizeObserver(()=>render()).observe(svg);
svg.addEventListener("pointerdown",e=>{
  const k=e.target.dataset&&e.target.dataset.h;if(!k||!cs())return;
  e.stopImmediatePropagation();svg.setPointerCapture(e.pointerId);snap();
  const i=cs();hd={k,i,p:pt(e),w:i.w,h:i.h};
},true);
svg.addEventListener("pointermove",e=>{
  if(!hd)return;const p=pt(e),i=hd.i;
  if(hd.k==="rot"){const cx=i.x+(i.w||0)/2,cy=i.y+(i.h||0)/2;i.r=Math.round(Math.atan2(p.y-cy,p.x-cx)*180/Math.PI+90)}
  else{const a=-(i.r||0)*Math.PI/180,dx=p.x-hd.p.x,dy=p.y-hd.p.y;i.w=Math.max(10,hd.w+dx*Math.cos(a)-dy*Math.sin(a));i.h=Math.max(10,hd.h+dx*Math.sin(a)+dy*Math.cos(a))}
  render();
});
svg.addEventListener("pointerup",()=>{hd=null});svg.addEventListener("pointercancel",()=>{hd=null});
svg.addEventListener("dblclick",e=>{
  const g=e.target.closest("[data-id]");if(!g)return;
  select(Number(g.dataset.id));const t=bar.querySelector("#eb_t");if(t){t.focus();t.select()}
});
insp.addEventListener("change",e=>{
  if(!e.target.hasAttribute("data-zi")||sel==null)return;
  const k=items.findIndex(x=>x.id===sel),n=Math.min(items.length,Math.max(1,Number(e.target.value)||1))-1;
  snap();const [it]=items.splice(k,1);items.splice(n,0,it);render();select(sel);
});
drawVars();render();
registerDesignSystem();
setResponsiveControls();
setupCollab();
