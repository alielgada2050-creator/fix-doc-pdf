/* وثيق — signatures, stamps, image crop and background cleanup dialogs */
(function(){
const Sig = window.Sig = {};
const {h, $} = U;
const SIG_FONTS = ['Aref Ruqaa','Reem Kufi','Amiri','Great Vibes','Dancing Script'];

Sig.open = function(cb){
  const tabs = ['draw','type','upload','saved'];
  const tabBar = h('div', {class:'tabs', role:'tablist'});
  const panes = {};
  let current = 'draw';
  let color = '#0b2a8a';
  /* draw */
  const pad = h('canvas', {class:'sigpad', 'aria-label':t('sig_draw')});
  const colorSel = h('div', {class:'row'}, ...['#111111','#0b2a8a','#b42318'].map(c=>h('button', {class:'btn', style:{color:c}, onclick:()=>{ color=c; }}, '●')),
    h('label', {for:'sigW', class:'note'}, t('width')), h('input', {type:'range', id:'sigW', min:1, max:8, step:0.5, value:2.6}),
    h('button', {class:'btn', onclick:()=>{ strokes=[]; redraw(); }}, t('sig_clear')));
  panes.draw = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}}, pad, colorSel);
  let strokes = [], curS = null;
  function redraw(){ const r = pad.getBoundingClientRect(); const d = Math.min(devicePixelRatio||1, 2); pad.width = r.width*d; pad.height = r.height*d;
    const ctx = pad.getContext('2d'); ctx.scale(d, d); ctx.lineCap='round'; ctx.lineJoin='round';
    for (const s of strokes){ ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.beginPath(); s.p.forEach((q,i)=> i ? ctx.lineTo(q[0],q[1]) : ctx.moveTo(q[0],q[1])); if (s.p.length===1) ctx.lineTo(s.p[0][0]+0.1, s.p[0][1]); ctx.stroke(); } }
  pad.addEventListener('pointerdown', e=>{ pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); curS = {c:color, w:+$('#sigW').value * (e.pressure && e.pointerType==='pen' ? 0.6+e.pressure : 1), p:[[e.clientX-r.left, e.clientY-r.top]]}; strokes.push(curS); redraw(); });
  pad.addEventListener('pointermove', e=>{ if (!curS) return; const r = pad.getBoundingClientRect(); curS.p.push([e.clientX-r.left, e.clientY-r.top]); redraw(); });
  pad.addEventListener('pointerup', ()=>curS=null); pad.addEventListener('pointercancel', ()=>curS=null);
  /* type */
  const nameIn = h('input', {class:'field', id:'sigName', dir:'auto', placeholder:t('sig_name'), style:{width:'100%', fontSize:'16px'}});
  const fontSel = h('select', {class:'field', id:'sigFont'}, SIG_FONTS.map(f=>h('option', {value:f}, f)));
  const typeColor = h('input', {type:'color', value:'#0b2a8a'});
  const prev = h('canvas', {style:{width:'100%', height:'120px', background:'#fff', border:'1px solid var(--line)', borderRadius:'10px'}});
  const drawTyped = async ()=>{ await U.ensureFonts([fontSel.value]); const c = prev; c.width = 900; c.height = 240; const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
    U.drawTextBlock(ctx, nameIn.value || (LANG==='ar'?'التوقيع':'Signature'), {x:20, y:50, w:860, h:200, font:`"${fontSel.value}", cursive`, sizePx:110, color:typeColor.value, align:'center'}); };
  [nameIn, fontSel, typeColor].forEach(i=>i.addEventListener('input', drawTyped));
  panes.type = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}}, nameIn, h('div', {class:'row'}, fontSel, typeColor), prev);
  /* upload */
  let upImg = null, upOut = null;
  const thr = h('input', {type:'range', id:'sigThr', min:0, max:100, value:38});
  const clean = h('input', {type:'checkbox', id:'sigClean', checked:true});
  const upPrev = h('div', {class:'checker', style:{borderRadius:'10px', minHeight:'140px', display:'grid', placeItems:'center', padding:'8px'}});
  const doBg = ()=>{ if (!upImg) return; upOut = U.removeBackground(upImg, {threshold:+thr.value, clean:clean.checked}); upPrev.innerHTML=''; upPrev.append(h('img', {src:upOut.toDataURL('image/png'), class:'preview-img'})); };
  thr.addEventListener('input', doBg); clean.addEventListener('change', doBg);
  panes.upload = h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}},
    h('button', {class:'btn', onclick:async()=>{ const [f] = await U.pickFiles('image/*'); if (!f) return; upImg = await U.loadImage(await U.readDataURL(f)); doBg(); }}, t('add_files')),
    h('p', {class:'note'}, t('bg_hint')), h('div', {class:'row'}, h('label', {for:'sigThr'}, t('bg_thresh')), thr), h('label', {class:'row'}, clean, t('clean_ink')), upPrev);
  /* saved */
  const savedWrap = h('div', {class:'sigs'});
  const renderSaved = ()=>{ savedWrap.innerHTML=''; const list = U.store.get('sigs', []);
    if (!list.length) savedWrap.append(h('p', {class:'note'}, LANG==='ar'?'لا توجد تواقيع محفوظة على هذا الجهاز.':'No signatures saved on this device.'));
    list.forEach((u,i)=>savedWrap.append(h('button', {title:t('sig_use'), onclick:()=>{ m.close(); cb(u); }}, h('img', {src:u, alt:''}),
      h('span', {style:{position:'absolute', top:'2px', insetInlineEnd:'4px', color:'var(--err)'}, onclick:e=>{ e.stopPropagation(); list.splice(i,1); U.store.set('sigs', list); renderSaved(); }}, '✕')))); };
  panes.saved = h('div', null, savedWrap, h('p', {class:'note'}, LANG==='ar'?'التواقيع المحفوظة تبقى في متصفح هذا الجهاز فقط.':'Saved signatures stay in this device’s browser only.'));
  const paneWrap = h('div');
  const show = k=>{ current = k; tabBar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.k===k))); paneWrap.innerHTML=''; paneWrap.append(panes[k]); if (k==='draw') setTimeout(redraw, 10); if (k==='type') drawTyped(); if (k==='saved') renderSaved(); };
  tabs.forEach(k=>tabBar.append(h('button', {role:'tab', 'data-k':k, onclick:()=>show(k)}, t('sig_'+k))));
  const keep = h('input', {type:'checkbox', id:'sigKeep', checked:true});
  const body = [tabBar, paneWrap, h('label', {class:'row'}, keep, t('sig_save')), h('p', {class:'callout info'}, t('sig_legal'))];
  const m = U.modal(t('sig_title'), body, [{label:t('cancel')}, {label:t('sig_use'), kind:'primary', onClick: close=>{
    let c = null;
    if (current==='draw'){ if (!strokes.length) return U.toast(LANG==='ar'?'ارسم توقيعك أولًا.':'Draw your signature first.'); c = U.trimCanvas(pad); }
    else if (current==='type'){ if (!nameIn.value.trim()) return U.toast(t('sig_name')); c = U.trimCanvas(prev); }
    else if (current==='upload'){ if (!upOut) return U.toast(t('add_files')); c = upOut; }
    else return;
    const url = c.toDataURL('image/png');
    if (keep.checked && current!=='saved'){ const l = U.store.get('sigs', []); l.unshift(url); U.store.set('sigs', l.slice(0,6)); }
    close(); cb(url);
  }}]);
  show('draw');
};

