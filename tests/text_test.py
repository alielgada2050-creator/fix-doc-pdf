"""Text editing, proofreading, skins, new tools (scan, PDF/A, PowerPoint) and sign-in/sync against the real server."""
import os, sys, json, re, base64, subprocess, threading, time, socket
sys.path.insert(0, os.path.dirname(__file__)); import smoke_test as st
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp'); ROOT = os.path.join(os.path.dirname(__file__), '..')

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def main():
    port = free_port(); log = []
    env = dict(os.environ, PORT=str(port), AUTH_SECRET='t'*48, AUTH_DEV='1', SERVE_STATIC='1', DATA_DIR=os.path.join(OUT, 'srvdata'), PROXY_TOKEN='')
    srv = subprocess.Popen(['node', os.path.join(ROOT, 'server/odoo-proxy.mjs')], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    threading.Thread(target=lambda: [log.append(l) for l in srv.stdout], daemon=True).start()
    time.sleep(1.2)
    url = f'http://127.0.0.1:{port}/' + os.environ.get('PAGE','index.html'); res = {}; errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1366,'height':900})
            if st.LIBDIR: ctx.route(re.compile(r'https://(cdnjs|cdn\.jsdelivr|fonts\.)'), st.route)
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url); pg.wait_for_selector('#toolGrid .tool', timeout=30000)
            res['tools'] = pg.eval_on_selector_all('#toolGrid .tool', 'e=>e.length')
            # a PDF with real Arabic + English text (embedded font) containing deliberate errors
            res['text'] = pg.evaluate('''async()=>{
              const d = await PDFLib.PDFDocument.create(); await U.loadScript(U.LIBS.fontkit); d.registerFontkit(fontkit);
              const fb = await (await fetch('fonts/IBMPlexSansArabic-Regular.ttf')).arrayBuffer(); const f = await d.embedFont(fb, {subset:false});
              const pg = d.addPage([595, 842]);
              pg.drawRectangle({x:40, y:690, width:515, height:40, color:PDFLib.rgb(1, 0.95, 0.6)});
              pg.drawText('هاذا خطاب إستخدام المعاملة', {x:330, y:704, size:16, font:f, color:PDFLib.rgb(0.1,0.2,0.6)});
              pg.drawText('Please recieve teh invoice total 4,250 SAR', {x:50, y:640, size:13, font:f});
              pg.drawText('Status: Pending review', {x:50, y:600, size:13, font:f});
              const bytes = await d.save(); const doc = await M.fromBytes(new Uint8Array(bytes), 'letter.pdf'); await E.open(doc);
              const out = {};
              out.items = (await M.getText(E.doc, E.doc.pages[0])).map(i=>i.str);
              const issues = await TextEdit.scanLocal(); out.issues = issues.map(i=>[i.wrong, i.fix]);
              E.snap(); for (const is of issues.slice()) await TextEdit.applyIssue(is, true);
              out.loose = (await TextEdit.findAll('استخدام', {loose:true})).length;
              out.replaced = await TextEdit.replaceAll('Pending review', 'Approved', {matchCase:false, whole:false, loose:true});
              const objs = E.doc.pages[0].objs; out.overlays = objs.map(o=>({t:o.text, color:o.color, bg:o.bgColor, font:o.font, bold:o.bold}));
              const r = await M.exportPdf(E.doc, new U.Task()); let s=''; for (const q of r.bytes) s += String.fromCharCode(q); out.b64 = btoa(s);
              // re-open exported and read text back
              const d2 = await M.fromBytes(r.bytes, 'x.pdf'); out.after = (await M.getText(d2, d2.pages[0])).map(i=>i.str).join(' | ');
              const d3 = await PDFLib.PDFDocument.create(); const VF = await M.vecFonts(d3); const p3 = d3.addPage([400,100]); await M.drawVectorText(p3, {w:400,h:100,ox:0,oy:0,rot:0,baseRot:0}, {type:'text', text:'استلام الإعلان خلال', x:0.05, y:0.2, w:0.9, h:0.5, size:16, font:'IBM Plex Sans Arabic'}, VF, false);
              const d4 = await M.fromBytes(new Uint8Array(await d3.save()), 'l.pdf'); out.ligature = (await M.getText(d4, d4.pages[0])).map(i=>i.str).join(' ');
              return out; }''')
            open(os.path.join(OUT, 'text-edited.pdf'), 'wb').write(base64.b64decode(res['text'].pop('b64')))
            pg.evaluate("E.showProps('text')"); pg.wait_for_timeout(1200); pg.screenshot(path=os.path.join(OUT, 't-editor-text.png'))
            # new tools
            res['newtools'] = pg.evaluate('''async()=>{ const out = {};
              const c = U.canvas(900,1200); const x = c.getContext('2d'); const gr = x.createLinearGradient(0,0,900,1200); gr.addColorStop(0,'#d8d2c4'); gr.addColorStop(1,'#a89f8c'); x.fillStyle=gr; x.fillRect(0,0,900,1200); x.fillStyle='#333'; x.font='bold 48px Arial'; x.fillText('SCANNED PAGE 2026', 80, 300);
              const img = new File([await U.canvasBlob(c, 'image/jpeg', 0.8)], 'photo.jpg', {type:'image/jpeg'});
              const scan = await Tools.list.find(t=>t.id==='scan').run([img], {mode:'bw', size:'a4', ocr:false}, new U.Task()); out.scan = [scan[0].name, scan[0].blob.size];
              const s1 = await M.fromBytes(new Uint8Array(await scan[0].blob.arrayBuffer()), 's.pdf'); const cv = await M.renderPage(s1, s1.pages[0], 0.3); const px = cv.getContext('2d').getImageData(10,10,1,1).data; out.scanBg = [...px].slice(0,3);
              const pdfa = await Tools.list.find(t=>t.id==='pdfa').run([new File([await M.sampleBytes()], 's.pdf')], {mode:'keep'}, new U.Task()); let s=''; const pb = new Uint8Array(await pdfa[0].blob.arrayBuffer()); for (const q of pb) s += String.fromCharCode(q); out.pdfa = btoa(s);
              await U.loadScript(U.LIBS.pptx); const pres = new PptxGenJS(); const sl = pres.addSlide(); sl.background = {color:'1F3A8A'}; sl.addText('عرض تجريبي', {x:0.5, y:0.5, w:9, h:1.2, fontSize:40, color:'FFFFFF', bold:true, align:'center'});
              sl.addText('Quarterly report 2026', {x:0.5, y:2, w:9, h:0.8, fontSize:24, color:'FFD23F'}); sl.addShape(pres.ShapeType.rect, {x:1, y:3.2, w:3, h:1.4, fill:{color:'E1194A'}});
              const s2 = pres.addSlide(); s2.addText('الشريحة الثانية', {x:1, y:1, w:8, h:1, fontSize:30, color:'111111'});
              const blob = await pres.write({outputType:'blob'}); const pp = await Tools.list.find(t=>t.id==='ppt2pdf').run([new File([blob], 'deck.pptx')], {}, new U.Task());
              let s3=''; const b3 = new Uint8Array(await pp[0].blob.arrayBuffer()); for (const q of b3) s3 += String.fromCharCode(q); out.ppt = btoa(s3);
              return out; }''')
            open(os.path.join(OUT, 'pdfa.pdf'), 'wb').write(base64.b64decode(res['newtools'].pop('pdfa')))
            open(os.path.join(OUT, 'deck.pdf'), 'wb').write(base64.b64decode(res['newtools'].pop('ppt')))
            # sign in by email code (dev mode prints the code), then sync up and down
            res['auth_cfg'] = pg.evaluate("Auth.config(true)")
            pg.evaluate("fetch('/api/auth/email/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'Ali@Example.com'})}).then(r=>r.json())")
            time.sleep(0.6); code = next((re.search(r'(\d{6})', l).group(1) for l in reversed(log) if 'email code' in l), None)
            res['auth'] = pg.evaluate('''async(code)=>{ const out = {};
              const bad = await fetch('/api/auth/email/verify', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'ali@example.com', code:'000000'})}); out.badStatus = bad.status;
              const r = await fetch('/api/auth/email/verify', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'ali@example.com', code})}); const j = await r.json(); out.user = j.user;
              U.store.set('auth', j); Auth.renderButton();
              await Tasks.create({title:'مهمة للمزامنة', assignee:'علي'}); out.up = await Auth.sync('up');
              await DB.del('tasks', (await DB.all('tasks'))[0].id); out.restored = await Auth.sync('down'); out.tasks = (await DB.all('tasks')).map(t=>t.title);
              const wa = await fetch('/api/auth/whatsapp/start', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({phone:'0597778853'})}); out.wa = await wa.json();
              const odooNoAuth = await fetch('/api/odoo/ping'); out.odooNoAuth = odooNoAuth.status;
              const me = await fetch('/api/auth/me', {headers:{Authorization:'Bearer '+j.token}}); out.me = (await me.json()).user.email;
              return out; }''', code)
            res['auth']['code_found'] = bool(code)
            res['wa_log'] = [l.strip() for l in log if 'WhatsApp code' in l][-1:]
            # screenshots: three skins
            for sk in ['light', 'dark', 'bright']:
                pg.evaluate(f"App.setSkin('{sk}'); App.go('hub')"); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(OUT, f's-hub-{sk}.png'))
                pg.evaluate("App.go('editor')"); pg.wait_for_timeout(700); pg.screenshot(path=os.path.join(OUT, f's-ed-{sk}.png'))
            pg.set_viewport_size({'width':390,'height':844}); pg.evaluate("App.setSkin('bright'); App.go('hub')"); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(OUT, 's-hub-mobile.png'))
            pg.evaluate("App.go('editor')"); pg.wait_for_timeout(600); pg.screenshot(path=os.path.join(OUT, 's-ed-mobile.png'))
            pg.set_viewport_size({'width':1366,'height':900}); pg.evaluate("U.store.del('auth'); Auth.renderButton(); Auth.open()"); pg.wait_for_timeout(1200); pg.screenshot(path=os.path.join(OUT, 's-login.png'))
            b.close()
    finally:
        srv.terminate()
    res['page_errors'] = errors
    print(json.dumps(res, ensure_ascii=False, indent=1))
if __name__ == '__main__': main()
