/* وثيق — utilities: storage, toasts, dialogs, saving, script loading, image helpers */
(function(){
const U = window.U = {};
const $ = U.$ = (s, r=document) => r.querySelector(s);
U.$$ = (s, r=document) => Array.from(r.querySelectorAll(s));
U.h = function(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs){ const v = attrs[k]; if (v==null || v===false) continue;
    if (k==='class') e.className = v; else if (k==='style' && typeof v==='object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k==='html') e.innerHTML = v; else e.setAttribute(k, v===true?'':v); }
  for (const c of kids.flat()) if (c!=null && c!==false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
U.store = {
  get(k, d){ try { const v = localStorage.getItem('wq.'+k); return v==null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('wq.'+k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem('wq.'+k); } catch(e){} }
};
U.session = {
  get(k){ try { return JSON.parse(sessionStorage.getItem('wq.'+k)); } catch(e){ return null; } },
  set(k, v){ try { sessionStorage.setItem('wq.'+k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { sessionStorage.removeItem('wq.'+k); } catch(e){} }
};
U.toast = function(msg, kind){
  const el = U.h('div', {class:'toast '+(kind||''), role:'status'}, msg);
  $('#toasts').append(el); setTimeout(()=>el.remove(), kind==='err'?6500:3500);
};
U.fmtSize = n => n<1024 ? n+' B' : n<1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(2)+' MB';
U.baseName = n => (n||'file').replace(/\.[^.]+$/, '');
U.ext = n => ((n||'').match(/\.([^.]+)$/)||[])[1]?.toLowerCase() || '';
U.sleep = ms => new Promise(r=>setTimeout(r, ms));
U.uid = () => Math.random().toString(36).slice(2,10);
U.readBuf = f => f.arrayBuffer();
U.readDataURL = f => new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror = ()=>rej(r.error); r.readAsDataURL(f); });
U.arDigits = s => String(s).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
U.isAr = s => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s||'');

/* lazy script loading (CDN libraries pinned to exact versions) */
const loaded = {};
U.loadScript = function(src){
  if (!loaded[src]) loaded[src] = new Promise((res, rej)=>{
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = ()=>res(); s.onerror = ()=>{ delete loaded[src]; rej(new Error('Failed to load '+src.split('/').slice(-1)[0])); };
    document.head.append(s);
  });
  return loaded[src];
};
U.LIBS = {
  tesseract:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  xlsx:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  mammoth:'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  html2canvas:'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  pptx:'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  msal:'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.39.0/lib/msal-browser.min.js',
  qr:'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  fontkit:'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js'
};

/* saving files: claude.ai artifact "downloads" capability when present, else a normal browser download */
let dlCap; let dlChecked = false;
async function getDl(){
  if (dlChecked) return dlCap;
  dlChecked = true;
  try { if (window.claude && typeof window.claude.use === 'function') dlCap = await window.claude.use('downloads'); } catch(e){ dlCap = null; }
  return dlCap;
}
U.inArtifact = () => !!(window.claude && typeof window.claude.use === 'function');
U.saveFile = async function(name, data, mime){
  const blob = data instanceof Blob ? data : new Blob([data], {type: mime||'application/octet-stream'});
  const dl = U.inArtifact() ? await getDl() : null;
  if (dl){
    try { await dl.save({filename:name, data:blob}); U.toast(t('saved',{f:name}), 'ok'); return true; }
    catch(e){ if (e && e.code==='declined') U.toast(t('save_declined')); else U.toast(t('error',{e:(e&&e.message)||e.code}), 'err'); return false; }
  }
  if (U.inArtifact() && !dl){ U.toast(t('save_unavail'), 'err'); return false; }
  /* Android app (Capacitor): blob downloads do not work in the WebView, so write to Documents/Wathiq and offer the share sheet */
  const cap = window.Capacitor, P = (cap && cap.Plugins) || {};
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && P.Filesystem){
    const b64 = await new Promise((ok, bad)=>{ const r = new FileReader(); r.onload = ()=>ok(String(r.result).split(',')[1]); r.onerror = bad; r.readAsDataURL(blob); });
    const safe = String(name).replace(/[\\/:*?"<>|]/g, '_');
    let w = null, where = '';
    try { w = await P.Filesystem.writeFile({path:'Wathiq/'+safe, data:b64, directory:'DOCUMENTS', recursive:true}); where = 'Documents/Wathiq/'+safe; }
    catch(e){ try { w = await P.Filesystem.writeFile({path:safe, data:b64, directory:'CACHE'}); } catch(e2){ U.toast(t('error',{e:e2.message||e2}), 'err'); return false; } }
    if (where) U.toast(t('saved',{f:where}), 'ok');
    if (P.Share && w && w.uri) P.Share.share({title:safe, url:w.uri, dialogTitle:safe}).catch(()=>{});
    return true;
  }
  if (window.showSaveFilePicker && !/Mobi/.test(navigator.userAgent) && U.store.get('useFsApi', false)){
    try { const h = await showSaveFilePicker({suggestedName:name}); const w = await h.createWritable(); await w.write(blob); await w.close(); U.toast(t('saved',{f:name}),'ok'); return true; } catch(e){ if (e.name==='AbortError') return false; }
  }
  const url = URL.createObjectURL(blob);
  const a = U.h('a', {href:url, download:name}); document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
  U.toast(t('saved',{f:name}), 'ok'); return true;
};

/* generic modal */
U.modal = function(title, body, buttons, opts={}){
  const bd = U.h('div', {class:'bd'}, body);
  const ft = U.h('footer');
  const dlg = U.h('div', {class:'dlg', role:'dialog', 'aria-modal':'true', 'aria-label':title, style: opts.xl ? {width:'min(1180px,100%)', height:'min(92vh,100%)'} : opts.wide?{width:'min(860px,100%)'}:null},
    U.h('header', null, U.h('h2', null, title), U.h('button', {class:'ibtn', 'aria-label':t('close'), onclick:()=>close(), html:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>'})),
    bd, ft);
  const m = U.h('div', {class:'modal'}, dlg);
  m.addEventListener('pointerdown', e=>{ if (e.target===m && !opts.sticky) close(); });
  const onKey = e=>{ if (e.key==='Escape' && !opts.sticky) close(); };
  document.addEventListener('keydown', onKey);
  function close(v){ m.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(v); }
  (buttons||[]).forEach(b=>{ const el = U.h('button', {class:'btn '+(b.kind||''), onclick:()=>b.onClick ? b.onClick(close, el) : close()}, b.label); if (b.id) el.id=b.id; ft.append(el); });
  if (!buttons || !buttons.length) ft.remove();
  document.body.append(m);
  setTimeout(()=>{ const f = dlg.querySelector('input,select,textarea,button.primary'); f && f.focus(); }, 30);
  return {el:m, dlg, body:bd, footer:ft, close};
};
U.ask = function(title, msg, okLabel, kind){
  return new Promise(res=>{ U.modal(title, U.h('p', null, msg), [
    {label:t('cancel'), onClick:c=>{c(); res(false);} }, {label:okLabel||t('done'), kind:kind||'primary', onClick:c=>{c(); res(true);} }], {onClose:()=>res(false)}); });
};
U.askPassword = function(msg){
  return new Promise(res=>{
    const inp = U.h('input', {class:'field', type:'password', id:'pwIn', autocomplete:'current-password', style:{width:'100%'}});
    let done=false;
    const m = U.modal(t('need_pw'), [U.h('p', null, msg||t('need_pw')), U.h('label', {for:'pwIn', class:'note'}, t('password')), inp],
      [{label:t('cancel'), onClick:c=>{done=true;c();res(null);}}, {label:t('unlock'), kind:'primary', onClick:c=>{done=true;c();res(inp.value);}}],
      {onClose:()=>{ if(!done) res(null); }});
    inp.addEventListener('keydown', e=>{ if (e.key==='Enter'){ done=true; m.close(); res(inp.value);} });
  });
};
U.pickFiles = function(accept, multiple, capture){
  return new Promise(res=>{
    const i = U.h('input', {type:'file', accept:accept||'', class:'hidden-file'}); if (multiple) i.multiple = true; if (capture) i.setAttribute('capture', 'environment');
    i.onchange = ()=>{ res(Array.from(i.files||[])); i.remove(); };
    i.addEventListener('cancel', ()=>{ res([]); i.remove(); });
    document.body.append(i); i.click();
  });
};

/* cancellable task with progress */
U.Task = class { constructor(onProg){ this.canceled=false; this.onProg=onProg||(()=>{}); } check(){ if (this.canceled) throw Object.assign(new Error(t('canceled')), {canceled:true}); } prog(p, label){ this.onProg(p, label); } };

/* organisation logos shown in the header and on issued documents; user list (this browser) overrides config */
U.orgLogos = function(){ const own = U.store.get('orgLogos', null); if (Array.isArray(own)) return own; return ((window.WATHIQ_CONFIG||{}).orgLogos||[]).map((l,i)=>Object.assign({id:'cfg'+i, show:true, onDocs:true}, l)); };

/* ---------- canvas & image helpers ---------- */
U.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
U.canvasBlob = (c, type='image/png', q) => new Promise(res=>c.toBlob(res, type, q));
U.loadImage = src => new Promise((res, rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('image')); i.src = src; });
U.blobToDataURL = b => U.readDataURL(b);
U.dataURLtoBytes = d => { const b = atob(d.split(',')[1]); const a = new Uint8Array(b.length); for (let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; };

/* trim transparent borders */
U.trimCanvas = function(c){
  const ctx = c.getContext('2d'); const {width:w, height:h} = c; const d = ctx.getImageData(0,0,w,h).data;
  let x0=w, y0=h, x1=-1, y1=-1;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (d[(y*w+x)*4+3] > 8){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if (x1<0) return c;
  const pad = 4; x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad); x1=Math.min(w-1,x1+pad); y1=Math.min(h-1,y1+pad);
  const o = U.canvas(x1-x0+1, y1-y0+1); o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
};
/* background removal: color-distance keying from a sampled or given background colour with a soft edge.
   Works locally, best for light/single-colour backgrounds (signatures, stamps, logos on paper). */
U.removeBackground = function(img, opts={}){
  const maxSide = opts.maxSide || 1600;
  const sc = Math.min(1, maxSide/Math.max(img.width, img.height));
  const c = U.canvas(img.width*sc, img.height*sc); const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0,0,c.width,c.height); const d = id.data; const w = c.width, h = c.height;
  let bg = opts.color;
  if (!bg){ // median of border pixels
    const rs=[], gs=[], bs=[]; const step = Math.max(1, Math.floor((w+h)/400));
    for (let x=0;x<w;x+=step){ for (const y of [0,h-1]){ const i=(y*w+x)*4; rs.push(d[i]); gs.push(d[i+1]); bs.push(d[i+2]); } }
    for (let y=0;y<h;y+=step){ for (const x of [0,w-1]){ const i=(y*w+x)*4; rs.push(d[i]); gs.push(d[i+1]); bs.push(d[i+2]); } }
    const med = a => a.sort((p,q)=>p-q)[a.length>>1];
    bg = [med(rs), med(gs), med(bs)];
  }
  const tol = (opts.threshold ?? 40) * 4.4; const soft = Math.max(12, tol*0.35);
  for (let i=0;i<d.length;i+=4){
    const dist = Math.sqrt((d[i]-bg[0])**2 + (d[i+1]-bg[1])**2 + (d[i+2]-bg[2])**2);
    let a = dist <= tol ? 0 : dist >= tol+soft ? 1 : (dist-tol)/soft;
    d[i+3] = Math.round(d[i+3]*a);
    if (opts.clean && a>0){ // deepen ink: push colour away from background
      const k = 0.67; d[i] = Math.round(d[i]*k); d[i+1] = Math.round(d[i+1]*k); d[i+2] = Math.round(d[i+2]*k);
      d[i+3] = Math.min(255, Math.round(d[i+3]*1.15));
    }
  }
  ctx.putImageData(id, 0, 0);
  return opts.trim===false ? c : U.trimCanvas(c);
};
U.hexToRgb = h => { h = h.replace('#',''); if (h.length===3) h = h.split('').map(x=>x+x).join(''); const n = parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; };
U.rotateImage = async function(src, deg){
  const img = await U.loadImage(src); const r = ((deg%360)+360)%360; const sw = r%180!==0;
  const c = U.canvas(sw?img.height:img.width, sw?img.width:img.height); const ctx = c.getContext('2d');
  ctx.translate(c.width/2, c.height/2); ctx.rotate(r*Math.PI/180); ctx.drawImage(img, -img.width/2, -img.height/2);
  return c.toDataURL('image/png');
};
U.cropImage = async function(src, r){ // r normalized {x,y,w,h}
  const img = await U.loadImage(src);
  const c = U.canvas(img.width*r.w, img.height*r.h); c.getContext('2d').drawImage(img, img.width*r.x, img.height*r.y, c.width, c.height, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
};

/* render text to a canvas (browser shaping handles Arabic correctly) */
U.drawTextBlock = function(ctx, text, o){
  // o: {x,y,w,h,font,sizePx,color,bold,italic,align,lineHeight,dir}
  const lines = String(text||'').split('\n');
  ctx.save();
  ctx.fillStyle = o.color || '#000';
  ctx.font = `${o.italic?'italic ':''}${o.bold?'700 ':'400 '}${o.sizePx}px ${o.font}`;
  const rtl = o.dir ? o.dir==='rtl' : U.isAr(text);
  try { ctx.direction = rtl ? 'rtl' : 'ltr'; } catch(e){}
  ctx.textBaseline = 'top';
  const lh = o.sizePx * (o.lineHeight || 1.25);
  const wrap = [];
  for (const ln of lines){ // word wrap
    if (!o.w){ wrap.push(ln); continue; }
    const words = ln.split(/(\s+)/); let cur = '';
    for (const wd of words){ const test = cur + wd; if (ctx.measureText(test).width > o.w && cur.trim()){ wrap.push(cur.trimEnd()); cur = wd.trimStart(); } else cur = test; }
    wrap.push(cur);
  }
  let al = o.align || 'start';
  wrap.forEach((ln, i)=>{
    let x;
    const a = al==='center' ? 'center' : (al==='start' ? (rtl?'right':'left') : (al==='end' ? (rtl?'left':'right') : al));
    ctx.textAlign = a;
    x = a==='center' ? o.x + o.w/2 : a==='right' ? o.x + o.w : o.x;
    ctx.fillText(ln, x, o.y + i*lh + o.sizePx*0.08);
  });
  ctx.restore();
  return wrap.length * lh;
};
U.measureTextBlock = function(text, font, sizePx, bold, maxW){
  const c = U.canvas(4,4).getContext('2d'); c.font = `${bold?'700 ':'400 '}${sizePx}px ${font}`;
  const lines = String(text||'').split('\n'); let w = 0; for (const l of lines) w = Math.max(w, c.measureText(l).width);
  return {w: maxW ? Math.min(w, maxW) : w, h: lines.length * sizePx * 1.25};
};
U.fontStack = f => `"${f}", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif`;
U.ensureFonts = async function(fams){ try { await Promise.all(fams.map(f=>document.fonts.load(`16px "${f}"`, 'أب Ab'))); } catch(e){} };

/* icons (simple stroke glyphs) */
U.ico = function(name){
  const P = {
    merge:'<path d="M7 4v6a5 5 0 005 5h0a5 5 0 015 5v0M17 4v6"/><path d="M14 7l3-3 3 3"/><path d="M4 7l3-3 3 3"/>',
    split:'<path d="M12 3v18M5 7l-2 5 2 5M19 7l2 5-2 5"/>',
    organize:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>',
    remove:'<path d="M6 3h9l4 4v14H6z"/><path d="M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
    extract:'<path d="M6 3h9l4 4v14H6z"/><path d="M12 10v7m0 0l-3-3m3 3l3-3"/>',
    rotate:'<path d="M20 4v6h-6"/><path d="M19 15a8 8 0 11-2-8.5L20 10"/>',
    compress:'<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
    repair:'<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.8-.6-.6-2.8z"/>',
    ocr:'<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    file:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>',
    close:'<path d="M6 6l12 12M18 6L6 18"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    lang:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    hub:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    inspect:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6M8 9h5M8 12h4"/>',
    img2pdf:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    word:'<path d="M6 3h9l4 4v14H6z"/><path d="M8.5 11l1.5 6 2-4.5 2 4.5 1.5-6"/>',
    excel:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 11l6 7M15 11l-6 7"/>',
    ppt:'<path d="M6 3h9l4 4v14H6z"/><path d="M10 18v-7h2.5a2 2 0 010 4H10"/>',
    html:'<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    text:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    pdf2img:'<path d="M6 3h9l4 4v14H6z"/><circle cx="10" cy="12" r="1.5"/><path d="M18 18l-4-4-6 6"/>',
    md:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 15V9l2.5 3L12 9v6M16 9v6m0 0l-2-2m2 2l2-2"/>',
    number:'<path d="M6 3h9l4 4v14H6z"/><path d="M10 17h4M12 13v4M11 13.5l1-.5"/>',
    watermark:'<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
    crop:'<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    form:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 14h10M14 9h3"/>',
    lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    unlock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>',
    sign:'<path d="M3 17c3-1 4-7 6-7s1 6 3 6 2-3 4-3 2 2 5 2"/><path d="M3 21h18"/>',
    redact:'<rect x="3" y="5" width="18" height="4" rx="1" fill="currentColor"/><path d="M3 13h10M3 17h14"/>',
    meta:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 13l6 6M15 13l-6 6"/>',
    zip:'<path d="M6 3h12v18H6z"/><path d="M11 3v2h2v2h-2v2h2v2h-2v2h2"/>',
    unzip:'<path d="M6 3h12v18H6z"/><path d="M12 14v5m0 0l-2-2m2 2l2-2"/><path d="M11 3v2h2v2h-2v2h2"/>',
    imgconv:'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M14 7h4v4M10 17H6v-4"/>',
    bg:'<path d="M12 3a9 9 0 100 18"/><path d="M12 3v18M12 7h4M12 11h6M12 15h5"/>',
    select:'<path d="M5 3l14 8-6 2-2 6z"/>',
    edittext:'<path d="M4 6V4h12v2M10 4v12"/><path d="M14 20l6-6-2-2-6 6v2z"/>',
    addtext:'<path d="M5 6V4h12v2M11 4v16M8 20h6"/><path d="M19 15v6M16 18h6"/>',
    highlight:'<path d="M9 11l-5 5v4h4l5-5"/><path d="M9 11l6-6 4 4-6 6z"/><path d="M4 20h16" stroke-opacity=".4" stroke-width="3"/>',
    underline:'<path d="M7 4v6a5 5 0 0010 0V4M5 20h14"/>',
    strike:'<path d="M5 12h14M16 6.5A4 3 0 008 7c0 4 8 3 8 7a4 3 0 01-8 1"/>',
    rect:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse:'<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    line:'<path d="M5 19L19 5"/>',
    arrow:'<path d="M5 19L19 5M10 5h9v9"/>',
    pen:'<path d="M3 21c4-1 3-6 7-8s6 2 8-1 1-6 3-8"/>',
    note:'<path d="M4 4h16v12H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    stamp:'<path d="M9 13V9a3 3 0 116 0v4"/><path d="M4 13h16v4H4zM6 21h12"/>',
    link:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    whiteout:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14l3-4 3 4M14 12h3"/>',
    field:'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 10v4"/>',
    check:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
    cloud:'<path d="M7 18a4 4 0 01-.6-8A6 6 0 0118 8.5 4.5 4.5 0 0117.5 18z"/>',
    compare:'<path d="M6 3h5v18H6zM13 3h5v18h-5"/><path d="M8.5 8h0M15.5 8h0"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name]||P.edit}</svg>`;
};
})();