Sig.stamp = function(cb){
  const txt = h('input', {class:'field', id:'stTxt', dir:'auto', value: LANG==='ar' ? 'معتمد' : 'APPROVED', style:{width:'100%'}});
  const sub = h('input', {class:'field', id:'stSub', dir:'auto', placeholder: LANG==='ar' ? 'سطر إضافي (اسم الجهة)' : 'Second line (organization)', style:{width:'100%'}});
  const shape = h('select', {class:'field', id:'stShape'}, h('option', {value:'round'}, t('stamp_round')), h('option', {value:'rect'}, t('stamp_rect')));
  const col = h('input', {type:'color', value:'#b42318'});
  const dt = h('input', {type:'checkbox', checked:true});
  const presets = h('div', {class:'row'}, ...(LANG==='ar' ? ['معتمد','مرفوض','تمت المراجعة','سري','نسخة','مدفوع'] : ['APPROVED','REJECTED','REVIEWED','CONFIDENTIAL','COPY','PAID']).map(s=>h('button', {class:'chip', onclick:()=>{ txt.value = s; draw(); }}, s)));
  const cv = h('canvas', {style:{width:'220px', maxWidth:'100%', height:'auto', display:'block', margin:'auto'}});
  async function draw(){
    await U.ensureFonts(['Cairo','Reem Kufi']);
    const round = shape.value==='round'; const W = round ? 600 : 760, H = round ? 600 : 300; cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.clearRect(0,0,W,H); ctx.strokeStyle = ctx.fillStyle = col.value; ctx.lineWidth = 14;
    if (round){ ctx.beginPath(); ctx.arc(W/2,H/2,W/2-12,0,Math.PI*2); ctx.stroke(); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(W/2,H/2,W/2-42,0,Math.PI*2); ctx.stroke(); }
    else { ctx.strokeRect(10,10,W-20,H-20); ctx.lineWidth = 4; ctx.strokeRect(30,30,W-60,H-60); }
    const lines = [txt.value, sub.value, dt.checked ? new Date().toLocaleDateString(LANG==='ar'?'ar-SA-u-ca-gregory-nu-arab':'en-GB') : ''].filter(Boolean);
    const big = round ? 96 : 110; let y = H/2 - (lines.length>1 ? (lines.length-1)*34 : 0) - big*0.55;
    lines.forEach((ln,i)=>{ const sz = i===0 ? big : 46; U.drawTextBlock(ctx, ln, {x:50, y, w:W-100, h:sz*1.3, font:'"Cairo","Reem Kufi",sans-serif', sizePx:sz, bold:true, color:col.value, align:'center'}); y += sz*1.25; });
    // slight ink texture
    const id = ctx.getImageData(0,0,W,H); for (let i=3;i<id.data.length;i+=4){ if (id.data[i] && Math.random()<0.06) id.data[i] = id.data[i]*0.55; } ctx.putImageData(id,0,0);
  }
  [txt, sub, shape, col, dt].forEach(e=>e.addEventListener('input', draw));
  U.modal(t('stamp_title'), [presets, h('label', {for:'stTxt', class:'note'}, t('stamp_text')), txt, sub,
    h('div', {class:'row'}, h('label', {for:'stShape'}, t('stamp_shape')), shape, col, h('label', {class:'row'}, dt, t('stamp_date'))),
    h('div', {class:'checker', style:{borderRadius:'10px', padding:'10px'}}, cv),
    h('button', {class:'btn', onclick:async()=>{ const [f] = await U.pickFiles('image/*'); if (!f) return; const url = await U.readDataURL(f); document.querySelector('.modal:last-of-type')?.remove(); Sig.bgDialog(url, cb, true); }}, t('stamp_upload'))],
    [{label:t('cancel')}, {label:t('sig_use'), kind:'primary', onClick:close=>{ close(); cb(U.trimCanvas(cv).toDataURL('image/png')); }}]);
  draw();
};

