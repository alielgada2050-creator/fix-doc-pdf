/* وثيق — offline cache.
   App files: served from cache at once and refreshed in the background (stale-while-revalidate).
   Pinned CDN libraries and OCR data: cache-first (versions never change). /api/ is never cached (private data). */
const SHELL = 'wathiq-shell-v7', LIBS = 'wathiq-libs-v1';
const FILES = ['./', 'index.html', 'classic.html', 'logos/alasas.png', 'logos/se.png', 'logos/pdc.png', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'app/i18n.js', 'app/util.js', 'app/model.js', 'app/sign.js', 'app/editor.js', 'app/tools.js', 'app/cloud.js', 'app/store.js', 'app/workflow.js', 'app/tasks.js', 'app/automate.js', 'app/ai.js', 'app/textedit.js', 'app/ocr.js', 'app/recent.js', 'app/auth.js', 'app/main.js', 'fonts/IBMPlexSansArabic-Regular.ttf', 'fonts/IBMPlexSansArabic-Bold.ttf'];
const CORE = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'];
self.addEventListener('install', e => { e.waitUntil(Promise.all([caches.open(SHELL).then(c => c.addAll(FILES)), caches.open(LIBS).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {}))))]).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, LIBS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin && u.pathname.includes('/api/')) return;
  const pinned = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net\/npm\/[^/]+@\d|fonts\.(googleapis|gstatic)\.com/.test(u.href) || u.pathname.includes('/tessdata/');
  if (pinned) { e.respondWith(caches.open(LIBS).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }))); return; }
  if (u.origin !== location.origin) return;
  e.respondWith(caches.open(SHELL).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok && r.type === 'basic') c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (req.mode === 'navigate' ? c.match('index.html') : Response.error());
  }));
});
