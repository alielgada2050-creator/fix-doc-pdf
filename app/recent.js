/* وثيق — recent files (resume where you left off) and a quick command search (Ctrl/⌘ K).
   Recent files are kept in this browser only (IndexedDB), never uploaded; the list can be cleared at any time. */
(function(){
const R = window.Recent = {};
const {h, $} = U;
const MAX = 6, MAX_BYTES = 40 * 1048576;
let dbp = null;
const db = () => dbp || (dbp = new Promise((ok, bad)=>{ const r = indexedDB.open('wq-recent', 1); r.onupgradeneeded = ()=>r.result.createObjectStore('files', {keyPath:'id'}); r.onsuccess = ()=>ok(r.result); r.onerror = ()=>bad(r.error); }));
const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, bad)=>{ const t = d.transaction('files', mode); const st = t.objectStore('files'); const res = fn(st); t.oncomplete = ()=>ok(res && res.result); t.onerror = ()=>bad(t.error); }); };
R.enabled = () => U.store.get('recentOn', true);
R.list = async () => { try { const all = await tx('readonly', st=>st.getAll()); return (all||[]).sort((a,b)=>b.at-a.at); } catch(e){ return []; } };
R.add = async function(file){
  if (!R.enabled() || !file || file.size > MAX_BYTES) return;
  try {
    const id = file.name + ':' + file.size; const blob = file.slice(0, file.size, file.type);
    await tx('readwrite', st=>st.put({id, name:file.name, size:file.size, type:file.type, at:Date.now(), blob}));
    const all = await R.list(); for (const old of all.slice(MAX)) await tx('readwrite', st=>st.delete(old.id));
    R.render();
  } catch(e){ console.warn('recent', e); }
};
R.remove = async id => { await tx('readwrite', st=>st.delete(id)); R.render(); };
R.clear = async () => { await tx('readwrite', st=>st.clear()); R.render(); };
const ago = ts => { const m = Math.round((Date.now()-ts)/60000); if (m < 1) return X('الآن','now'); if (m < 60) return X(`قبل ${m} د`,`${m} min ago`); const hh = Math.round(m/60); if (hh < 24) return X(`قبل ${hh} س`,`${hh} h ago`); const d = Math.round(hh/24); return X(`قبل ${d} يوم`,`${d} d ago`); };
R.render = async function(){
  const box = $('#recent'); if (!box) return;
  const items = R.enabled() ? await R.list() : [];
  if (!items.length){ box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(
    h('div', {class:'recent-h'}, h('h2', {class:'group-h'}, X('تابع من حيث توقفت','Pick up where you left off')),
      h('button', {class:'btn sm ghost', onclick:()=>R.clear()}, X('مسح القائمة','Clear list'))),
    h('div', {class:'recent'}, items.map(it=>h('div', {class:'rfile'},
      h('button', {class:'rfile-open', onclick:async()=>{ const f = new File([it.blob], it.name, {type:it.type||'application/pdf'}); await App.openFiles([f], true); }},
        h('span', {class:'rfile-ic', html:U.ico(/pdf$/i.test(it.name) ? 'file' : 'image')}), h('span', {class:'rfile-t'}, h('b', null, h('bdi', null, U.baseName(it.name)), U.ext(it.name) ? h('span', {class:'ext'}, U.ext(it.name).toUpperCase()) : null), h('small', null, `${U.fmtSize(it.size)} · ${ago(it.at)}`))),
      h('button', {class:'ibtn', 'aria-label':X('إزالة من القائمة','Remove from list'), onclick:()=>R.remove(it.id), html:U.ico('close')})))),
    h('p', {class:'note'}, X('محفوظة على هذا الجهاز فقط ولا تُرفع إلى أي مكان.','Kept on this device only, never uploaded.')));
};

/* ---------- command search ---------- */
R.palette = function(){
  if (document.querySelector('.cmdk')) return;
  const views = [['hub',t('nav_tools')],['editor',t('nav_editor')],['work',t('nav_work')],['auto',t('nav_auto')],['ai',t('nav_ai')],['cloud',t('nav_cloud')],['support',t('nav_support')]];
  const all = [
    ...Tools.list.map(tl=>({k:'tool', id:tl.id, label:L(tl.n), sub:L(tl.d), ico:tl.ico})),
    ...views.map(([v,l])=>({k:'view', id:v, label:l, sub:X('انتقل إلى القسم','Go to section'), ico:'hub'})),
    {k:'act', id:'open', label:t('choose_file'), sub:X('افتح PDF أو صورة في المحرر','Open a PDF or image in the editor'), ico:'file'},
    {k:'act', id:'theme', label:X('تبديل المظهر','Switch appearance'), sub:X('عادي، داكن، مشرق','Light, dark, bright'), ico:'sun'},
    {k:'act', id:'lang', label:LANG==='ar' ? 'English' : 'العربية', sub:X('تغيير اللغة','Change language'), ico:'lang'},
  ];
  let sel = 0, shown = all;
  const inp = h('input', {class:'field', type:'search', role:'combobox', 'aria-expanded':'true', 'aria-controls':'cmdkList', placeholder:X('ابحث عن أداة أو قسم…','Search tools and sections…'), autocomplete:'off'});
  const list = h('div', {class:'cmdk-list', id:'cmdkList', role:'listbox'});
  const norm = s => OCR && OCR.norm ? OCR.norm(s) : String(s).toLowerCase();
  const draw = () => { list.replaceChildren(...shown.slice(0, 40).map((it, i)=>h('button', {class:'cmdk-it', role:'option', 'aria-selected':String(i===sel), onclick:()=>go(it), onmousemove:()=>{ if (sel!==i){ sel = i; draw(); } }},
      h('span', {class:'ti', html:U.ico(it.ico||'hub')}), h('span', {class:'cmdk-t'}, h('b', null, it.label), h('small', null, it.sub))))); const a = list.children[sel]; a && a.scrollIntoView({block:'nearest'}); };
  const filter = () => { const q = norm(inp.value.trim()); shown = !q ? all : all.filter(it=>norm(it.label+' '+it.sub+' '+it.id).includes(q)); sel = 0; draw(); };
  const m = U.modal(X('بحث سريع','Quick search'), h('div', {class:'cmdk'}, inp, list, h('p', {class:'note'}, X('↑ ↓ للتنقل • Enter للفتح • Esc للإغلاق','↑ ↓ to move • Enter to open • Esc to close'))), [], {});
  const go = it => { m.close();
    if (it.k==='tool') Tools.open(it.id); else if (it.k==='view') App.go(it.id);
    else if (it.id==='open') $('#openFile').click(); else if (it.id==='theme'){ const order = ['light','dark','bright']; const cur = U.store.get('skin','light'); App.setSkin(order[(order.indexOf(cur)+1)%3]); }
    else if (it.id==='lang') App.setLang(LANG==='ar' ? 'en' : 'ar'); };
  inp.addEventListener('input', filter);
  inp.addEventListener('keydown', e=>{ if (e.key==='ArrowDown'){ sel = Math.min(shown.length-1, sel+1); draw(); e.preventDefault(); } else if (e.key==='ArrowUp'){ sel = Math.max(0, sel-1); draw(); e.preventDefault(); } else if (e.key==='Enter' && shown[sel]){ go(shown[sel]); e.preventDefault(); } });
  draw(); setTimeout(()=>inp.focus(), 40);
};
document.addEventListener('keydown', e=>{
  const typing = /input|textarea|select/i.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); R.palette(); }
  else if (!typing && e.key==='/' && !document.querySelector('.modal')){ e.preventDefault(); R.palette(); }
});
})();
