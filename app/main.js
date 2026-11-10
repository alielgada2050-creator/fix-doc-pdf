/* وثيق — app shell: navigation, opening files, language/theme, support page, offline */
(function(){
const App = window.App = {};
const {h, $, $$} = U;
const CFG = window.WATHIQ_CONFIG || {};

const VIEWS = ['hub','editor','work','auto','ai','cloud','support'];
const TABS = [['hub','nav_tools','organize'],['editor','nav_editor','edit'],['work','nav_work','stamp'],['auto','nav_auto','merge'],['ai','nav_ai','note'],['support','nav_support','link']];
App.go = function(view){
  if (!VIEWS.includes(view)) view = 'hub';
  $$('.view').forEach(v=>v.classList.toggle('on', v.id===view));
  $$('#nav button, #tabbar button').forEach(b=>b.setAttribute('aria-current', b.dataset.view===view ? 'page' : 'false'));
  document.body.classList.toggle('ed', view==='editor' && !!E.doc);
  try { if (location.hash.slice(1)!==view) history.replaceState(null, '', '#'+view); } catch(e){}
  if (view==='work') Work.refresh();
  if (view==='hub') App.renderQuick();
  if (view==='auto') Auto.render();
  if (view==='ai') Assist.render();
  if (view==='cloud') Cloud.render();
  if (view==='support') App.renderSupport();
  if (view==='editor' && E.doc) setTimeout(E.updPageInfo, 50);
};
App.openFiles = async function(files, skipInspect){
  files = files.filter(f=>M.isPdf(f) || M.isImage(f));
  if (!files.length) return U.toast(LANG==='ar' ? 'اختر ملف PDF أو صورة. للصيغ الأخرى استخدم أدوات التحويل.' : 'Choose a PDF or an image. For other formats use the converters.', 'err');
  if (E.doc && E.doc.dirty && !(await U.ask(t('nav_editor'), t('unsaved'), t('open')))) return;
  const busy = U.modal(t('processing'), h('div', {class:'prog'}, h('i', {style:{width:'60%'}})), [], {sticky:true});
  try { const d = await M.fromFiles(files); busy.close(); await E.open(d); if (files.length===1 && window.Recent) Recent.add(files[0]); U.toast(t('opened', {f:d.name})); if (!skipInspect && files.length===1) Flow.inspect(d, files[0]).catch(e=>console.warn(e)); }
  catch(e){ busy.close(); console.error(e); U.toast(t('open_err', {e:e.message||e}), 'err'); }
};
App.openPicker = async function(){ const fs = await U.pickFiles('application/pdf,image/*,.pdf', true); if (fs.length) App.openFiles(fs); };
App.openSample = async function(){ try { const b = await M.sampleBytes(); const d = await M.fromBytes(b, t('sample_name')); await E.open(d); } catch(e){ U.toast(t('error',{e:e.message}), 'err'); } };

App.setLang = function(l){
  LANG = l; window.LANG = l; U.store.set('lang', l); setTimeout(()=>window.dispatchEvent(new CustomEvent('wq:lang', {detail:l})), 0); try { localStorage.setItem('wq.lang', l); } catch(e){}
  applyI18n(); $('#btnLang').textContent = l==='ar' ? 'EN' : 'ع';
  $$('[data-tool]').forEach(b=>{ b.title = t('t_'+b.dataset.tool); b.setAttribute('aria-label', b.title); });
  Tools.renderHub(); App.renderQuick(); E.renderRibbon(); E.renderProps(); if (E.doc) E.updPageInfo(); App.renderTabbar(); Auth.renderButton();
  const on = ($('.view.on')||{}).id; if (on && on!=='hub' && on!=='editor') App.go(on);
};
App.setSkin = function(sk){ const r = document.documentElement; if (sk && sk!=='auto') r.dataset.skin = sk; else delete r.dataset.skin; U.store.set('skin', sk||'auto');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = sk==='dark' ? '#0b1222' : sk==='bright' ? '#0062f5' : '#2448a6'; window.dispatchEvent(new CustomEvent('wq:skin', {detail:sk||'auto'})); };
App.setTheme = App.setSkin;
App.themeMenu = function(){
  const cur = U.store.get('skin', 'auto');
  const sw = (cols) => h('i', null, cols.map(c=>h('u', {style:{background:c}})));
  const opts = [['auto', X('تلقائي','Automatic'), X('يتبع إعداد جهازك','Follows your device'), ['#f4f6fb','#2448a6','#0b1222','#6ea8ff']], ['light', X('فاتح','Light'), X('هادئ للعمل اليومي','Calm for daily work'), ['#f4f6fb','#ffffff','#2448a6','#a3172f']], ['dark', X('داكن','Dark'), X('مريح ليلًا وفي الإضاءة المنخفضة','Easy at night and in low light'), ['#0b1222','#121b2e','#6ea8ff','#ff7d93']], ['bright', X('مشرق','Bright'), X('ألوان حيوية وتباين أعلى','Vivid colours and higher contrast'), ['#ffffff','#0062f5','#00b4e6','#ffb01f']]];
  const m = U.modal(X('المظهر','Appearance'), h('div', {class:'skins'}, opts.map(([k,l,d,c])=>h('button', {class:'skin', 'aria-pressed':String(cur===k), onclick:()=>{ App.setSkin(k); m.close(); }}, sw(c), h('b', null, l), h('span', {class:'note'}, d)))), []);
};
App.renderQuick = async function(){
  if (window.Recent) Recent.render();
  const q = $('#quick'); if (!q) return;
  const items = [['edit','edit','edit'], ['sign','sign','edit'], ['merge','merge','organize'], ['compress','compress','optimize'], ['pdf2word','word','from'], ['scan','ocr','to'], ['proofread','edit','ai'], ['approval','stamp','security']];
  q.replaceChildren(...items.map(([id, ic, g])=>{ const tl = Tools.list.find(x=>x.id===id); const label = id==='approval' ? X('طلب اعتماد','Request approval') : L(tl.n); const d = id==='approval' ? X('وقّع واختم وتابع الموافقات بالتسلسل.','Sign, seal and track approvals in order.') : L(tl.d);
    return h('button', {class:'qtile', 'data-g':g, onclick:()=> id==='approval' ? Flow.newDialog() : Tools.open(id)}, h('span', {class:'ti', html:U.ico(ic)}), h('b', null, label), h('span', {class:'d'}, d)); }));
  try { const ap = await DB.all('approvals'); const tk = await DB.all('tasks'); const pend = ap.filter(a=>a.status==='review').length; const late = tk.filter(x=>x.status!=='done' && x.due && x.due < Flow.today()).length;
    const br = $('#brief'); if (br) br.replaceChildren(...(pend||late ? [h('div', {class:'brief'}, h('span', null, X('لديك ','You have ')), h('b', null, String(pend)), h('span', null, X(' طلب بانتظار الاعتماد و',' requests awaiting approval and ')), h('b', null, String(late)), h('span', null, X(' مهمة متأخرة.',' overdue tasks.')), h('span', {class:'spacer'}), h('button', {class:'btn primary', onclick:()=>App.go('work')}, X('فتح المعاملات','Open transactions')))] : [])); } catch(e){}
};

App.renderTabbar = function(){ const tb = $('#tabbar'); if (!tb) return; const cur = ($('.view.on')||{}).id;
  tb.replaceChildren(...TABS.map(([v,k,ic])=>h('button', {'data-view':v, 'aria-current':String(cur===v ? 'page' : 'false'), onclick:()=>App.go(v)}, h('span', {class:'navico', 'data-v':v, html:U.ico(ic)}), h('em', null, t(k))))); };

/* ---------- support ---------- */
const ICON_WA = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2a9.7 9.7 0 00-8.3 14.8L2.4 21.8l4.9-1.3A9.7 9.7 0 1012 2.2zm0 1.8a7.9 7.9 0 11-4.1 14.7l-.3-.2-2.9.8.8-2.8-.2-.3A7.9 7.9 0 0112 4z"/><path d="M8.9 7.3c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 3 4.7 4.1 2.3.9 2.8.7 3.3.7s1.6-.7 1.8-1.3c.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.8-.7-1.4-1.6-1.5-1.9-.2-.3 0-.4.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2z"/></svg>';
const ICON_TG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 4.2L2.9 11.4c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8s.6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5zM9.2 14.2l9-5.7c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2-1.6-4.6z"/></svg>';
const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
const ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>';
function copyBtn(text){ const b = h('button', {class:'btn', onclick: async ()=>{ try { await navigator.clipboard.writeText(text); U.toast(t('copied'), 'ok'); } catch(e){ const s = getSelection(); const r = document.createRange(); r.selectNodeContents(b.previousSibling); s.removeAllRanges(); s.addRange(r); } }}, t('copy')); return b; }
App.renderSupport = function(){
  const S = CFG.support || {}; const w = $('#supportWrap'); w.innerHTML = '';
  const tgUser = (U.store.get('cloudCfg', {}).telegramUser || CFG.telegramUser || '').replace(/^@/, '');
  const msg = encodeURIComponent(LANG==='ar' ? 'السلام عليكم، لدي استفسار بخصوص تطبيق وثيق PDF.' : 'Hello, I have a question about Wathiq PDF.');
  const waUrl = `https://wa.me/${S.phoneIntl}?text=${msg}`;
  const tgUrl = tgUser ? `https://t.me/${encodeURIComponent(tgUser)}` : `https://t.me/+${S.phoneIntl}`;
  const tgIn = h('input', {class:'field', id:'tgUser', dir:'ltr', value:tgUser, placeholder:'username', style:{flex:1, minWidth:'140px'}});
  w.append(
    h('h1', {style:{fontFamily:'var(--f-brand)', fontSize:'28px', margin:'0 0 6px'}}, t('support_t')),
    h('p', {class:'note', style:{marginTop:0}}, t('support_p')),
    h('div', {class:'cards'},
      h('div', {class:'card'},
        h('h3', null, h('span', {class:'logo', style:{background:'var(--accent)', color:'var(--on-accent)'}, html:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>'}), L(S.name) || t('eng')),
        h('div', {class:'contact'}, h('span', {html:ICON_PHONE, style:{width:'20px', color:'var(--muted)'}}), h('span', {class:'note'}, t('phone')), h('span', {class:'val'}, S.phoneLocal), copyBtn(S.phoneLocal)),
        h('div', {class:'contact'}, h('span', {html:ICON_MAIL, style:{width:'20px', color:'var(--muted)'}}), h('span', {class:'note'}, t('email')), h('span', {class:'val', style:{fontSize:'14px'}}, S.email), copyBtn(S.email)),
        h('div', {class:'social'},
          h('a', {class:'wa', href:waUrl, target:'_blank', rel:'noopener'}, h('span', {html:ICON_WA}), t('wa')),
          h('a', {class:'tg', href:tgUrl, target:'_blank', rel:'noopener'}, h('span', {html:ICON_TG}), t('tg')),
          h('a', {class:'ml', href:`mailto:${S.email}?subject=${encodeURIComponent('Wathiq PDF')}`}, h('span', {html:ICON_MAIL}), t('send_mail')),
          h('a', {class:'ml', href:`tel:+${S.phoneIntl}`, style:{background:'var(--fg)', color:'var(--bg)'}}, h('span', {html:ICON_PHONE}), t('call'))),
        h('p', {class:'note'}, t('links_note')),
        h('details', null, h('summary', {class:'note', style:{cursor:'pointer'}}, t('tg_cfg')),
          h('div', {class:'row', style:{marginTop:'6px'}}, h('span', {class:'note', dir:'ltr'}, 't.me/'), tgIn, h('button', {class:'btn', onclick:()=>{ const c = U.store.get('cloudCfg', {}); c.telegramUser = tgIn.value.trim().replace(/^@/,''); U.store.set('cloudCfg', c); App.renderSupport(); U.toast(t('done'),'ok'); }}, t('save_settings'))),
          h('p', {class:'note'}, t('tg_cfg_hint')))),
      h('div', {class:'card'}, h('h3', null, t('privacy_t')), h('ul', {style:{margin:0, paddingInlineStart:'18px'}}, t('privacy_list').split('|').map(s=>h('li', null, s)))),
      h('div', {class:'card'}, h('h3', null, t('features_t')), h('ul', {style:{margin:0, paddingInlineStart:'18px'}}, t('features_list').split('|').map(s=>h('li', null, s))))));
};

/* ---------- boot ---------- */
App.init = function(){
  if (!window.WQ_LIBS_OK){ const b = $('#boot'); b.style.cssText += ';font-size:16px;padding:24px;text-align:center;line-height:1.8'; b.textContent = 'تعذّر تحميل مكتبات التطبيق. تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة. — Could not load the app libraries. Check your connection and reload.'; return; }
  App.setSkin(U.store.get('skin', 'auto'));
  applyI18n(); $('#btnLang').textContent = LANG==='ar' ? 'EN' : 'ع';
  $$('#nav button').forEach(b=>b.onclick = ()=>App.go(b.dataset.view));
  $('#btnLang').onclick = ()=>App.setLang(LANG==='ar' ? 'en' : 'ar');
  if ($('#btnTheme')) $('#btnTheme').onclick = App.themeMenu; $('#btnAccount').onclick = ()=>Auth.open(); Auth.renderButton();
  $('#btnSave').onclick = E.save;
  if ($('#btnMenu')) $('#btnMenu').onclick = ()=>{ const m = U.modal(t('menu'), h('div', {style:{display:'flex', flexDirection:'column', gap:'8px'}}, VIEWS.map(v=>h('button', {class:'btn', style:{justifyContent:'flex-start'}, onclick:()=>{ m.close(); App.go(v); }}, t({hub:'nav_tools', editor:'nav_editor', work:'nav_work', auto:'nav_auto', ai:'nav_ai', cloud:'nav_cloud', support:'nav_support'}[v])))), []); };
  App.renderTabbar();
  const sd = $('#sealDate'); if (sd){ const d = new Date(); sd.textContent = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  DB.persistent();
  $('#openFile').onchange = e=>{ const fs = [...e.target.files]; e.target.value = ''; if (fs.length) App.openFiles(fs); };
  /* 3D icon motion: the hovered tile's icon follows the pointer; icons flip in once when they first scroll into view */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const hubEl = $('#hub'); let tiltRaf = 0, tiltEl = null;
    if (hubEl && matchMedia('(pointer: fine)').matches){
      hubEl.addEventListener('pointermove', e=>{ const card = e.target.closest && e.target.closest('.tool,.qtile'); if (!card) return; cancelAnimationFrame(tiltRaf);
        tiltRaf = requestAnimationFrame(()=>{ const ic = card.querySelector('.ti'); if (!ic) return; if (tiltEl && tiltEl!==ic){ tiltEl.style.removeProperty('--ix'); tiltEl.style.removeProperty('--iy'); } tiltEl = ic;
          const r = card.getBoundingClientRect(); const x = (e.clientX - r.left)/r.width - .5, y = (e.clientY - r.top)/r.height - .5;
          ic.style.setProperty('--iy', (x*36).toFixed(1)+'deg'); ic.style.setProperty('--ix', (-y*30).toFixed(1)+'deg'); }); }, {passive:true});
      hubEl.addEventListener('pointerleave', ()=>{ if (tiltEl){ tiltEl.style.removeProperty('--ix'); tiltEl.style.removeProperty('--iy'); tiltEl = null; } });
    }
    if ('IntersectionObserver' in window){
      const io = new IntersectionObserver(es=>es.forEach(en=>{ if (en.isIntersecting){ en.target.classList.add('flip-in'); io.unobserve(en.target); } }), {rootMargin:'0px 0px -40px 0px'});
      App.observeIcons = () => document.querySelectorAll('#toolGrid .ti:not(.flip-in)').forEach(el=>io.observe(el));
      App.observeIcons();
      const rh = Tools.renderHub; Tools.renderHub = function(){ const r = rh.apply(this, arguments); App.observeIcons(); return r; };
    }
  }
  /* pause the hero's looping animations when it is scrolled away or the tab is hidden (saves CPU and battery) */
  { const hero = $('.hero2'); if (hero && 'IntersectionObserver' in window){ new IntersectionObserver(es=>es.forEach(en=>hero.classList.toggle('paused', !en.isIntersecting))).observe(hero); }
    document.addEventListener('visibilitychange', ()=>document.documentElement.classList.toggle('paused-all', document.hidden)); }
  /* opening sequence once per load, hero buttons, pointer tilt on the document scene */
  document.body.classList.add('wq-intro'); setTimeout(()=>document.body.classList.remove('wq-intro'), 2600);
  const ho = $('#heroOpen'); if (ho) ho.onclick = ()=>$('#openFile').click();
  const hb = $('#heroBrowse'); if (hb) hb.onclick = ()=>{ const g = $('#quick'); g && g.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'}); };
  const sc = $('#drop.scene'), st = sc && sc.querySelector('.stage');
  if (st && !matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(pointer: fine)').matches){
    const hero = sc.closest('.hero'); let raf = 0;
    hero.addEventListener('pointermove', e=>{ cancelAnimationFrame(raf); raf = requestAnimationFrame(()=>{ const r = hero.getBoundingClientRect(); const x = (e.clientX - r.left)/r.width - .5, y = (e.clientY - r.top)/r.height - .5;
      st.style.setProperty('--ry', (x*18 - 4).toFixed(2)+'deg'); st.style.setProperty('--rx', (-y*14 + 4).toFixed(2)+'deg'); }); });
    hero.addEventListener('pointerleave', ()=>{ st.style.removeProperty('--ry'); st.style.removeProperty('--rx'); });
  }
  const drop = $('#drop');
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, ()=>drop.classList.remove('over')));
  drop.addEventListener('drop', e=>{ e.preventDefault(); App.openFiles([...e.dataTransfer.files]); });
  $('#viewer').addEventListener('dragover', e=>e.preventDefault());
  $('#viewer').addEventListener('drop', e=>{ e.preventDefault(); const fs = [...e.dataTransfer.files]; if (fs.length) App.openFiles(fs); });
  $('#toolSearch').addEventListener('input', ()=>Tools.renderHub());
  addEventListener('beforeunload', e=>{ if (E.doc && E.doc.dirty){ e.preventDefault(); e.returnValue = ''; } });
  E.init(); Cloud.init(); Tools.renderHub(); App.renderQuick();
  // route by hash
  const v = (location.hash||'').slice(1); if (VIEWS.includes(v) && v!=='hub') App.go(v);
  addEventListener('hashchange', ()=>{ const k = location.hash.slice(1); if (VIEWS.includes(k) && !$('#'+k).classList.contains('on')) App.go(k); });
  // offline support when self-hosted (service workers are unavailable inside sandboxed previews)
  if ('serviceWorker' in navigator && !U.inArtifact() && /^https:|^http:\/\/localhost/.test(location.href)) navigator.serviceWorker.register('sw.js').catch(()=>{});
  $('#boot').remove(); window.dispatchEvent(new Event('wq:ready'));
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.init); else App.init();
})();
