#!/usr/bin/env node
/* وثيق — Odoo proxy + optional static server (Node 18+, no dependencies).
   Keeps the Odoo API key on the server. The browser talks to this proxy with a separate PROXY_TOKEN.
   Supports Odoo 14–18 (JSON-RPC /jsonrpc with API key) and Odoo 19+ (JSON-2 /json/2/<model>/<method>).

   Usage:  cp server/.env.example server/.env  → edit →  node server/odoo-proxy.mjs
*/
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import zlib from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { timingSafeEqual, createHmac, randomBytes, randomInt, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// tiny .env loader
const envFile = path.join(here, '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

const E = process.env;
const CFG = {
  port: +(E.PORT || 8787), odooUrl: (E.ODOO_URL || '').replace(/\/$/, ''), db: E.ODOO_DB || '', login: E.ODOO_LOGIN || '', key: E.ODOO_API_KEY || '',
  mode: (E.ODOO_MODE || 'jsonrpc').toLowerCase(), token: E.PROXY_TOKEN || '', origin: E.ALLOWED_ORIGIN || '', maxMb: +(E.MAX_UPLOAD_MB || 25),
  models: (E.ODOO_ALLOWED_MODELS || '').split(',').map(s => s.trim()).filter(Boolean), serveStatic: E.SERVE_STATIC === '1', staticDir: path.resolve(E.STATIC_DIR || path.join(here, '..', 'dist')), proxyUsers: (E.PROXY_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), trustProxy: E.TRUST_PROXY === '1'
};
if (CFG.token && CFG.token.length < 24) { console.error('PROXY_TOKEN must be 24+ random characters.'); process.exit(1); }
if (!CFG.token) console.warn('PROXY_TOKEN not set — Odoo/AI endpoints accept signed-in users only.');
if (!CFG.odooUrl || !CFG.db || !CFG.key) console.warn('ODOO_URL / ODOO_DB / ODOO_API_KEY not set — Odoo endpoints will return 503.');

/* ---------- Odoo clients ---------- */
let uid = null;
async function rpc(service, method, args) {
  const r = await fetch(CFG.odooUrl + '/jsonrpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }) });
  const j = await r.json(); if (j.error) throw new Error(j.error.data?.message || j.error.message); return j.result;
}
async function json2(model, method, body) {
  const r = await fetch(`${CFG.odooUrl}/json/2/${model}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'bearer ' + CFG.key, 'X-Odoo-Database': CFG.db }, body: JSON.stringify(body) });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!r.ok) throw new Error((j && j.message) || r.statusText); return j;
}
async function call(model, method, args = [], kwargs = {}) {
  if (CFG.mode === 'json2') {
    if (method === 'search_read') return json2(model, method, { domain: args[0] || [], ...kwargs });
    if (method === 'read') return json2(model, method, { ids: args[0], ...kwargs });
    if (method === 'create') return json2(model, method, { vals_list: Array.isArray(args[0]) ? args[0] : [args[0]] });
    return json2(model, method, kwargs);
  }
  if (!uid) { uid = await rpc('common', 'authenticate', [CFG.db, CFG.login, CFG.key, {}]); if (!uid) throw new Error('Odoo authentication failed'); }
  return rpc('object', 'execute_kw', [CFG.db, uid, CFG.key, model, method, args, kwargs]);
}
async function version() {
  if (CFG.mode === 'json2') { const r = await fetch(CFG.odooUrl + '/web/version', { method: 'GET' }); return r.ok ? r.json() : {}; }
  return rpc('common', 'version', []);
}

/* ---------- HTTP ---------- */
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const authed = req => { const h = bearer(req); if (CFG.token){ const a = Buffer.from(h), b = Buffer.from(CFG.token); if (a.length === b.length && timingSafeEqual(a, b)) return true; } const u = AUTH.userOf(h); if (!u) return false; const L = CFG.proxyUsers; return L.includes('*') || L.includes((u.email || '').toLowerCase()) || (u.phone && L.includes(u.phone)); };

/* ---------- accounts: email code, WhatsApp code, Google sign-in; signed sessions; per-user sync ---------- */
const AUTH = (() => {
  const secret = E.AUTH_SECRET || ''; const dataDir = path.resolve(here, E.DATA_DIR || 'data'); const dev = E.AUTH_DEV === '1';
  if (!secret) console.warn('AUTH_SECRET not set — sign-in is disabled (the app still works without an account).');
  mkdirSync(path.join(dataDir, 'sync'), { recursive: true });
  const usersFile = path.join(dataDir, 'users.json');
  let users = existsSync(usersFile) ? JSON.parse(readFileSync(usersFile, 'utf8')) : {};
  const saveUsers = () => { writeFileSync(usersFile + '.tmp', JSON.stringify(users, null, 1)); renameSync(usersFile + '.tmp', usersFile); };
  const b64u = b => Buffer.from(b).toString('base64url');
  const sign = obj => { const p = b64u(JSON.stringify(obj)); return p + '.' + createHmac('sha256', secret).update(p).digest('base64url'); };
  const session = tok => { if (!secret || !tok || !tok.includes('.')) return null; const [p, sig] = tok.split('.'); const good = createHmac('sha256', secret).update(p).digest('base64url');
    if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null; try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() && users[o.uid] ? o : null; } catch { return null; } };
  const codes = new Map(); const sends = new Map();
  const hashCode = (id, c) => createHash('sha256').update(secret + '|' + id + '|' + c).digest('hex');
  const limited = (key, max, ms) => { const now = Date.now(); const a = (sends.get(key) || []).filter(t => now - t < ms); if (a.length >= max) return true; a.push(now); sends.set(key, a); return false; };
  const normPhone = p => { let d = String(p || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, ''); if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1); if (/^5\d{8}$/.test(d)) d = '966' + d; return /^\d{10,15}$/.test(d) ? d : null; };
  const normEmail = e => { e = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200 ? e : null; };
  const userFor = (kind, value, extra = {}) => { let u = Object.values(users).find(x => x[kind] === value);
    if (!u) { u = { id: 'u_' + randomBytes(8).toString('hex'), created: new Date().toISOString() }; u[kind] = value; users[u.id] = u; }
    Object.assign(u, extra, { last: new Date().toISOString() }); saveUsers(); return u; };
  const issue = u => ({ token: sign({ uid: u.id, exp: Date.now() + 30 * 864e5 }), user: pub(u) });
  const pub = u => ({ id: u.id, email: u.email || '', phone: u.phone || '', name: u.name || '', picture: u.picture || '' });
  /* minimal SMTP over TLS (port 465) — works with Gmail app passwords and most providers */
  const smtp = (to, subject, text) => new Promise((ok, bad) => {
    const host = E.SMTP_HOST, port = +(E.SMTP_PORT || 465), user = E.SMTP_USER, pass = E.SMTP_PASS, from = E.MAIL_FROM || user;
    const sock = tls.connect({ host, port, servername: host }, () => {});
    const steps = [`EHLO wathiq`, `AUTH LOGIN`, b64u(user).replace(/-/g, '+').replace(/_/g, '/'), Buffer.from(pass).toString('base64'), `MAIL FROM:<${from.replace(/.*<|>.*/g, '')}>`, `RCPT TO:<${to}>`, `DATA`,
      [`From: ${from}`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64').replace(/.{76}/g, '$&\r\n'), '.'].join('\r\n'), 'QUIT'];
    steps[2] = Buffer.from(user).toString('base64'); let i = -1, buf = '';
    sock.setEncoding('utf8'); sock.setTimeout(15000, () => { sock.destroy(); bad(new Error('SMTP timeout')); });
    sock.on('data', d => { buf += d; if (!/(^|\n)\d{3} [^\n]*\r?\n$/.test(buf)) return; const code = +buf.slice(buf.lastIndexOf('\n', buf.length - 3) + 1).slice(0, 3) || +buf.slice(0, 3); buf = '';
      if (code >= 400) { sock.destroy(); return bad(new Error('SMTP ' + code)); } i++; if (i < steps.length) sock.write(steps[i] + '\r\n'); else { sock.end(); ok(); } });
    sock.on('error', bad);
  });
  const sendEmail = async (to, code) => {
    const subject = `رمز الدخول إلى وثيق: ${code}`, text = `رمز الدخول إلى وثيق PDF هو: ${code}\nصالح لمدة 10 دقائق. إن لم تطلبه فتجاهل هذه الرسالة.\n\nYour Wathiq PDF sign-in code is ${code}. It expires in 10 minutes.`;
    if (E.RESEND_API_KEY) { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + E.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: E.MAIL_FROM, to: [to], subject, text }) }); if (!r.ok) throw new Error('Resend ' + r.status); return; }
    if (E.SMTP_HOST) return smtp(to, subject, text);
    if (dev) return console.log(`[dev] email code for ${to}: ${code}`);
    throw new Error('Email sending is not configured (SMTP_* or RESEND_API_KEY)');
  };
  const sendWhatsApp = async (to, code) => {
    if (E.WA_TOKEN && E.WA_PHONE_ID && E.WA_TEMPLATE) {
      const body = { messaging_product: 'whatsapp', to, type: 'template', template: { name: E.WA_TEMPLATE, language: { code: E.WA_LANG || 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }] } };
      const r = await fetch(`https://graph.facebook.com/${E.WA_API_VERSION || 'v21.0'}/${E.WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: 'Bearer ' + E.WA_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('WhatsApp ' + r.status + ' ' + (await r.text()).slice(0, 160)); return; }
    if (dev) return console.log(`[dev] WhatsApp code for +${to}: ${code}`);
    throw new Error('WhatsApp sending is not configured (WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE)');
  };
  const methods = () => ({ enabled: !!secret, email: !!secret && !!(E.RESEND_API_KEY || E.SMTP_HOST || dev), whatsapp: !!secret && !!((E.WA_TOKEN && E.WA_PHONE_ID && E.WA_TEMPLATE) || dev), google: !!secret && !!E.GOOGLE_CLIENT_ID, googleClientId: E.GOOGLE_CLIENT_ID || '', dev });
  async function handle(req, res, url, cors, ip) {
    const p = url.pathname.slice('/api/auth'.length); const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString('utf8') || '{}') : {};
    if (p === '/config') return send(res, 200, methods(), cors);
    if (!secret) return send(res, 503, { error: 'Sign-in is not configured on this server' }, cors);
    const start = async (kind, id, sender) => {
      if (!id) return send(res, 400, { error: kind === 'phone' ? 'رقم الجوال غير صحيح' : 'البريد الإلكتروني غير صحيح' }, cors);
      if (limited('id:' + id, 5, 36e5) || limited('ip:' + ip, 30, 36e5)) return send(res, 429, { error: 'محاولات كثيرة. حاول بعد ساعة.' }, cors);
      const code = String(randomInt(0, 1e6)).padStart(6, '0'); codes.set(id, { h: hashCode(id, code), exp: Date.now() + 6e5, tries: 0 });
      await sender(id, code); return send(res, 200, { sent: true, to: kind === 'phone' ? '+' + id.slice(0, 5) + '•••' + id.slice(-2) : id.replace(/(^.).*(@.*$)/, '$1•••$2') }, cors);
    };
    const verify = (kind, id) => { const c = id && codes.get(id); if (!c || c.exp < Date.now()) return send(res, 400, { error: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.' }, cors);
      if (++c.tries > 5) { codes.delete(id); return send(res, 429, { error: 'محاولات كثيرة. اطلب رمزًا جديدًا.' }, cors); }
      const a = Buffer.from(c.h), b = Buffer.from(hashCode(id, String(body.code || '').replace(/\D/g, ''))); if (a.length !== b.length || !timingSafeEqual(a, b)) return send(res, 400, { error: 'الرمز غير صحيح.' }, cors);
      codes.delete(id); return send(res, 200, issue(userFor(kind, id)), cors); };
    if (p === '/email/start' && req.method === 'POST') return start('email', normEmail(body.email), sendEmail);
    if (p === '/email/verify' && req.method === 'POST') return verify('email', normEmail(body.email));
    if (p === '/whatsapp/start' && req.method === 'POST') return start('phone', normPhone(body.phone), sendWhatsApp);
    if (p === '/whatsapp/verify' && req.method === 'POST') return verify('phone', normPhone(body.phone));
    if (p === '/google' && req.method === 'POST') {
      if (!E.GOOGLE_CLIENT_ID) return send(res, 503, { error: 'Google sign-in is not configured' }, cors);
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(body.credential || '')); const j = await r.json();
      if (!r.ok || j.aud !== E.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(j.iss) || String(j.email_verified) !== 'true') return send(res, 401, { error: 'تعذّر التحقق من حساب Google.' }, cors);
      return send(res, 200, issue(userFor('email', j.email.toLowerCase(), { name: j.name || '', picture: j.picture || '', google: j.sub })), cors);
    }
    const s = session(bearer(req)); if (!s) return send(res, 401, { error: 'Unauthorized' }, cors); const u = users[s.uid];
    if (p === '/me' && req.method === 'GET') return send(res, 200, { user: pub(u) }, cors);
    if (p === '/me' && req.method === 'POST') { if (typeof body.name === 'string') u.name = body.name.slice(0, 80); saveUsers(); return send(res, 200, { user: pub(u) }, cors); }
    const f = path.join(dataDir, 'sync', u.id + '.json');
    if (p === '/sync' && req.method === 'GET') return existsSync(f) ? send(res, 200, readFileSync(f), { ...cors, 'Cache-Control': 'no-store' }) : send(res, 404, { error: 'No backup yet' }, cors);
    if (p === '/sync' && req.method === 'POST') { const raw = await readBody(req).catch(() => null); return send(res, 400, { error: 'Use PUT' }, cors); }
    return send(res, 404, { error: 'Unknown endpoint' }, cors);
  }
  async function putSync(req, res, cors) { const s = session(bearer(req)); if (!s) return send(res, 401, { error: 'Unauthorized' }, cors);
    const raw = await readBody(req); const j = JSON.parse(raw.toString('utf8')); if (j.app !== 'wathiq') return send(res, 400, { error: 'Invalid backup' }, cors);
    const f = path.join(dataDir, 'sync', s.uid + '.json'); writeFileSync(f + '.tmp', raw); renameSync(f + '.tmp', f); return send(res, 200, { saved: true, size: raw.length, at: new Date().toISOString() }, cors); }
  const userOf = tok => { const s = session(tok); return s ? users[s.uid] || null : null; };
  return { session, handle, putSync, userOf };
})();
const readBody = req => new Promise((ok, bad) => { let n = 0; const chunks = []; req.on('data', c => { n += c.length; if (n > CFG.maxMb * 1.4 * 1048576) { bad(new Error('Payload too large')); req.destroy(); } else chunks.push(c); }); req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', bad); });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip', '.md': 'text/markdown; charset=utf-8', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = CFG.origin ? { 'Access-Control-Allow-Origin': CFG.origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', Vary: 'Origin' } : {};
  try {
    if (url.pathname.startsWith('/api/auth/')) {
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      const ip = ((CFG.trustProxy && req.headers['x-forwarded-for']) || req.socket.remoteAddress || '').split(',')[0].trim();
      if (url.pathname === '/api/auth/sync' && req.method === 'PUT') return AUTH.putSync(req, res, cors);
      return AUTH.handle(req, res, url, cors, ip);
    }
    if (url.pathname.startsWith('/api/odoo/')) {
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' }, cors);
      if (!CFG.odooUrl || !CFG.key) return send(res, 503, { error: 'Odoo is not configured on the proxy' }, cors);
      const p = url.pathname.slice('/api/odoo'.length);
      if (p === '/ping' && req.method === 'GET') { const v = await version(); return send(res, 200, { server_version: v.server_version || v.version || '', db: CFG.db, mode: CFG.mode }, cors); }
      if (p === '/attachments' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '', model = url.searchParams.get('model') || '', rid = url.searchParams.get('res_id') || '';
        if (model && CFG.models.length && !CFG.models.includes(model)) return send(res, 403, { error: 'Model not allowed' }, cors);
        const domain = [['mimetype', 'in', ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]];
        if (q) domain.push(['name', 'ilike', q]); if (model) domain.push(['res_model', '=', model]); if (rid) domain.push(['res_id', '=', +rid]);
        if (CFG.models.length) domain.push(['res_model', 'in', CFG.models]);
        const items = await call('ir.attachment', 'search_read', [domain], { fields: ['name', 'mimetype', 'file_size', 'res_model', 'res_id', 'create_date'], limit: 80, order: 'create_date desc' });
        return send(res, 200, { items }, cors);
      }
      const m = p.match(/^\/attachments\/(\d+)$/);
      if (m && req.method === 'GET') {
        const [a] = await call('ir.attachment', 'read', [[+m[1]]], { fields: ['name', 'mimetype', 'datas', 'res_model'] });
        if (!a) return send(res, 404, { error: 'Not found' }, cors);
        if (CFG.models.length && !CFG.models.includes(a.res_model)) return send(res, 403, { error: 'Model not allowed' }, cors);
        const buf = Buffer.from(a.datas || '', 'base64');
        return send(res, 200, buf, { ...cors, 'Content-Type': a.mimetype || 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`, 'Cache-Control': 'no-store' });
      }
      if (p === '/attachments' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        if (!body.name || !body.datas) return send(res, 400, { error: 'name and datas are required' }, cors);
        if (body.res_model && CFG.models.length && !CFG.models.includes(body.res_model)) return send(res, 403, { error: 'Model not allowed' }, cors);
        const vals = { name: String(body.name).slice(0, 255), datas: body.datas, mimetype: body.mimetype || 'application/pdf', type: 'binary' };
        if (body.res_model) vals.res_model = body.res_model; if (body.res_id) vals.res_id = +body.res_id;
        const out = await call('ir.attachment', 'create', [vals]); const id = Array.isArray(out) ? out[0] : out;
        return send(res, 201, { id }, cors);
      }
      return send(res, 404, { error: 'Unknown endpoint' }, cors);
    }
    if (url.pathname === '/api/ai/chat/completions') {
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      if (!authed(req)) return send(res, 401, { error: 'Unauthorized' }, cors);
      // primary provider, then the optional fallback when the primary is rate-limited or down (free tiers run out)
      const chain = [['AI_', E.AI_BASE_URL, E.AI_API_KEY], ['AI_FALLBACK_', E.AI_FALLBACK_BASE_URL, E.AI_FALLBACK_API_KEY]].filter(([, b, k]) => b && k);
      if (!chain.length) return send(res, 503, { error: 'AI is not configured on the proxy (AI_BASE_URL, AI_API_KEY, AI_MODEL)' }, cors);
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const vision = Array.isArray(body.messages) && body.messages.some(m => Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'));
      let up = null, lastErr = null;
      for (const [pfx, base, key] of chain) {
        const model = (vision ? E[pfx + 'VISION_MODEL'] : '') || E[pfx + 'MODEL'] || (E.AI_ALLOW_CLIENT_MODEL === '1' ? body.model : '');
        if (!model) { lastErr = 'set ' + pfx + 'MODEL'; continue; }
        try {
          up = await fetch(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ ...body, model }), signal: AbortSignal.timeout(+(E.AI_TIMEOUT_MS || 120000)) });
          if (up.status !== 429 && up.status < 500) break;
          lastErr = up.status;
        } catch (e) { lastErr = e.message; up = null; }
      }
      if (!up) return send(res, 502, { error: 'AI provider unreachable: ' + lastErr }, cors);
      res.writeHead(up.status, { ...cors, 'Content-Type': up.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      if (!up.body) return res.end();
      for await (const chunk of up.body) res.write(chunk);
      return res.end();
    }
    if (CFG.serveStatic && (req.method === 'GET' || req.method === 'HEAD')) {
      let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Bad path' }); }
      if (rel.includes('\0') || rel.split(/[\\/]/).includes('..')) return send(res, 403, { error: 'Forbidden' });
      if (rel.endsWith('/')) rel += 'index.html';
      const dir = CFG.staticDir, file = path.resolve(dir, '.' + rel);
      if (!(file === dir || file.startsWith(dir + path.sep)) || path.basename(file).startsWith('.') || file.includes(`${path.sep}server${path.sep}`)) return send(res, 403, { error: 'Forbidden' });
      let st; try { st = await stat(file); if (!st.isFile()) throw 0; } catch { return send(res, 404, { error: 'Not found' }); }
      const ext = path.extname(file), type = MIME[ext] || 'application/octet-stream';
      const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
      // html and the service worker revalidate every time; everything else may be cached for a day and is revalidated by ETag
      const headers = { 'Content-Type': type, ETag: etag, 'Cache-Control': (ext === '.html' || path.basename(file) === 'sw.js') ? 'no-cache' : 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
      let body = await readFile(file);
      if (/text|javascript|json|svg|xml|manifest/.test(type) && body.length > 1024) {
        const ae = req.headers['accept-encoding'] || '';
        if (/\bbr\b/.test(ae)) { body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }); headers['Content-Encoding'] = 'br'; }
        else if (/\bgzip\b/.test(ae)) { body = zlib.gzipSync(body, { level: 6 }); headers['Content-Encoding'] = 'gzip'; }
        headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = body.length; res.writeHead(200, headers); return res.end(req.method === 'HEAD' ? undefined : body);
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) { console.error(e.message); send(res, 502, { error: e.message }, cors); }
});
server.listen(CFG.port, () => console.log(`Wathiq proxy on http://localhost:${CFG.port}  (mode: ${CFG.mode}${CFG.serveStatic ? ', serving app' : ''})`));
