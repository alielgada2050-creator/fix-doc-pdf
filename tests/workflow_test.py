"""Workflow test: approvals (chain, signatures, fingerprint, tamper detection, package import, issued copy + verify),
   tasks (sync, export), automation recipes, and the assistant (Claude via a stubbed runtime and an OpenAI-compatible provider via a mocked endpoint)."""
import os, sys, json, re
sys.path.insert(0, os.path.dirname(__file__)); import smoke_test as st
from playwright.sync_api import sync_playwright
OUT = os.environ.get('OUT', '/tmp')

def main():
    s = st.serve(); url = f'http://127.0.0.1:{s.server_address[1]}/' + os.environ.get('PAGE','index.html')
    errors = []; res = {}
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1366,'height':900})
        if st.LIBDIR: ctx.route(re.compile(r'https://(cdnjs|cdn\.jsdelivr|fonts\.)'), st.route)
        def groq(r):
            body = json.loads(r.request.post_data or '{}')
            if body.get('stream'):
                sse = ''.join(f'data: {json.dumps({"choices":[{"delta":{"content":w}}]})}\n\n' for w in ['ملخص ', 'المستند: ', 'جدول معاملات.']) + 'data: [DONE]\n\n'
                return r.fulfill(status=200, body=sse, headers={'content-type':'text/event-stream','access-control-allow-origin':'*'})
            content = json.dumps({"tasks":[{"title":"متابعة رخصة الحفر","assignee":"مصطفى","due":"2026-11-12","priority":"high","dept":"المناخ"}]}, ensure_ascii=False)
            return r.fulfill(status=200, body=json.dumps({"choices":[{"message":{"content":content}}]}), headers={'content-type':'application/json','access-control-allow-origin':'*'})
        ctx.route('https://api.groq.com/**', groq)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url); pg.wait_for_selector('#toolGrid .tool', timeout=30000)
        res['approvals'] = pg.evaluate('''async()=>{
          const out = {};
          const bytes = await M.sampleBytes(); const file = new File([bytes], 'عقد-توريد.pdf', {type:'application/pdf'});
          const ap = await Flow.create(file, {title:'عقد توريد مواد', dept:'المشتريات', by:'علي', priority:'high', due:'2026-11-05', steps:[{name:'سارة', role:'رئيسة القسم'}, {name:'خالد', role:'المدير العام'}]});
          out.no = ap.no; out.status0 = ap.status; out.current0 = Flow.current(ap);
          const tasks0 = (await DB.all('tasks')).filter(t=>t.approvalId===ap.id); out.task0 = tasks0.map(t=>[t.status, t.assignee]);
          const c = U.canvas(300,100); const x = c.getContext('2d'); x.strokeStyle='#0b2a8a'; x.lineWidth=4; x.beginPath(); x.moveTo(10,70); x.bezierCurveTo(80,0,160,120,290,30); x.stroke();
          const sig = c.toDataURL('image/png');
          await Flow.act(ap, 0, 'approved', {actor:'سارة', comment:'موافقة', sig, seal:false});
          let a2 = await DB.get('approvals', ap.id); out.after1 = [a2.status, Flow.current(a2)];
          out.taskAfter1 = (await DB.all('tasks')).filter(t=>t.approvalId===ap.id).map(t=>[t.status, t.assignee]);
          // package -> import on "another device" (delete then import)
          const pkg = await Flow.package(a2); out.pkgSize = pkg.size;
          const pd = await M.fromFiles([pkg]); const atts = await pd.sources[0].pdf.getAttachments(); out.pkgAtt = Object.keys(atts||{});
          await Flow.act(a2, 1, 'approved', {actor:'خالد', comment:'', sig, seal:true});
          a2 = await DB.get('approvals', ap.id); out.final = a2.status;
          out.sigsValid = []; for (let i=0;i<a2.steps.length;i++) out.sigsValid.push(await Flow.verifyStep(a2, i));
          // tamper the record: change the comment -> signature must fail
          const forged = JSON.parse(JSON.stringify(a2)); forged.steps[0].comment = 'مرفوض'; out.forgedValid = await Flow.verifyStep(forged, 0);
          // issued copy + verify
          const issued = await Flow.issue(a2); out.issuedSize = issued.size;
          const idoc = await M.fromFiles([issued]); out.issuedPages = idoc.pages.length;
          const v = await Flow.verify(idoc); out.verify = {found:v.found, ok:v.cmp.ok, text:v.cmp.text, visual:v.cmp.visual, steps:v.steps, extra:v.extraPages};
          let s=''; const ib = new Uint8Array(await issued.arrayBuffer()); for (const q of ib) s+=String.fromCharCode(q); out.issuedB64 = btoa(s);
          // tamper the content: different document with the same record -> must fail
          const other = await PDFLib.PDFDocument.load(bytes); const pg2 = other.getPage(1); const f = await other.embedFont(PDFLib.StandardFonts.Helvetica); pg2.drawText('Total changed to 9,999', {x:60, y:500, size:14, font:f});
          const odoc = await M.fromBytes(new Uint8Array(await other.save()), 'x.pdf'); out.tamper = Flow.compare(a2.fp, await Flow.fingerprint(odoc));
          // returned + resubmit path
          const ap2 = await Flow.create(file, {title:'طلب صرف', steps:[{name:'سارة'}], by:'علي'});
          await Flow.act(ap2, 0, 'returned', {comment:'أرفق الفاتورة'}); let b2 = await DB.get('approvals', ap2.id); out.returned = [b2.status, (await DB.all('tasks')).find(t=>t.approvalId===ap2.id).status];
          await Flow.resubmit(b2, new File([await other.save()], 'v2.pdf'), 'تمت الإضافة'); b2 = await DB.get('approvals', ap2.id); out.resubmit = [b2.status, b2.version];
          // import package flow (simulate other device: delete record, import)
          await DB.del('approvals', ap.id); const pd2 = await M.fromFiles([pkg]); const wf = JSON.parse(new TextDecoder().decode(Object.values(await pd2.sources[0].pdf.getAttachments())[0].content));
          U.ask = async()=>true; await Flow.importPackage(pd2, wf); const imp = await DB.get('approvals', ap.id); out.imported = imp && [imp.status, imp.steps.map(s=>s.status)];
          return out; }''')
        open(os.path.join(OUT, 'issued.pdf'), 'wb').write(__import__('base64').b64decode(res['approvals'].pop('issuedB64')))
        pg.evaluate("document.querySelectorAll('.modal').forEach(m=>m.remove())")
        res['tasks'] = pg.evaluate('''async()=>{
          await Tasks.create({title:'زيارة موقع الفيصلية', assignee:'اشتباك', dept:'الفيصلية', due:'2026-11-01', priority:'high'});
          await Tasks.create({title:'إصدار رخصة', assignee:'مصطفى', status:'doing', due:'2099-01-01'});
          const all = await DB.all('tasks'); const sv = U.saveFile; const saved = []; U.saveFile = async (n, b)=>{ saved.push([n, b.size]); return true; };
          await Tasks.exportXlsx(); await Tasks.exportIcs(); await Tasks.exportPdf(); U.saveFile = sv;
          const csv = new File(['المهمة,المسؤول,الحالة,التاريخ\\nتطفية R6072,Qalidas,تم,07-11-2026\\nحفر 350m,مصطفى,قيد التنفيذ,2026-11-08\\n'], 'import.csv');
          U.pickFiles = async()=>[csv]; await Tasks.importFile();
          const after = await DB.all('tasks');
          return {count: all.length, saved, imported: after.filter(t=>/R6072|350m/.test(t.title)).map(t=>[t.title, t.status, t.due])}; }''')
        res['automation'] = pg.evaluate('''async()=>{
          const bytes = await M.sampleBytes(); const f1 = new File([bytes], 'a.pdf', {type:'application/pdf'}), f2 = new File([bytes], 'b.pdf', {type:'application/pdf'});
          const P = Auto.presets(); const out = {};
          const send = P.find(r=>r.id==='p_send'); const r1 = await Auto.run(send, [f1, f2], new U.Task()); out.send = r1.map(x=>[x.name, x.blob.size]);
          const d = await M.fromFiles([new File([r1[0].blob], 'm.pdf')]); out.sendPages = d.pages.length;
          const conf = JSON.parse(JSON.stringify(P.find(r=>r.id==='p_conf'))); out.confErr = Auto.validate(conf);
          conf.steps[1].opts.pw = '1234'; conf.steps[1].opts.pw2 = '1234'; const r2 = await Auto.run(conf, [f1], new U.Task()); out.conf = r2.map(x=>x.name);
          const route = JSON.parse(JSON.stringify(P.find(r=>r.id==='p_route'))); route.steps[2].opts.chain = 'سارة، خالد';
          const c = U.canvas(600,800); const x = c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,600,800); x.fillStyle='#000'; x.font='40px Arial'; x.fillText('SCAN 1',40,100);
          const img = new File([await U.canvasBlob(c)], 'scan.png', {type:'image/png'});
          const r3 = await Auto.run(route, [img, img], new U.Task()); out.route = r3.map(x=>x.note);
          const bad = {steps:[{tool:'protect', opts:{pw:'1'}}, {tool:'compress', opts:{level:'lossless'}}]}; out.badErr = Auto.validate(bad);
          return out; }''')
        res['assistant'] = pg.evaluate('''async()=>{
          const out = {};
          const d = await M.fromBytes(await M.sampleBytes(), 'sample.pdf'); const c = await Assist.fromDoc(d); out.ctxChars = c.text.length; out.hasArabic = /المعاملات/.test(c.text);
          U.store.set('ai', {provider:'groq', models:{}, bases:{}}); U.session.set('aikey.groq', 'test-key'); U.store.set('aiConsent.groq', true);
          let streamed = ''; out.stream = await Assist.call([{role:'user', content:'hi'}], {onText:t=>streamed=t}); out.streamed = streamed;
          out.json = await Assist.json([{role:'user', content:'tasks'}]);
          return out; }''')
        # Claude path through a stubbed claude runtime
        pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errors.append(str(e)))
        pg2.add_init_script("""window.claude = {use: async (n)=> n==='sample' ? Object.assign(async (input, o)=>{ const t='تلخيص: المستند يعرض موقف المعاملات.'; o&&o.onText&&o.onText({text:t, delta:t}); return {text:t, truncated:false}; }, {json: async()=>({})}) : n==='downloads' ? {save: async()=>{}} : null};""")
        pg2.goto(url); pg2.wait_for_selector('#toolGrid .tool', timeout=30000)
        res['claude'] = pg2.evaluate("async()=>{ U.store.set('ai', {provider:'claude', models:{}, bases:{}}); return await Assist.call([{role:'system', content:'s'}, {role:'user', content:'لخص'}], {onText:()=>{}}); }")
        # UI screenshots of the new views
        for v, w in [('work', 1366), ('auto', 1366), ('ai', 1366), ('hub', 1366), ('hub', 390), ('work', 390)]:
            pg.set_viewport_size({'width': w, 'height': 900 if w > 500 else 844}); pg.evaluate(f"App.go('{v}')"); pg.wait_for_timeout(700)
            pg.screenshot(path=os.path.join(OUT, f'v-{v}-{w}.png'))
        pg.set_viewport_size({'width':1366,'height':900}); pg.evaluate("Work.tab('board')"); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(OUT, 'v-board.png'))
        pg.evaluate("Work.tab('table')"); pg.wait_for_timeout(500); pg.screenshot(path=os.path.join(OUT, 'v-table.png'))
        pg.evaluate("Work.tab('approvals')"); pg.wait_for_timeout(400)
        pg.evaluate("(async()=>{ const a = (await DB.all('approvals')).sort((x,y)=>x.created-y.created)[0]; Flow.detail(a.id); })()"); pg.wait_for_timeout(2500); pg.screenshot(path=os.path.join(OUT, 'v-detail.png'))
        pg.evaluate("document.documentElement.dataset.theme='dark'"); pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(OUT, 'v-detail-dark.png'))
        b.close()
    res['page_errors'] = errors
    print(json.dumps(res, ensure_ascii=False, indent=1))
if __name__ == '__main__': main()