Sig.bgDialog = async function(url, cb, optional){
  const img = await U.loadImage(url);
  const thr = h('input', {type:'range', id:'bgThr', min:0, max:100, value:36});
  const mode = h('select', {class:'field', id:'bgMode'}, h('option', {value:'auto'}, t('bg_auto')), h('option', {value:'pick'}, t('bg_color')));
  const pick = h('input', {type:'color', value:'#ffffff'});
  const clean = h('input', {type:'checkbox'});
  const out = h('div', {class:'checker', style:{borderRadius:'10px', minHeight:'160px', display:'grid', placeItems:'center', padding:'8px'}});
  let res = null;
  const run = ()=>{ res = U.removeBackground(img, {threshold:+thr.value, clean:clean.checked, color: mode.value==='pick' ? U.hexToRgb(pick.value) : null}); out.innerHTML=''; out.append(h('img', {class:'preview-img', src:res.toDataURL('image/png')})); };
  [thr, mode, pick, clean].forEach(e=>e.addEventListener('input', run));
  const btns = [{label:t('cancel')}];
  if (optional) btns.push({label: LANG==='ar'?'بدون إزالة':'Keep as is', onClick:c=>{ c(); cb(url); }});
  btns.push({label:t('done'), kind:'primary', onClick:c=>{ c(); cb(res.toDataURL('image/png')); }});
  U.modal(t('removebg'), [h('p', {class:'note'}, t('bg_hint')), h('div', {class:'row'}, h('label', {for:'bgThr'}, t('bg_thresh')), thr), h('div', {class:'row'}, mode, pick), h('label', {class:'row'}, clean, t('clean_ink')), out,
    h('p', {class:'note'}, LANG==='ar'?'تتم المعالجة محليًا. الصور ذات الخلفيات المعقدة (أشخاص، مناظر) تحتاج نموذج ذكاء اصطناعي غير مدمج.':'Processed locally. Complex backgrounds (people, scenery) need an AI model that is not built in.')], btns);
  run();
};

Sig.crop = async function(url, cb){
  const img = await U.loadImage(url);
  const cv = h('canvas', {style:{width:'100%', maxHeight:'55vh', touchAction:'none', display:'block', background:'#fff', borderRadius:'8px'}});
  const maxW = 900; const sc = Math.min(1, maxW/img.width); cv.width = img.width*sc; cv.height = img.height*sc;
  let r = {x:0.05, y:0.05, w:0.9, h:0.9}, st = null;
  const draw = ()=>{ const ctx = cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.rect(0,0,cv.width,cv.height); ctx.rect(r.x*cv.width, r.y*cv.height, r.w*cv.width, r.h*cv.height); ctx.fill('evenodd');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6,4]); ctx.strokeRect(r.x*cv.width, r.y*cv.height, r.w*cv.width, r.h*cv.height); };
  const pos = e=>{ const b = cv.getBoundingClientRect(); return [Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)), Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))]; };
  cv.addEventListener('pointerdown', e=>{ cv.setPointerCapture(e.pointerId); st = pos(e); });
  cv.addEventListener('pointermove', e=>{ if (!st) return; const p = pos(e); r = {x:Math.min(st[0],p[0]), y:Math.min(st[1],p[1]), w:Math.abs(p[0]-st[0]), h:Math.abs(p[1]-st[1])}; draw(); });
  cv.addEventListener('pointerup', ()=>{ st = null; if (r.w<0.02 || r.h<0.02){ r = {x:0,y:0,w:1,h:1}; draw(); } });
  U.modal(t('crop_title'), [h('p', {class:'note'}, t('crop_hint')), cv], [{label:t('cancel')}, {label:t('done'), kind:'primary', onClick:async c=>{ c(); cb(await U.cropImage(url, r)); }}]);
  draw();
};
})();
