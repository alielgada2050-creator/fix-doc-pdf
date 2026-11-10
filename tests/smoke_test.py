"""Smoke test: builds nothing; serves dist/ and drives the app in headless Chromium.
   Set LIBDIR=<path to node_modules with the pinned libraries> to run offline (CDN requests are served locally)."""
import os, sys, json, base64, io, threading, http.server, functools, re
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
LIBDIR = os.environ.get('LIBDIR')
MAP = {
  r'pdf\.js/3\.11\.174/pdf\.min\.js': 'pdfjs-dist/build/pdf.min.js',
  r'pdf\.js/3\.11\.174/pdf\.worker\.min\.js': 'pdfjs-dist/build/pdf.worker.min.js',
  r'@cantoo/pdf-lib@2\.11\.1/dist/pdf-lib\.min\.js': '@cantoo/pdf-lib/dist/pdf-lib.min.js',
  r'jszip/3\.10\.1/jszip\.min\.js': 'jszip/dist/jszip.min.js',
  r'xlsx/0\.18\.5/xlsx\.full\.min\.js': 'xlsx/dist/xlsx.full.min.js',
  r'mammoth/1\.6\.0/mammoth\.browser\.min\.js': 'mammoth/mammoth.browser.min.js',
  r'html2canvas/1\.4\.1/html2canvas\.min\.js': 'html2canvas/dist/html2canvas.min.js',
  r'pptxgenjs@3\.12\.0/dist/pptxgen\.bundle\.js': 'pptxgenjs/dist/pptxgen.bundle.js',
  r'qrcode-generator/1\.4\.4/qrcode\.min\.js': 'qrcode-generator/qrcode.js',
  r'@pdf-lib/fontkit@1\.1\.1/dist/fontkit\.umd\.min\.js': '@pdf-lib/fontkit/dist/fontkit.umd.min.js',
  r'tesseract\.js@5\.1\.1/dist/(.+)': 'tesseract.js/dist/{0}',
  r'tesseract\.js-core@5\.1\.1/(.+)': 'tesseract.js-core/{0}',
}
def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    h.log_message = lambda *a: None
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start(); return s

def route(r):
    u = r.request.url
    if 'fonts.googleapis' in u or 'fonts.gstatic' in u: return r.fulfill(status=200, body='', content_type='text/css')
    for pat, rel in MAP.items():
        m = re.search(pat, u)
        if m:
            p = os.path.join(LIBDIR, rel.format(*m.groups()))
            ct = 'application/wasm' if p.endswith('.wasm') else 'text/javascript'
            return r.fulfill(status=200, body=open(p, 'rb').read(), content_type=ct, headers={'Access-Control-Allow-Origin': '*'})
    return r.continue_()

