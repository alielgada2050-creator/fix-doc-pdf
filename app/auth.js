/* وثيق — optional accounts: email code, WhatsApp code, or Google; guests can use everything without signing in.
   Sign-in needs the Wathiq server (server/odoo-proxy.mjs) with AUTH_SECRET and at least one sending method configured. */
(function(){
const A = window.Auth = {};
const {h, $} = U;
const base = () => ((window.WATHIQ_CONFIG||{}).serverUrl || U.store.get('cloudCfg', {}).odooProxyUrl || (location.protocol.startsWith('http') && !U.inArtifact() ? location.origin : '')).replace(/\/$/, '');
let cfg = null; let cfgTried = false;
A.state = () => U.store.get('auth', null);
A.user = () => (A.state()||{}).user || null;
A.token = () => (A.state()||{}).token || '';
async function api(path, opts={}){
  const b = base(); if (!b) throw new Error(X('لا يوجد خادم مضبوط.','No server is configured.'));
  const r = await fetch(b + '/api/auth' + path, Object.assign({}, opts, {headers:Object.assign({'Content-Type':'application/json'}, A.token() ? {Authorization:'Bearer '+A.token()} : {}, opts.headers||{})}));
  const ct = r.headers.get('content-type')||''; const j = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok){ if (r.status===401 && A.token() && path!=='/google'){ U.store.del('auth'); A.renderButton(); } throw new Error((j && j.error) || (r.status+' '+r.statusText)); }
  return j;
}
A.config = async function(force){
  if (cfgTried && !force) return cfg; cfgTried = true;
  try { const c = new AbortController(); setTimeout(()=>c.abort(), 4000); cfg = await api('/config', {signal:c.signal}); } catch(e){ cfg = null; }
  return cfg;
};
const done = (j) => { U.store.set('auth', j); if (j.user && j.user.name && !U.store.get('me','')) U.store.set('me', j.user.name); A.renderButton(); U.toast(X('تم تسجيل الدخول.','Signed in.'), 'ok'); };
A.logout = async () => { U.store.del('auth'); A.renderButton(); U.toast(X('تم تسجيل الخروج. يمكنك متابعة الاستخدام كضيف.','Signed out. You can keep using the app as a guest.')); };

/* ---------- sign-in dialog ---------- */
A.open = async function(){
  if (A.user()) return A.account();
  const body = h('div', {style:{display:'flex', flexDirection:'column', gap:'14px'}}, h('p', {class:'note'}, X('جارٍ التحقق من خيارات الدخول…','Checking sign-in options…')));
  const m = U.modal(X('تسجيل الدخول','Sign in'), body, [{label:X('المتابعة كضيف','Continue as guest')}]);
  const c = await A.config(true);
  body.replaceChildren();
  body.append(h('p', {class:'callout info'}, X('التسجيل اختياري. كل الأدوات تعمل بدون حساب. الحساب يتيح مزامنة المعاملات والمهام والوصفات بين أجهزتك.','Signing in is optional. Every tool works without an account. An account lets you sync transactions, tasks and recipes across your devices.')));
  if (!c || !c.enabled){
    body.append(h('p', null, U.inArtifact() ? X('تسجيل الدخول غير متاح في هذه المعاينة، لأنه يحتاج خادم وثيق. انشر التطبيق مع الخادم (انظر README) لتفعيله.','Sign-in is unavailable in this preview because it needs the Wathiq server. Deploy the app with the server (see README) to enable it.')
      : X('لم يُفعّل تسجيل الدخول على هذا الخادم بعد. يحتاج المسؤول ضبط AUTH_SECRET ووسيلة إرسال (Gmail أو واتساب أو Google) في server/.env.','Sign-in is not enabled on this server yet. The admin needs AUTH_SECRET and a sending method (Gmail, WhatsApp or Google) in server/.env.')));
    return;
  }
  const tabs = []; if (c.email) tabs.push(['email', X('البريد الإلكتروني','Email')]); if (c.whatsapp) tabs.push(['wa', X('واتساب','WhatsApp')]); if (c.google) tabs.push(['google', 'Google']);
  if (!tabs.length){ body.append(h('p', null, X('لا توجد وسيلة دخول مفعلة على الخادم.','No sign-in method is enabled on the server.'))); return; }
  let tab = tabs[0][0]; const pane = h('div', {style:{display:'flex', flexDirection:'column', gap:'10px'}});
  const seg = h('div', {class:'seg', role:'tablist'});
  const draw = ()=>{ seg.replaceChildren(...tabs.map(([k,l])=>h('button', {role:'tab', 'aria-pressed':String(tab===k), onclick:()=>{ tab = k; draw(); }}, l))); pane.replaceChildren();
    if (tab==='google') return googlePane(pane, c, m);
    const isWa = tab==='wa';
    const id = h('input', {class:'field', id:'auId', dir:'ltr', type:isWa?'tel':'email', autocomplete:isWa?'tel':'email', inputmode:isWa?'tel':'email', placeholder:isWa?'05xxxxxxxx':'name@gmail.com', style:{width:'100%'}});
    const code = h('input', {class:'field', id:'auCode', dir:'ltr', inputmode:'numeric', autocomplete:'one-time-code', maxlength:'6', placeholder:'••••••', style:{width:'100%', letterSpacing:'.4em', fontSize:'20px', textAlign:'center'}});
    const step2 = h('div', {hidden:true, style:{display:'flex', flexDirection:'column', gap:'8px'}});
    const msg = h('p', {class:'note'});
    const sendBtn = h('button', {class:'btn primary', onclick:async()=>{ sendBtn.disabled = true; msg.textContent = '';
      try { const r = await api(isWa ? '/whatsapp/start' : '/email/start', {method:'POST', body:JSON.stringify(isWa ? {phone:id.value} : {email:id.value})});
        step2.hidden = false; msg.textContent = X(`أرسلنا رمزًا من 6 أرقام إلى ${r.to}${isWa?' عبر واتساب':''}. صالح لمدة 10 دقائق.`,`We sent a 6-digit code to ${r.to}${isWa?' on WhatsApp':''}. It expires in 10 minutes.`); code.focus();
        let s = 60; sendBtn.textContent = X(`إعادة الإرسال (${s})`,`Resend (${s})`); const iv = setInterval(()=>{ s--; sendBtn.textContent = X(`إعادة الإرسال (${s})`,`Resend (${s})`); if (s<=0){ clearInterval(iv); sendBtn.disabled = false; sendBtn.textContent = X('إعادة الإرسال','Resend'); } }, 1000); }
      catch(e){ msg.textContent = e.message; msg.style.color = 'var(--err)'; sendBtn.disabled = false; } }}, X('إرسال الرمز','Send code'));
    const verify = async ()=>{ if (code.value.replace(/\D/g,'').length !== 6) return; try { const j = await api(isWa ? '/whatsapp/verify' : '/email/verify', {method:'POST', body:JSON.stringify(isWa ? {phone:id.value, code:code.value} : {email:id.value, code:code.value})}); m.close(); done(j); if (!j.user.name) A.account(); } catch(e){ msg.textContent = e.message; msg.style.color = 'var(--err)'; } };
    code.addEventListener('input', ()=>{ code.value = code.value.replace(/\D/g,'').slice(0,6); if (code.value.length===6) verify(); });
    step2.append(h('label', {class:'note', for:'auCode'}, X('رمز التحقق','Verification code')), code, h('button', {class:'btn primary', onclick:verify}, X('تأكيد','Confirm')));
    pane.append(h('label', {class:'note', for:'auId'}, isWa ? X('رقم الجوال (واتساب)','Mobile number (WhatsApp)') : X('البريد الإلكتروني','Email address')), id, sendBtn, step2, msg);
    if (c.dev) pane.append(h('p', {class:'callout'}, X('وضع الاختبار: يظهر الرمز في سجل الخادم بدل إرساله.','Test mode: the code is printed in the server log instead of being sent.')));
    setTimeout(()=>id.focus(), 30); };
  body.append(seg, pane); draw();
};
async function googlePane(pane, c, m){
  pane.append(h('p', {class:'note'}, X('سجّل الدخول بحساب Gmail أو Google Workspace. لا نطلب الوصول إلى بريدك أو ملفاتك.','Sign in with your Gmail or Google Workspace account. We do not request access to your mail or files.')));
  const slot = h('div'); pane.append(slot);
  try { await U.loadScript('https://accounts.google.com/gsi/client');
    google.accounts.id.initialize({client_id:c.googleClientId, callback: async r=>{ try { const j = await api('/google', {method:'POST', body:JSON.stringify({credential:r.credential})}); m.close(); done(j); } catch(e){ U.toast(e.message, 'err'); } }, ux_mode:'popup'});
    google.accounts.id.renderButton(slot, {theme:document.documentElement.dataset.skin==='dark'?'filled_black':'outline', size:'large', text:'signin_with', locale:LANG, width:280});
  } catch(e){ slot.append(h('p', {class:'callout'}, X('تعذّر تحميل تسجيل دخول Google.','Could not load Google sign-in.'))); }
}

/* ---------- account & sync ---------- */
A.sync = async function(dir){
  if (dir==='up'){ const blob = await DB.backup(); const r = await fetch(base()+'/api/auth/sync', {method:'PUT', headers:{'Content-Type':'application/json', Authorization:'Bearer '+A.token()}, body: await blob.text()}); const j = await r.json(); if (!r.ok) throw new Error(j.error||r.status); U.store.set('lastSync', j.at); return j; }
  const r = await fetch(base()+'/api/auth/sync', {headers:{Authorization:'Bearer '+A.token()}}); if (r.status===404) throw new Error(X('لا توجد نسخة محفوظة في حسابك بعد.','No backup in your account yet.')); if (!r.ok) throw new Error(r.status+'');
  const n = await DB.restore(new File([await r.blob()], 'sync.json')); return n;
};
A.account = function(){
  const u = A.user(); if (!u) return A.open();
  const name = h('input', {class:'field', id:'acN', dir:'auto', value:u.name||'', style:{width:'100%'}});
  const last = U.store.get('lastSync', '');
  const body = [h('dl', {class:'kv'}, u.email ? [h('dt', null, X('البريد','Email')), h('dd', {class:'num'}, u.email)] : null, u.phone ? [h('dt', null, X('الجوال','Mobile')), h('dd', {class:'num'}, '+'+u.phone)] : null),
    h('label', {class:'note', for:'acN'}, X('الاسم الظاهر في الاعتمادات والمهام','Name shown on approvals and tasks')), name,
    h('b', null, X('المزامنة','Sync')), h('p', {class:'note'}, X('ترفع نسخة من المعاملات والمهام والوصفات ومستنداتها إلى خادمك، ثم تستعيدها على جهاز آخر.','Uploads a copy of your transactions, tasks, recipes and their documents to your server, then restores it on another device.') + (last ? X(` آخر رفع: ${new Date(last).toLocaleString()}`, ` Last upload: ${new Date(last).toLocaleString()}`) : '')),
    h('div', {class:'row'}, h('button', {class:'btn primary', onclick:async e=>{ e.target.disabled = true; try { const j = await A.sync('up'); U.toast(X(`رُفعت النسخة (${U.fmtSize(j.size)}).`,`Uploaded (${U.fmtSize(j.size)}).`), 'ok'); } catch(er){ U.toast(er.message, 'err'); } e.target.disabled = false; }}, X('رفع إلى الحساب','Upload to account')),
      h('button', {class:'btn', onclick:async e=>{ e.target.disabled = true; try { const n = await A.sync('down'); U.toast(X(`استُعيد ${n} عنصر.`,`Restored ${n} items.`), 'ok'); Work.refresh(); } catch(er){ U.toast(er.message, 'err'); } e.target.disabled = false; }}, X('استعادة من الحساب','Restore from account')))];
  U.modal(X('حسابي','My account'), body, [{label:X('تسجيل الخروج','Sign out'), kind:'danger', onClick:c=>{ c(); A.logout(); }}, {label:X('حفظ','Save'), kind:'primary', onClick:async c=>{ try { const j = await api('/me', {method:'POST', body:JSON.stringify({name:name.value.trim()})}); const s = A.state(); s.user = j.user; U.store.set('auth', s); U.store.set('me', j.user.name || U.store.get('me','')); A.renderButton(); c(); } catch(e){ U.toast(e.message, 'err'); } }}]);
};
A.renderButton = function(){
  const b = $('#btnAccount'); if (!b) return; const u = A.user();
  b.replaceChildren(u ? h('span', {class:'avatar'}, (u.name || u.email || u.phone || '?').trim()[0].toUpperCase()) : h('span', {html:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>'}), h('span', {class:'acl'}, u ? (u.name || X('حسابي','Account')) : X('دخول','Sign in')));
  b.title = u ? (u.email || ('+'+u.phone)) : X('تسجيل الدخول (اختياري)','Sign in (optional)');
};
})();
