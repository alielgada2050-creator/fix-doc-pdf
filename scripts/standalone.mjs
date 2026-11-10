// Builds dist/wathiq-standalone.html: one file with the engine, config, fonts, icon and logos embedded.
// PDF libraries still load from public CDNs (cdnjs / jsdelivr) and OCR language data from Tesseract.js' CDN,
// so the page needs internet the first time a tool uses them. Usage: node scripts/standalone.mjs [--no-logos]
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); const dist = path.join(root, 'dist');
const noLogos = process.argv.includes('--no-logos');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const mime = { '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const dataUrl = f => `data:${mime[path.extname(f)]};base64,${fs.readFileSync(path.join(dist, f)).toString('base64')}`;
const files = {};
for (const d of ['fonts', 'logos', 'icons']) for (const f of fs.readdirSync(path.join(dist, d))) if (mime[path.extname(f)] && !/icon-\d+/.test(f)) files[`${d}/${f}`] = dataUrl(`${d}/${f}`);
let cfg = fs.readFileSync(path.join(dist, 'config.js'), 'utf8').replace(/tessdataPath:\s*'[^']*'/, "tessdataPath: 'cdn'");
if (noLogos) cfg = cfg.replace(/orgLogos: \[[\s\S]*?\n  \],/, 'orgLogos: [],');
else cfg = cfg.replace(/src: '(logos\/[^']+)'/g, (m, p) => `src: '${files[p] || p}'`);
const inline = { 'config.js': cfg };
for (const f of fs.readdirSync(path.join(dist, 'app'))) if (f.endsWith('.js')) inline[`app/${f}`] = fs.readFileSync(path.join(dist, 'app', f), 'utf8');
const json = o => JSON.stringify(o).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
const shim = `<script>window.__WQ_INLINE=${json(inline)};window.__WQ_FILES=${json(files)};
(function(){var F=window.__WQ_FILES,f=window.fetch.bind(window);window.fetch=function(u,o){try{var s=typeof u==='string'?u:(u&&u.url)||'';s=s.split('?')[0];for(var k in F){if(s===k||s.slice(-k.length-1)==='/'+k)return f(F[k],o);}}catch(e){}return f(u,o);};})();</script>`;
const i = html.indexOf('<script');
const out = html.slice(0, i) + shim + html.slice(i);
fs.writeFileSync(path.join(dist, 'wathiq-standalone.html'), out);
console.log('dist/wathiq-standalone.html', Math.round(out.length / 1024), 'KB');