def main():
    s = serve(); url = f'http://127.0.0.1:{s.server_address[1]}/' + os.environ.get('PAGE','index.html')
    errors = []; results = {}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1366, 'height': 860}, accept_downloads=True)
        if LIBDIR: ctx.route(re.compile(r'https://(cdnjs|cdn\.jsdelivr|fonts\.)'), route)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url); pg.wait_for_selector('#toolGrid .tool', timeout=30000)
        results['tools_listed'] = pg.eval_on_selector_all('#toolGrid .tool', 'e=>e.length')
        # editor: sample doc, add text, edit-existing-text, image, redact, note, link, field
        pg.click('#emptySample') if pg.is_visible('#emptySample') else None
        pg.evaluate('App.openSample()'); pg.wait_for_selector('.page canvas.pc', timeout=30000); pg.wait_for_timeout(800)
        out = pg.evaluate('''async()=>{
          const p = E.doc.pages[0]; const p2 = E.doc.pages[1];
          E.addObj(p, {type:'text', text:'نص عربي مضاف Test', x:0.1, y:0.85, w:0.4, h:0.04, size:14, font:'IBM Plex Sans Arabic', color:'#0b2a8a'});
          E.addObj(p, {type:'highlight', x:0.1, y:0.2, w:0.3, h:0.05, color:'#ffd400'});
          E.addObj(p, {type:'link', x:0.6, y:0.85, w:0.2, h:0.04, url:'example.com'});
          E.addObj(p, {type:'note', x:0.9, y:0.1, w:0.03, h:0.04, text:'تعليق للمراجعة'});
          E.addObj(p2, {type:'field', name:'full_name', x:0.1, y:0.5, w:0.4, h:0.03});
          E.addObj(p2, {type:'check', name:'agree', x:0.1, y:0.56, w:0.03, h:0.02});
          await E.editTextAt(p, 0.2, 0.963);
          const c = U.canvas(200,80); const x = c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,200,80); x.fillStyle='#123'; x.font='40px serif'; x.fillText('Sig',30,55);
          await E.placeImage(c.toDataURL('image/png'), 'sign');
          E.addObj(p2, {type:'redact', x:0.08, y:0.12, w:0.6, h:0.03});
          E.pageOp('rotR');
          const {bytes, redactPages} = await M.exportPdf(E.doc, new U.Task());
          let s=''; for (const b of bytes) s += String.fromCharCode(b);
          return {b64: btoa(s), redactPages, objs: E.doc.pages.map(p=>p.objs.length), edited: E.doc.pages[0].objs.some(o=>o.fromEdit)};
        }''')
        pdf = base64.b64decode(out['b64']); open('/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/edited.pdf','wb').write(pdf)
        results['editor'] = {'size': len(pdf), 'redactPages': out['redactPages'], 'objs': out['objs'], 'editExisting': out['edited']}
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/editor.png')
        # run every non-editor tool on generated inputs
        tool_out = pg.evaluate('''async()=>{
          const sample = await M.sampleBytes();
          const pdfFile = (n)=>new File([sample], n||'sample.pdf', {type:'application/pdf'});
          const c = U.canvas(400,300); const x = c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,400,300); x.fillStyle='#000'; x.font='bold 48px Arial'; x.fillText('HELLO 2026',20,160);
          const png = new File([await U.canvasBlob(c)], 'img.png', {type:'image/png'});
          const csv = new File(['الاسم,المبلغ\\nعلي,100\\nسارة,250\\n'], 'data.csv', {type:'text/csv'});
          const md = new File(['# عنوان\\n\\nفقرة **عريضة** ونص.\\n\\n- بند 1\\n- بند 2'], 'notes.md', {type:'text/markdown'});
          const z = new JSZip(); z.file('a.txt','hello'); z.file('b/c.pdf', sample); const zipf = new File([await z.generateAsync({type:'blob'})], 'arch.zip');
          const docxBlob = await Tools.buildDocx([{type:'p', text:'مرحبا بالعالم'},{type:'p', text:'Hello world'},{type:'br'},{type:'p', text:'الصفحة الثانية'}]);
          const docx = new File([docxBlob], 'doc.docx');
          const plan = {merge:[[pdfFile('a.pdf'), png],{}], split:[[pdfFile()],{mode:'each', zip:true}], remove:[[pdfFile()],{ranges:'2'}], extract:[[pdfFile()],{ranges:'1'}],
            rotate:[[pdfFile()],{deg:'90', ranges:''}], crop:[[pdfFile()],{t:5,b:5,l:5,r:5}], compress:[[pdfFile()],{level:'medium'}], 'compress-l':[[pdfFile()],{level:'lossless'}], repair:[[pdfFile()],{}],
            img2pdf:[[png],{size:'a4', orient:'auto', margin:20, single:true}], excel2pdf:[[csv],{orient:'landscape'}], text2pdf:[[md],{}], word2pdf:[[docx],{}],
            pdf2img:[[pdfFile()],{fmt:'jpg', dpi:'96', ranges:''}], pdf2word:[[pdfFile()],{mode:'text'}], 'pdf2word-i':[[pdfFile()],{mode:'image'}], pdf2excel:[[pdfFile()],{}], pdf2ppt:[[pdfFile()],{}], pdf2txt:[[pdfFile()],{fmt:'md'}],
            numbers:[[pdfFile()],{pos:'bc', fmt:'ar', digits:'arabic', start:1, size:11, skip:false}], watermark:[[pdfFile()],{kind:'text', text:'سري — CONFIDENTIAL', color:'#b42318', size:54, opacity:0.2, angle:-35, layout:'tile'}],
            compare:[[pdfFile('a.pdf'), pdfFile('b.pdf')],{}], protect:[[pdfFile()],{pw:'1234', pw2:'1234', owner:'', print:true, copy:false, modify:false}], meta:[[pdfFile()],{mode:'strip'}],
            imgconv:[[png],{fmt:'webp', scale:50, q:0.8}], removebg:[[png],{thr:38, clean:true}], zip:[[png, csv],{}], unzip:[[zipf],{}], ocr:[[png],{lang:'eng', out:'txt', dpi:'150'}]};
          const res = {}; const files = {};
          for (const k in plan){ const id = k.split('-')[0]; const tool = Tools.list.find(t=>t.id===id);
            try { const t0 = performance.now(); const out = await tool.run(plan[k][0], plan[k][1], new U.Task());
              res[k] = out.map(r=>r.name+' '+r.blob.size+(r.note?' ['+r.note+']':'')).join(' | ') + ` (${Math.round(performance.now()-t0)}ms)`;
              if (['protect','word2pdf','pdf2word','pdf2excel','meta','ocr','numbers','excel2pdf'].includes(k)){ const b = new Uint8Array(await out[0].blob.arrayBuffer()); let s=''; for (const x of b) s+=String.fromCharCode(x); files[k] = {name:out[0].name, b64:btoa(s)}; }
            } catch(e){ res[k] = 'ERROR: '+(e && e.message || e); } }
          // unlock the protected file
          try { const pb = Uint8Array.from(atob(files.protect.b64), c=>c.charCodeAt(0)); const out = await Tools.list.find(t=>t.id==='unlock').run([new File([pb],'p.pdf')], {pw:'1234'}, new U.Task()); res.unlock = out[0].name+' '+out[0].blob.size; } catch(e){ res.unlock = 'ERROR: '+e.message; }
          return {res, files};
        }''')
        results['tools'] = tool_out['res']
        for k, f in tool_out['files'].items():
            open(f'/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/out-{k}-{f["name"]}', 'wb').write(base64.b64decode(f['b64']))
        # UI checks: language switch, mobile layout, support
        pg.evaluate("App.setLang('en')"); pg.evaluate("App.go('support')"); pg.wait_for_timeout(300)
        results['support_links'] = pg.eval_on_selector_all('.social a', 'e=>e.map(a=>a.href)')
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/support-en.png')
        pg.evaluate("App.setLang('ar'); App.go('hub')")
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(300)
        results['mobile_hscroll'] = pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/hub-mobile.png')
        pg.evaluate("App.go('editor')"); pg.wait_for_timeout(500)
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/editor-mobile.png')
        pg.evaluate("App.go('cloud')"); pg.wait_for_timeout(300)
        pg.set_viewport_size({'width': 1366, 'height': 860})
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/cloud.png')
        pg.evaluate("App.go('hub')"); pg.wait_for_timeout(200)
        pg.screenshot(path='/tmp/claude-0/-home-claude/b85bdd40-214a-5d97-8c75-727283777ff9/scratchpad/hub.png')
        b.close()
    results['page_errors'] = errors
    print(json.dumps(results, ensure_ascii=False, indent=1))
    bad = errors or any(str(v).startswith('ERROR') for v in results['tools'].values())
    sys.exit(1 if bad else 0)

if __name__ == '__main__': main()
