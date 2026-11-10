/* وثيق — editor: viewer, page panel, overlay tools, properties, forms, search, undo */
(function(){
const E = window.E = { doc:null, zoom:1, tool:'select', sel:null, hist:[], redo:[], cur:0, selPages:new Set(), style:{} };
const {$, $$, h} = U;
const DPR = () => Math.min(window.devicePixelRatio||1, 2);

E.TOOLS = [
  {id:'select', ico:'select'}, {id:'edittext', ico:'edittext'}, {id:'text', ico:'addtext'},
  {id:'highlight', ico:'highlight', box:1}, {id:'underline', ico:'underline', box:1}, {id:'strike', ico:'strike', box:1},
  {id:'rect', ico:'rect', box:1}, {id:'ellipse', ico:'ellipse', box:1}, {id:'line', ico:'line', line:1}, {id:'arrow', ico:'arrow', line:1}, {id:'pen', ico:'pen'},
  {id:'note', ico:'note'}, {id:'image', ico:'image'}, {id:'sign', ico:'sign'}, {id:'stamp', ico:'stamp'}, {id:'link', ico:'link', box:1},
  {id:'whiteout', ico:'whiteout', box:1}, {id:'redact', ico:'redact', box:1}, {id:'field', ico:'field', box:1}, {id:'check', ico:'check', box:1}
];
const toolDef = id => E.TOOLS.find(x=>x.id===id);
E.defaults = {
  text:{font:'IBM Plex Sans Arabic', size:14, color:'#111111', bold:false, italic:false, align:'start', bg:false},
  highlight:{color:'#ffd400'}, underline:{color:'#d32f2f', strokeW:1.2}, strike:{color:'#d32f2f', strokeW:1.2},
  rect:{color:'#d32f2f', strokeW:2, fill:'none'}, ellipse:{color:'#d32f2f', strokeW:2, fill:'none'},
  line:{color:'#d32f2f', strokeW:2}, arrow:{color:'#d32f2f', strokeW:2}, pen:{color:'#1a3fa8', strokeW:2},
  note:{color:'#f5b400'}, whiteout:{fill:'#ffffff'}
};

/* ---------- open / close ---------- */
E.open = async function(doc){
  if (E.doc && E.doc !== doc) M.destroyDoc(E.doc);
  E.doc = doc; E.sel = null; E.hist = []; E.redo = []; E.cur = 0; E.selPages.clear(); E.matches = []; E.mi = -1;
  doc.origName = doc.name;
  $('#emptyEd').hidden = true; $('#pages').hidden = false; $('#btnSave').hidden = false;
  $('#docname').textContent = doc.name;
  App.go('editor'); document.body.classList.add('ed');
  await E.fitWidth(true);
  E.renderThumbs(); E.renderProps(); E.updUndo();
};
E.close = function(){ M.destroyDoc(E.doc); E.doc = null; $('#pages').innerHTML=''; $('#pages').hidden = true; $('#emptyEd').hidden = false; $('#btnSave').hidden = true; $('#thumbList').innerHTML=''; $('#docname').textContent=''; E.renderProps(); };

/* ---------- history ---------- */
const snapshot = () => JSON.stringify(E.doc.pages);
E.snap = function(){ if (!E.doc) return; E.hist.push(snapshot()); if (E.hist.length>60) E.hist.shift(); E.redo = []; E.doc.dirty = true; E.updUndo(); };
E.undo = function(){ if (!E.hist.length) return; E.redo.push(snapshot()); E.doc.pages = JSON.parse(E.hist.pop()); E.sel = null; E.rebuild(); };
E.redoFn = function(){ if (!E.redo.length) return; E.hist.push(snapshot()); E.doc.pages = JSON.parse(E.redo.pop()); E.sel = null; E.rebuild(); };
E.updUndo = function(){ $('#tbUndo').disabled = !E.hist.length; $('#tbRedo').disabled = !E.redo.length; };
E.rebuild = function(){ E.renderPages(); E.renderThumbs(); E.renderProps(); E.updUndo(); };

/* ---------- zoom & page rendering ---------- */
E.fitWidth = async function(initial){
  if (!E.doc) return;
  const vw = $('#viewer').clientWidth - 40; const maxW = Math.max(...E.doc.pages.map(p=>M.dispSize(p)[0]));
  E.setZoom(Math.max(0.25, Math.min(2.2, vw / maxW)), initial);
};
E.setZoom = function(z, keep){
  E.zoom = Math.max(0.25, Math.min(5, z)); $('#zoomv').textContent = Math.round(E.zoom*100)+'%';
  E.renderPages();
};
let io, ioFree;
E.renderPages = function(){
  const wrap = $('#pages'); if (!E.doc) return;
  const st = $('#viewer').scrollTop;
  wrap.innerHTML = '';
  if (io) io.disconnect(); if (ioFree) ioFree.disconnect();
  io = new IntersectionObserver(ents=>{ for (const en of ents){ if (en.isIntersecting) paintPage(en.target); } }, {root:$('#viewer'), rootMargin:'600px 0px'});
  /* pages far from view give their canvas memory back (repainted when they come near again) */
  ioFree = new IntersectionObserver(ents=>{ for (const en of ents){ if (!en.isIntersecting && en.target.dataset.painted){ const c = en.target.querySelector('canvas.pc'); try { en.target._task && en.target._task.cancel(); } catch(e){} c.width = c.height = 0; en.target.dataset.painted = ''; } } }, {root:$('#viewer'), rootMargin:'2400px 0px'});
  E.doc.pages.forEach((p, idx)=>{
    const [dw, dh] = M.dispSize(p);
    const el = h('div', {class:'page', 'data-id':p.id, style:{width:dw*E.zoom+'px', height:dh*E.zoom+'px'}},
      h('span', {class:'pn'}, String(idx+1)), h('canvas', {class:'pc'}), h('div', {class:'hl'}), h('div', {class:'ov'}));
    wrap.append(el); io.observe(el); ioFree.observe(el);
    E.renderOverlay(p);
  });
  $('#viewer').scrollTop = st;
  E.applyToolCursor(); E.drawMatches(); E.updPageInfo();
};
async function paintPage(el){
  const p = E.doc.pages.find(x=>x.id===el.dataset.id); if (!p) return;
  const key = E.zoom+':'+M.R(p)+':'+p.s+':'+p.i;
  if (el.dataset.painted===key) return; el.dataset.painted = key;
  const c = el.querySelector('canvas.pc');
  try { if (el._task) el._task.cancel(); } catch(e){}
  try { await M.renderPage(E.doc, p, E.zoom*DPR(), c, {onTask:t=>el._task=t}); } catch(e){ if (e && e.name!=='RenderingCancelledException') console.warn(e); }
}
E.pageEl = id => $(`.page[data-id="${id}"]`);
E.page = id => E.doc.pages.find(p=>p.id===id);
E.updPageInfo = function(){
  if (!E.doc) { $('#pageInfo').textContent=''; return; }
  const v = $('#viewer'); const mid = v.scrollTop + v.clientHeight/3; let cur = 0;
  $$('.page', $('#pages')).forEach((el, i)=>{ if (el.offsetTop <= mid) cur = i; });
  if (cur !== E.cur && E.ptab==='text') setTimeout(()=>TextEdit.renderList(), 0);
  E.cur = cur; $('#pageInfo').textContent = t('page_of', {a:cur+1, b:E.doc.pages.length});
  $$('.th', $('#thumbList')).forEach((el,i)=>el.classList.toggle('cur', i===cur));
};
E.scrollToPage = function(i){ const el = $$('.page', $('#pages'))[i]; if (el) $('#viewer').scrollTo({top: el.offsetTop - 16, behavior:'smooth'}); };

/* ---------- overlay objects ---------- */
E.renderOverlay = function(p){
  const el = E.pageEl(p.id); if (!el) return; const ov = el.querySelector('.ov'); ov.innerHTML = '';
  for (const o of p.objs) ov.append(objEl(p, o));
};
function objEl(p, o){
  const [dw, dh] = M.dispSize(p); const W = dw*E.zoom, H = dh*E.zoom;
  const sel = E.sel && E.sel.obj===o.id;
  const el = h('div', {class:'obj kind-'+o.type+(sel?' sel':''), 'data-obj':o.id, tabindex:'0',
    style:{left:o.x*W+'px', top:o.y*H+'px', width:o.w*W+'px', height:o.h*H+'px', transform:o.rotate?`rotate(${o.rotate}deg)`:''}});
  const bw = Math.max(1, o.w*W), bh = Math.max(1, o.h*H);
  if (!['link','field','check','redact'].includes(o.type)){
    const c = U.canvas(bw*DPR(), bh*DPR()); const ctx = c.getContext('2d'); ctx.scale(DPR(), DPR());
    M.drawObj(ctx, Object.assign({}, o, {x:0, y:0, w:1, h:1, rotate:0}), bw, bh, E.zoom, false);
    el.append(c);
  }
  if (o.type==='redact') el.style.background = 'rgba(0,0,0,.82)';
  if (o.type==='link') el.append(h('span', {class:'tag'}, '🔗 ' + (o.url||t('url'))));
  if (o.type==='field') el.append(h('span', {class:'tag'}, o.name || t('t_field')));
  if (o.type==='check') el.append(h('span', {class:'tag'}, '☑ ' + (o.name||'')));
  if (o.type==='note') el.title = o.text || '';
  if (sel){ el.append(h('span', {class:'hd', 'data-h':'br'})); el.append(h('span', {class:'hd rt', 'data-h':'rot'})); }
  return el;
}
E.refreshObj = function(p, o){ const el = E.pageEl(p.id)?.querySelector(`[data-obj="${o.id}"]`); if (el && el.isConnected && el.parentNode){ const ne = objEl(p, o); try { el.replaceWith(ne); } catch(e){} } };
E.findObj = function(id){ for (const p of E.doc.pages){ const o = p.objs.find(x=>x.id===id); if (o) return [p, o]; } return [null, null]; };
E.select = function(pid, oid){
  const prev = E.sel; E.sel = oid ? {page:pid, obj:oid} : null;
  if (prev){ const [pp, po] = E.findObj(prev.obj); if (po) E.refreshObj(pp, po); }
  if (E.sel){ const [p, o] = E.findObj(oid); if (o) E.refreshObj(p, o); }
  E.renderProps();
};
E.addObj = function(p, o, noSnap){
  if (!noSnap) E.snap();
  o.id = o.id || U.uid(); p.objs.push(o); E.renderOverlay(p); E.select(p.id, o.id); E.renderThumb(p); return o;
};
E.delSel = function(){
  if (!E.sel) return; const [p, o] = E.findObj(E.sel.obj); if (!o) return; E.snap();
  p.objs = p.objs.filter(x=>x!==o); E.sel = null; E.renderOverlay(p); E.renderProps(); E.renderThumb(p);
};
E.dupSel = function(){
  if (!E.sel) return; const [p, o] = E.findObj(E.sel.obj); if (!o) return;
  const c = JSON.parse(JSON.stringify(o)); c.id = U.uid(); c.x = Math.min(0.95, c.x+0.02); c.y = Math.min(0.95, c.y+0.02); E.addObj(p, c);
};
E.updateSel = function(patch, noSnap){
  if (!E.sel) return; const [p, o] = E.findObj(E.sel.obj); if (!o) return;
  if (!noSnap) E.snap(); Object.assign(o, patch);
  if (o.type==='text' && ('size' in patch || 'font' in patch || 'text' in patch || 'bold' in patch)) fitTextHeight(p, o);
  E.refreshObj(p, o); E.renderThumbSoon(p);
};
function fitTextHeight(p, o){
  const [dw, dh] = M.dispSize(p); const c = U.canvas(4,4).getContext('2d');
  c.font = `${o.bold?'700 ':'400 '}${o.size}px ${U.fontStack(o.font)}`;
  const maxW = o.w*dw; let lines = 0;
  for (const ln of String(o.text||'').split('\n')){ let cur = ''; lines++; for (const wd of ln.split(/(\s+)/)){ const tst = cur+wd; if (c.measureText(tst).width > maxW && cur.trim()){ lines++; cur = wd.trimStart(); } else cur = tst; } }
  o.h = Math.max(o.size*1.3, lines*o.size*1.25 + o.size*0.2)/dh;
}

/* ---------- pointer interaction ---------- */
function norm(ov, e){ const r = ov.getBoundingClientRect(); return [(e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height, r]; }
E.applyToolCursor = function(){
  const d = toolDef(E.tool);
  $$('.ov', $('#pages')).forEach(ov=>{ ov.classList.toggle('drawing', E.tool!=='select' && E.tool!=='edittext'); ov.classList.toggle('textpick', E.tool==='edittext'); });
  $$('[data-tool]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.tool===E.tool ? 'true' : 'false'));
  showTextBoxes(E.tool==='edittext');
};
E.setTool = async function(id){
  E.tool = id; E.applyToolCursor(); E.renderProps();
  if (!E.doc) return;
  if (id==='image'){ const [f] = await U.pickFiles('image/*'); E.setTool('select'); if (f) E.placeImage(await U.readDataURL(f), 'image'); }
  else if (id==='sign'){ E.setTool('select'); Sig.open(url=>E.placeImage(url, 'sign')); }
  else if (id==='stamp'){ E.setTool('select'); Sig.stamp(url=>E.placeImage(url, 'stamp')); }
};
E.placeImage = async function(url, type){
  if (!E.doc) return;
  const p = E.doc.pages[E.cur] || E.doc.pages[0]; const [dw, dh] = M.dispSize(p);
  const id = await M.addImage(url); const im = M.imgs[id];
  let w = Math.min(type==='image'?0.5:0.28, (im.width*0.75)/dw); let hh = w*dw*(im.height/im.width)/dh;
  if (hh > 0.5){ hh = 0.5; w = hh*dh*(im.width/im.height)/dw; }
  // place in the visible part of the page
  const el = E.pageEl(p.id); const v = $('#viewer'); let cy = 0.5;
  if (el){ const top = (v.scrollTop + v.clientHeight/2 - el.offsetTop)/el.offsetHeight; cy = Math.max(hh/2, Math.min(1-hh/2, top)); }
  E.addObj(p, {type, img:id, x:0.5-w/2, y:cy-hh/2, w, h:hh, keepRatio:true, opacity:1});
};
let textBoxesOn = false;
async function showTextBoxes(on){
  textBoxesOn = on; $$('.textbox').forEach(e=>e.remove()); if (!on || !E.doc) return;
  for (const p of E.doc.pages){
    const el = E.pageEl(p.id); if (!el) continue; const items = await M.getText(E.doc, p); if (!textBoxesOn) return;
    for (const it of items) el.querySelector('.hl').append(h('div', {class:'textbox', style:{left:it.x*100+'%', top:it.y*100+'%', width:it.w*100+'%', height:it.h*100+'%'}}));
  }
}

function setupPointer(){
  const pages = $('#pages');
  let drag = null;
  pages.addEventListener('pointerdown', async e=>{
    const ov = e.target.closest('.ov'); const objE = e.target.closest('.obj');
    const pageEl = e.target.closest('.page'); if (!pageEl || !E.doc) return;
    const p = E.page(pageEl.dataset.id); if (!p) return;
    E.cur = E.doc.pages.indexOf(p);
    const ovEl = pageEl.querySelector('.ov'); const [nx, ny, r] = norm(ovEl, e);
    if (objE && (E.tool==='select' || e.target.classList.contains('hd'))){
      const oid = objE.dataset.obj; const o = p.objs.find(x=>x.id===oid); if (!o) return;
      if (!(E.sel && E.sel.obj===oid)) E.select(p.id, oid);
      const hd = e.target.dataset.h;
      drag = {mode: hd==='br' ? 'resize' : hd==='rot' ? 'rot' : 'move', p, o, sx:nx, sy:ny, o0:{...o}, r, moved:false, el: E.pageEl(p.id).querySelector(`[data-obj="${oid}"]`)};
      e.preventDefault(); ovEl.setPointerCapture?.(e.pointerId); return;
    }
    if (E.tool==='select'){ if (E.sel) E.select(null, null); return; }
    if (!ov) return;
    e.preventDefault();
    const tool = E.tool; const d = toolDef(tool);
    if (tool==='edittext'){ await E.editTextAt(p, nx, ny); return; }
    if (tool==='text'){
      const [dw, dh] = M.dispSize(p); const st = Object.assign({}, E.defaults.text, E.style.text||{});
      const o = Object.assign({type:'text', text: LANG==='ar'?'نص جديد':'New text', x:nx, y:ny-st.size*0.6/dh, w:Math.min(0.45, 1-nx), h:st.size*1.4/dh}, st);
      if (LANG==='ar' && nx > 0.5){ o.x = Math.max(0, nx - o.w); }
      E.addObj(p, o); E.setTool('select'); setTimeout(()=>E.editText(), 30); return;
    }
    if (tool==='note'){
      const [dw, dh] = M.dispSize(p); const o = {type:'note', x:nx, y:ny, w:22/dw, h:22/dh, color:'#f5b400', text:''};
      E.addObj(p, o); E.setTool('select'); setTimeout(()=>$('#pText')?.focus(), 60); return;
    }
    // box / line / pen drawing
    const st = Object.assign({}, E.defaults[tool]||{}, E.style[tool]||{});
    const o = Object.assign({type:tool, x:nx, y:ny, w:0.001, h:0.001, id:U.uid()}, st);
    if (d && d.line) o.pts = [[0,0],[1,1]];
    if (tool==='pen') o.abs = [[nx, ny]];
    if (tool==='field') o.name = 'field_'+(countType('field')+1);
    if (tool==='check') o.name = 'check_'+(countType('check')+1);
    E.snap(); p.objs.push(o);
    drag = {mode:'create', p, o, sx:nx, sy:ny, r};
    ovEl.setPointerCapture?.(e.pointerId);
    E.renderOverlay(p);
  });
  pages.addEventListener('pointermove', e=>{
    if (!drag) return; const r = drag.r;
    const nx = (e.clientX - r.left)/r.width, ny = (e.clientY - r.top)/r.height; const {o, o0} = drag;
    const dx = nx - drag.sx, dy = ny - drag.sy;
    if (drag.mode==='move'){
      if (!drag.moved && Math.hypot(dx*r.width, dy*r.height) < 3) return;
      if (!drag.moved){ E.snap(); drag.moved = true; }
      o.x = o0.x + dx; o.y = o0.y + dy;
      drag.el.style.left = o.x*r.width+'px'; drag.el.style.top = o.y*r.height+'px';
    } else if (drag.mode==='resize'){
      if (!drag.moved){ E.snap(); drag.moved = true; }
      let w = Math.max(0.01, o0.w + dx), hh = Math.max(0.005, o0.h + dy);
      if (o.keepRatio !== false && ['image','sign','stamp'].includes(o.type)){ const ar = (o0.h*r.height)/(o0.w*r.width); hh = w*r.width*ar/r.height; }
      if (o.type==='text'){ o.w = w; const [dw,dh] = M.dispSize(drag.p); fitTextHeight(drag.p, o); }
      else { o.w = w; o.h = hh; }
      E.refreshObjLive(drag);
    } else if (drag.mode==='rot'){
      if (!drag.moved){ E.snap(); drag.moved = true; }
      const cx = (o.x + o.w/2)*r.width + r.left, cy = (o.y + o.h/2)*r.height + r.top;
      let ang = Math.atan2(e.clientY - cy, e.clientX - cx)*180/Math.PI + 45; // handle sits at top-right
      if (!e.shiftKey) ang = Math.round(ang/5)*5;
      o.rotate = ((Math.round(ang)%360)+360)%360; drag.el.style.transform = `rotate(${o.rotate}deg)`;
    } else if (drag.mode==='create'){
      if (o.type==='pen'){ o.abs.push([nx, ny]); setPenBox(o); }
      else { o.x = Math.min(nx, drag.sx); o.y = Math.min(ny, drag.sy); o.w = Math.abs(dx); o.h = Math.abs(dy);
        if (o.pts) o.pts = [[nx>=drag.sx?0:1, ny>=drag.sy?0:1],[nx>=drag.sx?1:0, ny>=drag.sy?1:0]]; }
      E.renderOverlay(drag.p);
    }
  });
  const end = e=>{
    if (!drag) return; const d = drag; drag = null;
    if (d.mode==='create'){
      const o = d.o; const [dw, dh] = M.dispSize(d.p);
      if (o.type==='pen'){ setPenBox(o); delete o.abs; if (o.w*dw < 2 && o.h*dh < 2){ d.p.objs.pop(); E.hist.pop(); E.updUndo(); E.renderOverlay(d.p); return; } }
      else if (o.w*dw < 4 && o.h*dh < 4){ // tap: default size
        const def = {highlight:[120,14], underline:[120,6], strike:[120,10], rect:[120,70], ellipse:[90,90], line:[120,0.1], arrow:[120,0.1], link:[120,18], whiteout:[120,18], redact:[140,18], field:[160,22], check:[16,16]}[o.type] || [100,40];
        o.w = def[0]/dw; o.h = Math.max(def[1], 0.1)/dh; if (o.pts) { o.h = 1/dh; o.pts = [[0,0.5],[1,0.5]]; }
      }
      if (o.type==='line'||o.type==='arrow'){ o.h = Math.max(o.h, 1/dh); o.w = Math.max(o.w, 1/dw); }
      E.renderOverlay(d.p); E.select(d.p.id, o.id); E.renderThumb(d.p);
      if (o.type==='link') setTimeout(()=>$('#pUrl')?.focus(), 60);
    } else if (d.moved){ E.refreshObj(d.p, d.o); E.renderProps(); E.renderThumbSoon(d.p); }
  };
  pages.addEventListener('pointerup', end); pages.addEventListener('pointercancel', end);
  pages.addEventListener('dblclick', e=>{ const objE = e.target.closest('.obj'); if (!objE) return; const [p, o] = E.findObj(objE.dataset.obj); if (o && o.type==='text'){ E.select(p.id, o.id); E.editText(); } });
}
function countType(tp){ let n=0; for (const p of E.doc.pages) n += p.objs.filter(o=>o.type===tp).length; return n; }
function setPenBox(o){
  const xs = o.abs.map(p=>p[0]), ys = o.abs.map(p=>p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const w = Math.max(x1-x0, 0.002), hh = Math.max(y1-y0, 0.002);
  o.x = x0; o.y = y0; o.w = w; o.h = hh; o.pts = o.abs.map(p=>[(p[0]-x0)/w, (p[1]-y0)/hh]);
}
E.refreshObjLive = function(d){ const ne = objEl(d.p, d.o); d.el.replaceWith(ne); d.el = ne; };

/* edit-existing-text: cover the original line and place an editable text layer over it */
E.editTextAt = async function(p, nx, ny){
  const items = await M.getText(E.doc, p);
  const slack = 0.004;
  let it = items.find(i=>nx>=i.x-slack && nx<=i.x+i.w+slack && ny>=i.y-slack && ny<=i.y+i.h+slack);
  if (!it){ U.toast(LANG==='ar' ? 'لا يوجد نص قابل للتحديد هنا. للصفحات الممسوحة شغّل OCR أولًا، أو استخدم «تغطية بيضاء» ثم «إضافة نص».' : 'No selectable text here. For scanned pages run OCR first, or use Whiteout then Add text.'); return; }
  let o = TextEdit.overlayFor(p, it);
  if (!o) o = await TextEdit.replaceItem(p, it, it.str, {keep:true});
  E.select(p.id, o.id); E.setTool('select'); setTimeout(()=>E.editText(), 30);
};
E.editText = function(){
  if (!E.sel) return; const [p, o] = E.findObj(E.sel.obj); if (!o || o.type!=='text') return;
  const el = E.pageEl(p.id).querySelector(`[data-obj="${o.id}"]`); if (!el) return;
  const ta = h('textarea', {class:'ed', dir:'auto', style:{font:`${o.italic?'italic ':''}${o.bold?'700 ':'400 '}${o.size*E.zoom}px ${U.fontStack(o.font)}`, color:o.color, lineHeight:'1.25', textAlign: o.align==='center'?'center':o.align==='end'?'end':'start'}});
  ta.value = o.text; el.append(ta); ta.focus(); ta.select();
  const before = snapshot(); let changed = false;
  ta.addEventListener('input', ()=>{ o.text = ta.value; changed = true; fitTextHeight(p, o); el.style.height = o.h*el.parentElement.clientHeight+'px'; });
  ta.addEventListener('pointerdown', e=>e.stopPropagation());
  ta.addEventListener('keydown', e=>{ if (e.key==='Escape') ta.blur(); e.stopPropagation(); });
  ta.addEventListener('blur', ()=>setTimeout(()=>{ if (changed){ E.hist.push(before); E.redo=[]; E.doc.dirty=true; E.updUndo(); } E.refreshObj(p, o); E.renderProps(); E.renderThumbSoon(p); }, 0));
};

/* ---------- thumbnails & page operations ---------- */
let thumbIO = null;
E.renderThumbs = function(){
  const list = $('#thumbList'); list.innerHTML = ''; if (thumbIO) thumbIO.disconnect(); if (!E.doc) return;
  /* thumbnails render when they scroll into the page panel */
  thumbIO = new IntersectionObserver(ents=>ents.forEach(en=>{ if (en.isIntersecting){ thumbIO.unobserve(en.target); const p = E.page(en.target.dataset.id); if (p) E.renderThumb(p, en.target); } }), {rootMargin:'300px 0px'});
  E.doc.pages.forEach((p, i)=>{
    const ck = h('input', {type:'checkbox', class:'ck', 'aria-label':t('page')+' '+(i+1)}); ck.checked = E.selPages.has(p.id);
    ck.addEventListener('click', e=>{ e.stopPropagation(); ck.checked ? E.selPages.add(p.id) : E.selPages.delete(p.id); el.classList.toggle('sel', ck.checked); updSelCount(); });
    const el = h('div', {class:'th'+(E.selPages.has(p.id)?' sel':''), draggable:'true', 'data-id':p.id}, h('canvas'), h('span', {class:'n'}, String(i+1)), ck);
    el.addEventListener('click', ()=>{ E.scrollToPage(i); closeDrawers(); });
    el.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', p.id); el.classList.add('drag'); });
    el.addEventListener('dragend', ()=>el.classList.remove('drag'));
    el.addEventListener('dragover', e=>{ e.preventDefault(); el.classList.add('dropb'); });
    el.addEventListener('dragleave', ()=>el.classList.remove('dropb'));
    el.addEventListener('drop', e=>{ e.preventDefault(); el.classList.remove('dropb'); const id = e.dataTransfer.getData('text/plain'); if (id && id!==p.id) E.movePage(id, E.doc.pages.indexOf(p)); });
    list.append(el); thumbIO.observe(el);
  });
  updSelCount(); E.updPageInfo();
};
function updSelCount(){ $('#selCount').textContent = E.selPages.size ? t('selected', {n:E.selPages.size}) : ''; }
const thumbTimers = {};
E.renderThumbSoon = p => { clearTimeout(thumbTimers[p.id]); thumbTimers[p.id] = setTimeout(()=>E.renderThumb(p), 400); };
E.renderThumb = async function(p, el){
  el = el || $(`.th[data-id="${p.id}"]`); if (!el) return; const c = el.querySelector('canvas');
  const [dw] = M.dispSize(p); const sc = 130/dw;
  const tmp = U.canvas(4,4);
  try { await M.renderPage(E.doc, p, sc, tmp); } catch(e){ return; }
  const ctx = tmp.getContext('2d'); for (const o of p.objs) M.drawObj(ctx, o, tmp.width, tmp.height, sc, false);
  c.width = tmp.width; c.height = tmp.height; c.getContext('2d').drawImage(tmp, 0, 0);
};
E.targetPages = () => { const s = E.doc.pages.filter(p=>E.selPages.has(p.id)); return s.length ? s : [E.doc.pages[E.cur]].filter(Boolean); };
E.movePage = function(id, to){ E.snap(); const ps = E.doc.pages; const from = ps.findIndex(p=>p.id===id); const [p] = ps.splice(from, 1); ps.splice(to, 0, p); E.rebuild(); };
E.pageOp = async function(op){
  if (!E.doc) return U.toast(t('no_doc_open'));
  const tp = E.targetPages(); const ps = E.doc.pages;
  if (op==='rotL' || op==='rotR'){ E.snap(); tp.forEach(p=>{ p.rot = ((p.rot||0) + (op==='rotR'?90:270))%360; rotateObjs(p, op==='rotR'?90:270); }); E.rebuild(); }
  else if (op==='del'){
    if (tp.length >= ps.length) return U.toast(LANG==='ar'?'لا يمكن حذف كل الصفحات.':'Cannot delete every page.', 'err');
    E.snap(); E.doc.pages = ps.filter(p=>!tp.includes(p)); E.selPages.clear(); E.rebuild();
  }
  else if (op==='dup'){ E.snap(); for (const p of tp.slice().reverse()){ const c = JSON.parse(JSON.stringify(p)); c.id = U.uid(); c.objs.forEach(o=>o.id=U.uid()); ps.splice(ps.indexOf(p)+1, 0, c); } E.rebuild(); }
  else if (op==='blank'){ E.snap(); const ref = tp[tp.length-1]; const [w,h2] = [ref.w, ref.h]; ps.splice(ps.indexOf(ref)+1, 0, {id:U.uid(), s:null, i:0, baseRot:ref.baseRot, rot:ref.rot, w, h:h2, ox:0, oy:0, objs:[]}); E.rebuild(); }
  else if (op==='insert'){
    const files = await U.pickFiles('application/pdf,image/*', true); if (!files.length) return;
    E.snap(); const at = ps.indexOf(tp[tp.length-1]) + 1;
    try { let pos = at; for (const f of files){ const added = await E.doc.addFile(f, pos); pos += added.length; } E.rebuild(); U.toast(t('done'), 'ok'); }
    catch(e){ E.hist.pop(); U.toast(t('open_err', {e:e.message}), 'err'); }
  }
  else if (op==='extract'){
    const d = new M.Doc(U.baseName(E.doc.name)+'-pages.pdf'); d.sources = E.doc.sources; d.pages = JSON.parse(JSON.stringify(tp));
    const task = new U.Task(); const {bytes} = await M.exportPdf(d, task, {rebuild:true}); await U.saveFile(d.name, new Blob([bytes], {type:'application/pdf'}));
  }
};
/* when a page rotates, keep overlay objects on the same content */
function rotateObjs(p, deg){
  const steps = deg/90; let [dw, dh] = M.dispSize(p); if (steps%2) [dw, dh] = [dh, dw]; // dims before rotation
  for (let k=0;k<steps;k++){
    const ndw = dh, ndh = dw; // display dims after this 90° clockwise step
    for (const o of p.objs){
      if (['text','image','sign','stamp'].includes(o.type)){
        const cx = o.x+o.w/2, cy = o.y+o.h/2; const ncx = 1-cy, ncy = cx;
        const nw = o.w*dw/ndw, nh = o.h*dh/ndh; o.w = nw; o.h = nh; o.x = ncx-nw/2; o.y = ncy-nh/2; o.rotate = ((o.rotate||0)+90)%360;
      } else {
        const nx = 1-(o.y+o.h), ny = o.x; [o.w, o.h] = [o.h, o.w]; o.x = nx; o.y = ny;
        if (o.pts) o.pts = o.pts.map(q=>[1-q[1], q[0]]);
      }
    }
    dw = ndw; dh = ndh;
  }
}

/* ---------- search ---------- */
E.find = async function(q){
  E.matches = []; E.mi = -1; $('#findCount').textContent = '';
  if (!E.doc || !q.trim()) { E.drawMatches(); return; }
  const needle = q.trim().toLowerCase();
  for (const p of E.doc.pages){
    const items = await M.getText(E.doc, p);
    for (const it of items) if (it.str.toLowerCase().includes(needle)) E.matches.push({p, it});
  }
  $('#findCount').textContent = E.matches.length ? `0/${E.matches.length}` : '0';
  E.drawMatches(); if (E.matches.length) E.nextMatch(1);
};
E.nextMatch = function(dir){
  if (!E.matches.length) return; E.mi = (E.mi + dir + E.matches.length) % E.matches.length;
  $('#findCount').textContent = `${E.mi+1}/${E.matches.length}`; E.drawMatches();
  const m = E.matches[E.mi]; const el = E.pageEl(m.p.id); if (el) $('#viewer').scrollTo({top: el.offsetTop + m.it.y*el.offsetHeight - 120, behavior:'smooth'});
};
E.drawMatches = function(){
  $$('.hl i').forEach(e=>e.remove());
  (E.matches||[]).forEach((m, i)=>{ const el = E.pageEl(m.p.id); if (!el) return;
    el.querySelector('.hl').append(h('i', {class: i===E.mi?'cur':'', style:{left:m.it.x*100+'%', top:m.it.y*100+'%', width:m.it.w*100+'%', height:m.it.h*100+'%'}})); });
};

/* ---------- properties panel ---------- */
function ctl(label, input){ return h('div', {class:'row'}, h('label', {for:input.id||null}, label), input); }
function colorIn(id, val, on){ const i = h('input', {type:'color', id, value:val||'#000000'}); i.addEventListener('input', ()=>on(i.value, true)); i.addEventListener('change', ()=>on(i.value, false)); return i; }
function rangeIn(id, min, max, step, val, on){ const i = h('input', {type:'range', id, min, max, step, value:val}); i.addEventListener('input', ()=>on(+i.value, true)); i.addEventListener('change', ()=>on(+i.value, false)); return i; }
function selIn(id, opts, val, on){ const s = h('select', {class:'field', id}, opts.map(o=>h('option', {value:o[0], selected: String(o[0])===String(val)}, o[1]))); s.addEventListener('change', ()=>on(s.value)); return s; }
E.ptab = 'props';
E.showProps = function(tab){ if (tab) E.ptab = tab; if (innerWidth<=860){ if (!$('#props').classList.contains('open')) E.toggleDrawer('#props'); } else $('#props').hidden = false; E.renderProps(); };
E.renderProps = function(){
  const P = $('#props'); P.innerHTML = '';
  if (!E.doc){ P.append(h('p', {class:'note'}, t('no_doc_s'))); return; }
  P.append(h('div', {class:'seg', role:'tablist', style:{width:'100%'}}, ...[['props', X('الخصائص','Properties')], ['text', X('محرر النصوص','Text editor')]].map(([k,l])=>h('button', {role:'tab', 'aria-pressed':String(E.ptab===k), style:{flex:'1'}, onclick:()=>{ E.ptab = k; E.renderProps(); }}, l))));
  if (E.ptab==='text'){ TextEdit.render(P); return; }
  const g1 = h('div', {class:'pgrp'}, h('h3', null, E.sel ? t('obj') : (t('t_'+E.tool))));
  const hint = {edittext:'tool_hint_edittext', text:'tool_hint_text', pen:'tool_hint_pen', redact:'tool_hint_redact'}[E.tool] || (toolDef(E.tool)?.box||toolDef(E.tool)?.line ? 'tool_hint_box' : null);
  const [p, o] = E.sel ? E.findObj(E.sel.obj) : [null, null];
  if (!o && hint) g1.append(h('p', {class: E.tool==='redact'?'callout':'note'}, t(hint)));
  if (o){
    const up = (patch, live) => { if (live){ Object.assign(o, patch); if (o.type==='text') fitTextHeight(p, o); E.refreshObj(p, o); } else E.updateSel(patch); };
    // record a snapshot once at the start of a live drag on sliders/colors
    let snapped = false; const upL = (patch, live) => { if (!snapped){ E.snap(); snapped = true; } Object.assign(o, patch); if (o.type==='text') fitTextHeight(p,o); E.refreshObj(p, o); if (!live){ snapped=false; E.renderThumbSoon(p);} };
    if (o.type==='text'){
      const ta = h('textarea', {class:'field', id:'pText', dir:'auto'}); ta.value = o.text||''; ta.addEventListener('input', ()=>upL({text:ta.value}, true)); ta.addEventListener('change', ()=>upL({text:ta.value}, false));
      g1.append(ta,
        ctl(t('font'), selIn('pFont', M.FONTS.map(f=>[f,f]), o.font, v=>E.updateSel({font:v}))),
        ctl(t('size'), h('input', {class:'field', type:'number', id:'pSize', min:4, max:200, step:0.5, value:o.size, style:{width:'80px'}, onchange:e=>E.updateSel({size:+e.target.value})})),
        ctl(t('color'), colorIn('pColor', o.color, (v,l)=>upL({color:v}, l))),
        h('div', {class:'row'},
          h('button', {class:'btn', 'aria-pressed':String(!!o.bold), style:{fontWeight:800}, onclick:()=>E.updateSel({bold:!o.bold})}, t('bold')),
          h('button', {class:'btn', style:{fontStyle:'italic'}, onclick:()=>E.updateSel({italic:!o.italic})}, t('italic'))),
        ctl(t('align'), selIn('pAlign', [['start', LANG==='ar'?'بداية السطر':'Start'],['center', LANG==='ar'?'وسط':'Center'],['end', LANG==='ar'?'نهاية السطر':'End']], o.align||'start', v=>E.updateSel({align:v}))),
        h('label', {class:'row'}, h('input', {type:'checkbox', id:'pBg', checked:!!o.bg, onchange:e=>E.updateSel({bg:e.target.checked})}), t('bg_white')));
    }
    if (['highlight','underline','strike','rect','ellipse','line','arrow','pen','note'].includes(o.type)) g1.append(ctl(t('color'), colorIn('pColor', o.color, (v,l)=>upL({color:v}, l))));
    if (['underline','strike','rect','ellipse','line','arrow','pen'].includes(o.type)) g1.append(ctl(t('width'), rangeIn('pSW', 0, 12, 0.5, o.strokeW??2, (v,l)=>upL({strokeW:v}, l))));
    if (['rect','ellipse'].includes(o.type)) g1.append(ctl(t('fill'), h('div', {class:'row'}, colorIn('pFill', o.fill && o.fill!=='none' ? o.fill : '#ffffff', (v,l)=>upL({fill:v}, l)), h('button', {class:'btn', onclick:()=>E.updateSel({fill:'none'})}, t('none')))));
    if (o.type==='whiteout') g1.append(ctl(t('fill'), colorIn('pFill', o.fill||'#ffffff', (v,l)=>upL({fill:v}, l))));
    if (o.type==='note'){ const ta = h('textarea', {class:'field', id:'pText', dir:'auto', placeholder:t('text')}); ta.value = o.text||''; ta.addEventListener('change', ()=>E.updateSel({text:ta.value})); g1.append(ta, h('p', {class:'note'}, LANG==='ar'?'يُحفظ كتعليق PDF حقيقي يظهر في القارئ.':'Saved as a real PDF comment visible in readers.')); }
    if (o.type==='link'){ const i = h('input', {class:'field', id:'pUrl', type:'url', dir:'ltr', placeholder:'https://', value:o.url||'', style:{width:'100%'}}); i.addEventListener('change', ()=>E.updateSel({url:i.value.trim()})); g1.append(ctl(t('url'), i)); }
    if (o.type==='field' || o.type==='check'){ const i = h('input', {class:'field', id:'pName', dir:'ltr', value:o.name||''}); i.addEventListener('change', ()=>E.updateSel({name:i.value.trim()})); g1.append(ctl(t('fname'), i));
      if (o.type==='field') g1.append(h('label', {class:'row'}, h('input', {type:'checkbox', checked:!!o.multiline, onchange:e=>E.updateSel({multiline:e.target.checked})}), LANG==='ar'?'متعدد الأسطر':'Multiline')); }
    if (o.type==='redact') g1.append(h('p', {class:'callout'}, t('tool_hint_redact')));
    if (['image','sign','stamp'].includes(o.type)){
      g1.append(h('div', {class:'row'},
        h('button', {class:'btn', onclick:()=>Sig.crop(M.imgSrc[o.img], async url=>{ const id = await M.addImage(url); const r = M.imgs[id]; E.updateSel({img:id, h: o.w * (r.height/r.width) * (M.dispSize(p)[0]/M.dispSize(p)[1])}); })}, t('crop')),
        h('button', {class:'btn', onclick:async()=>{ const url = await U.rotateImage(M.imgSrc[o.img], 90); const id = await M.addImage(url); const [dw,dh] = M.dispSize(p); const cx=o.x+o.w/2, cy=o.y+o.h/2; const nw = o.h*dh/dw, nh = o.w*dw/dh; E.updateSel({img:id, w:nw, h:nh, x:cx-nw/2, y:cy-nh/2}); }}, t('rot90')),
        h('button', {class:'btn', onclick:()=>Sig.bgDialog(M.imgSrc[o.img], async url=>{ const id = await M.addImage(url); const r = M.imgs[id]; const [dw,dh]=M.dispSize(p); E.updateSel({img:id, h:o.w*dw*(r.height/r.width)/dh}); })}, t('removebg'))),
        h('label', {class:'row'}, h('input', {type:'checkbox', checked:o.keepRatio!==false, onchange:e=>E.updateSel({keepRatio:e.target.checked})}), t('keep_ratio')));
      if (o.type==='sign') g1.append(h('p', {class:'callout info'}, t('sig_legal')));
    }
    if (!['redact','field','check','link','note'].includes(o.type)){
      g1.append(ctl(t('opacity'), rangeIn('pOp', 0.1, 1, 0.05, o.opacity??1, (v,l)=>upL({opacity:v}, l))));
      g1.append(ctl(t('rotate'), rangeIn('pRot', 0, 359, 1, o.rotate||0, (v,l)=>upL({rotate:v}, l))));
    }
    g1.append(h('div', {class:'row'},
      h('button', {class:'btn', onclick:E.dupSel}, t('duplicate')),
      h('button', {class:'btn', onclick:()=>{ E.snap(); p.objs = p.objs.filter(x=>x!==o); p.objs.push(o); E.renderOverlay(p);} }, t('front')),
      h('button', {class:'btn', onclick:()=>{ E.snap(); p.objs = p.objs.filter(x=>x!==o); p.objs.unshift(o); E.renderOverlay(p);} }, t('back')),
      h('button', {class:'btn danger', onclick:E.delSel}, t('del'))));
    if (o.type==='text') g1.append(h('button', {class:'btn primary', onclick:E.editText}, LANG==='ar'?'تعديل النص على الصفحة':'Edit text on page'));
  } else if (!hint) g1.append(h('p', {class:'note'}, t('none_sel')));
  P.append(g1);
  P.append(h('p', {class:'callout info'}, t('layer_note')));
  // page group
  const pg = h('div', {class:'pgrp'}, h('h3', null, t('page_tools')),
    h('div', {class:'row'}, ...[['rotL','rot_l'],['rotR','rot_r'],['dup','dup_page'],['blank','blank_page'],['del','del_page']].map(([op,k])=>h('button', {class:'btn', onclick:()=>E.pageOp(op)}, t(k)))),
    h('div', {class:'row'}, h('button', {class:'btn', onclick:()=>{ const i = E.cur; if (i>0) E.movePage(E.doc.pages[i].id, i-1); }}, '↑ '+t('move_up')), h('button', {class:'btn', onclick:()=>{ const i = E.cur; if (i<E.doc.pages.length-1) E.movePage(E.doc.pages[i].id, i+1); }}, '↓ '+t('move_down'))));
  P.append(pg);
  // forms
  const fg = h('div', {class:'pgrp'}, h('h3', null, t('forms_title')), h('button', {class:'btn', onclick:E.formsDialog}, LANG==='ar'?'تعبئة حقول النموذج':'Fill form fields'));
  P.append(fg);
  // document info
  const sz = E.doc.sources.reduce((a,s)=>a+s.bytes.length, 0);
  P.append(h('div', {class:'pgrp'}, h('h3', null, LANG==='ar'?'المستند':'Document'), h('dl', {class:'kv'}, h('dt', null, LANG==='ar'?'الاسم':'Name'), h('dd', null, E.doc.name), h('dt', null, t('pages')), h('dd', null, String(E.doc.pages.length)), h('dt', null, LANG==='ar'?'الحجم الأصلي':'Original size'), h('dd', null, U.fmtSize(sz)))));
};

/* ---------- forms ---------- */
E.formsDialog = async function(){
  if (!E.doc) return; if (E.doc.sources.length !== 1) return U.toast(LANG==='ar'?'تعبئة النماذج متاحة لملف واحد. احفظ الدمج أولًا ثم افتحه.':'Form filling works on a single file. Save the merged file first, then open it.');
  const src = E.doc.sources[0];
  let lib; try { lib = await PDFLib.PDFDocument.load(src.bytes, {password:src.password||undefined}); } catch(e){ return U.toast(t('error',{e:e.message}),'err'); }
  const form = lib.getForm(); const fields = form.getFields();
  const body = h('div', {style:{display:'flex', flexDirection:'column', gap:'10px'}});
  if (!fields.length){ body.append(h('p', null, t('forms_none')), h('p', {class:'note'}, LANG==='ar'?'لإنشاء نموذج: استخدم أداتي «حقل نصي» و«مربع اختيار» من الشريط ثم احفظ.':'To create a form, use the Text field and Checkbox tools, then save.')); U.modal(t('forms_title'), body, [{label:t('close')}]); return; }
  body.append(h('p', {class:'note'}, t('forms_found', {n:fields.length})));
  const inputs = [];
  for (const f of fields){
    const name = f.getName(); const C = f.constructor.name; let inp;
    try {
      if (f instanceof PDFLib.PDFTextField){ inp = h('input', {class:'field', dir:'auto', value: f.getText()||'', style:{width:'100%'}}); }
      else if (f instanceof PDFLib.PDFCheckBox){ inp = h('input', {type:'checkbox'}); inp.checked = f.isChecked(); }
      else if (f instanceof PDFLib.PDFDropdown){ const v = f.getSelected()[0]; inp = selIn('', f.getOptions().map(o=>[o,o]), v, ()=>{}); }
      else if (f instanceof PDFLib.PDFRadioGroup){ inp = selIn('', [['','—'], ...f.getOptions().map(o=>[o,o])], f.getSelected()||'', ()=>{}); }
      else continue;
    } catch(e){ continue; }
    inputs.push({f, inp}); body.append(h('div', {style:{display:'flex', flexDirection:'column', gap:'4px'}}, h('label', {class:'note'}, name), inp));
  }
  const fl = h('input', {type:'checkbox', id:'flat'});
  body.append(h('label', {class:'row'}, fl, t('flatten')), h('p', {class:'note'}, t('forms_note')));
  U.modal(t('forms_title'), body, [{label:t('cancel')}, {label:t('done'), kind:'primary', onClick: async close=>{
    let hasAr = false;
    for (const {f, inp} of inputs){
      try {
        if (f instanceof PDFLib.PDFTextField){ f.setText(inp.value); if (U.isAr(inp.value)) hasAr = true; }
        else if (f instanceof PDFLib.PDFCheckBox){ inp.checked ? f.check() : f.uncheck(); }
        else if (f instanceof PDFLib.PDFDropdown){ if (inp.value) f.select(inp.value); }
        else if (f instanceof PDFLib.PDFRadioGroup){ if (inp.value) f.select(inp.value); }
      } catch(e){ console.warn(e); }
    }
    let bytes;
    try {
      if (fl.checked && !hasAr){ const font = await lib.embedFont(PDFLib.StandardFonts.Helvetica); form.updateFieldAppearances(font); form.flatten(); bytes = await lib.save(); }
      else { form.acroForm.dict.set(PDFLib.PDFName.of('NeedAppearances'), PDFLib.PDFBool.True); bytes = await lib.save({updateFieldAppearances: !hasAr}); }
    } catch(e){ form.acroForm.dict.set(PDFLib.PDFName.of('NeedAppearances'), PDFLib.PDFBool.True); bytes = await lib.save({updateFieldAppearances:false}); if (fl.checked) U.toast(LANG==='ar'?'تعذّر التسطيح لهذه القيم؛ حُفظت الحقول قابلة للتعديل.':'Could not flatten these values; fields were kept editable.'); }
    const ns = await M.loadPdfBytes(new Uint8Array(bytes), E.doc.name, false); ns.password = null;
    try { E.doc.sources[0].pdf.destroy(); } catch(e){}
    E.doc.sources[0] = ns; E.doc.textCache = {}; E.doc.dirty = true;
    $$('.page').forEach(el=>el.dataset.painted=''); E.renderPages(); E.renderThumbs(); close(); U.toast(t('done'), 'ok');
  }}]);
};

/* ---------- save ---------- */
E.save = async function(){
  if (!E.doc) return U.toast(t('no_doc_open'));
  const red = E.doc.pages.filter(p=>p.objs.some(o=>o.type==='redact')).length;
  if (red && !(await U.ask(t('t_redact'), t('redact_warn', {n:red}), t('save_pdf'), 'primary'))) return;
  const lines = E.doc.pages.reduce((a,p)=>a+p.objs.length,0);
  const t0 = U.toast(t('saving'));
  try {
    const fonts = new Set(); E.doc.pages.forEach(p=>p.objs.forEach(o=>o.font && fonts.add(o.font))); await U.ensureFonts([...fonts]);
    const {bytes} = await M.exportPdf(E.doc, new U.Task(), {after:E.doc.after});
    const name = /\.pdf$/i.test(E.doc.name) ? E.doc.name.replace(/\.pdf$/i, (LANG==='ar'?'-معدل':'-edited')+'.pdf') : E.doc.name+'.pdf';
    if (await U.saveFile(name, new Blob([bytes], {type:'application/pdf'}))) E.doc.dirty = false;
  } catch(e){ console.error(e); U.toast(t('error', {e:e.message}), 'err'); }
};
E.currentBytes = async function(){ const {bytes} = await M.exportPdf(E.doc, new U.Task()); return bytes; };

/* ---------- drawers (phone) ---------- */
function closeDrawers(){ $('#thumbs').classList.remove('open'); $('#props').classList.remove('open'); $('#scrim').classList.remove('open'); }
E.toggleDrawer = function(id){ const el = $(id); const on = !el.classList.contains('open'); closeDrawers(); if (on && innerWidth<=860){ el.classList.add('open'); $('#scrim').classList.add('open'); } };

/* ---------- ribbon (tabs with labelled tools) ---------- */
const withDoc = id => async ()=>{ if (!E.doc) return U.toast(t('no_doc_open')); Tools.open(id, [new File([await E.currentBytes()], E.doc.name, {type:'application/pdf'})]); };
E.RIBBON = () => [
  ['edit', X('تحرير','Edit'), ['select','edittext','text','image','whiteout','link', {id:'txp', ico:'edit', label:X('محرر النصوص','Text editor'), run:()=>E.showProps('text')}, {id:'ocrp', ico:'ocr', label:X('اقرأ نص الصفحة (OCR)','Read page text (OCR)'), run:()=>OCR.editorPage(false)}, {id:'ocrs', ico:'inspect', label:X('استخراج البيانات','Extract data'), run:async()=>{ if (!E.doc) return U.toast(t('no_doc_open')); OCR.studio([new File([await E.currentBytes()], E.doc.name, {type:'application/pdf'})]); }}]],
  ['annot', X('تعليق','Comment'), ['highlight','underline','strike','note','rect','ellipse','line','arrow','pen']],
  ['sign', X('توقيع واعتماد','Sign & approve'), ['sign','stamp','field','check', {id:'frm', ico:'form', label:X('تعبئة النموذج','Fill form'), run:()=>E.formsDialog()}, {id:'apr', ico:'stamp', label:X('طلب اعتماد','Request approval'), run:()=>Flow.newDialog()}]],
  ['pages', X('الصفحات','Pages'), [['rotL','rotate','rot_l'],['rotR','rotate','rot_r'],['dup','extract','dup_page'],['blank','remove','blank_page'],['insert','merge','insert_file'],['extract','extract','extract_sel'],['del','remove','del_page']].map(([op,ic,k])=>({id:'pg_'+op, ico:ic, label:t(k), run:()=>E.pageOp(op)}))],
  ['convert', X('تحويل','Convert'), [['pdf2word','word'],['pdf2excel','excel'],['pdf2ppt','ppt'],['pdf2img','pdf2img'],['pdf2txt','md'],['pdfa','zip'],['ocr','ocr'],['compress','compress']].map(([id,ic])=>({id:'cv_'+id, ico:ic, label:L(Tools.list.find(x=>x.id===id)?.n||{ar:id,en:id}), run:withDoc(id)}))],
  ['protect', X('حماية','Protect'), ['redact', ...[['protect','lock'],['watermark','watermark'],['numbers','number'],['meta','meta']].map(([id,ic])=>({id:'pr_'+id, ico:ic, label:L(Tools.list.find(x=>x.id===id).n), run:withDoc(id)}))]]
];
E.rtab = 'edit';
E.renderRibbon = function(){
  const tabs = $('#rtabs'), body = $('#rbody'); if (!tabs) return; const R = E.RIBBON();
  tabs.replaceChildren(...R.map(([k,l])=>h('button', {role:'tab', 'aria-selected':String(E.rtab===k), onclick:()=>{ E.rtab = k; E.renderRibbon(); }}, l)));
  const cur = R.find(r=>r[0]===E.rtab) || R[0];
  body.replaceChildren(...cur[2].map(it=>{
    if (typeof it === 'string'){ const d = toolDef(it); return h('button', {class:'rbtn', 'data-tool':it, 'aria-pressed':String(E.tool===it), title:t('t_'+it), onclick:()=>E.setTool(it)}, h('span', {html:U.ico(d.ico)}), t('t_'+it)); }
    return h('button', {class:'rbtn', title:it.label, onclick:it.run}, h('span', {html:U.ico(it.ico)}), it.label); }));
};

/* ---------- init ---------- */
E.init = function(){
  E.renderRibbon();
  setupPointer();
  $('#viewer').addEventListener('scroll', ()=>{ clearTimeout(E._st); E._st = setTimeout(E.updPageInfo, 80); }, {passive:true});
  $('#tbZoomIn').onclick = ()=>E.setZoom(E.zoom*1.2); $('#tbZoomOut').onclick = ()=>E.setZoom(E.zoom/1.2); $('#tbFit').onclick = ()=>E.fitWidth();
  $('#tbUndo').onclick = E.undo; $('#tbRedo').onclick = E.redoFn;
  $('#tbThumbs').onclick = ()=> innerWidth<=860 ? E.toggleDrawer('#thumbs') : $('#thumbs').toggleAttribute('hidden');
  $('#tbProps').onclick = ()=> innerWidth<=860 ? E.toggleDrawer('#props') : $('#props').toggleAttribute('hidden');
  $('#scrim').onclick = closeDrawers;
  $('#tbOpen').onclick = App.openPicker; $('#emptyOpen').onclick = App.openPicker; $('#emptySample').onclick = App.openSample;
  $$('#pageOps [data-op]').forEach(b=>b.onclick = ()=>E.pageOp(b.dataset.op));
  let ft; $('#findInput').addEventListener('input', e=>{ clearTimeout(ft); ft = setTimeout(()=>E.find(e.target.value), 300); });
  $('#findInput').addEventListener('keydown', e=>{ if (e.key==='Enter'){ e.preventDefault(); E.nextMatch(e.shiftKey?-1:1); } });
  $('#findNext').onclick = ()=>E.nextMatch(1); $('#findPrev').onclick = ()=>E.nextMatch(-1);
  let rz; addEventListener('resize', ()=>{ clearTimeout(rz); rz = setTimeout(()=>{ if (E.doc && innerWidth<=860) E.fitWidth(); }, 250); });
  document.addEventListener('keydown', e=>{
    if (!$('#editor').classList.contains('on') || e.target.matches('input,textarea,select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey ? E.redoFn() : E.undo(); }
    else if (mod && e.key.toLowerCase()==='y'){ e.preventDefault(); E.redoFn(); }
    else if (mod && e.key.toLowerCase()==='s'){ e.preventDefault(); E.save(); }
    else if (mod && e.key.toLowerCase()==='d'){ e.preventDefault(); E.dupSel(); }
    else if ((e.key==='Delete' || e.key==='Backspace') && E.sel){ e.preventDefault(); E.delSel(); }
    else if (e.key==='Escape'){ E.select(null,null); E.setTool('select'); }
    else if (E.sel && e.key.startsWith('Arrow')){ e.preventDefault(); const [p,o] = E.findObj(E.sel.obj); const st = e.shiftKey?0.01:0.002;
      const d = {ArrowLeft:[-st,0], ArrowRight:[st,0], ArrowUp:[0,-st], ArrowDown:[0,st]}[e.key]; E.updateSel({x:o.x+d[0], y:o.y+d[1]}); }
  });
  E.applyToolCursor(); E.renderProps();
};
})();
