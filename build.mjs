// Builds a self-hostable static site into dist/: wraps index.html in a full HTML document and copies assets.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
const src = readFileSync('index.html', 'utf8');
const head = src.slice(0, src.indexOf('</style>') + 8);
const body = src.slice(src.indexOf('</style>') + 8);
const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>${body}
</body>
</html>
`;
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
for (const p of ['app', 'icons', 'fonts', 'logos', 'tessdata', 'config.js', 'sw.js', 'manifest.webmanifest']) cpSync(p, 'dist/' + p, { recursive: true, filter: f => !f.endsWith('.traineddata.js') });
// the React shell (shell/build.sh) becomes the main page when built; the plain page stays as classic.html
import('node:fs').then(fs=>{ if (fs.existsSync('index.shell.html')){ fs.renameSync('dist/index.html', 'dist/classic.html'); fs.copyFileSync('index.shell.html', 'dist/index.html'); } });
console.log('dist/ ready — serve it over HTTPS (or http://localhost) from any static host.');
