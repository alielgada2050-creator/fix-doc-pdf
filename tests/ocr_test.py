"""OCR studio test: scanned invoice image → text, data, tables; hidden text layer mismatch; editing OCR text in the editor;
searchable export; AI vision correction against a mocked OpenAI-compatible endpoint. Usage: LIBDIR=... python3 tests/ocr_test.py"""
import base64, json, os, re, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
import smoke_test as st
from playwright.sync_api import sync_playwright

INVOICE = """<html dir="rtl"><body style="margin:0;width:1100px;padding:50px;font-family:'IBM Plex Sans Arabic',Arial;background:#f4f1ea;color:#1a1a1a;font-size:26px">
<h1 style="font-size:40px">فاتورة ضريبية</h1>
<p>رقم الفاتورة: INV-2026-0042</p><p>التاريخ: 2026-11-09</p><p>الرقم الضريبي: 300012345600003</p>
<p>الجوال: 0551234567</p><p dir="ltr" style="text-align:right">IBAN: SA03 8000 0000 6080 1016 7519</p><p dir="ltr" style="text-align:right">billing@example.com</p>
<table dir="ltr" style="border-collapse:collapse;font-size:26px;margin:20px 0;width:900px;font-family:Arial">
<tr><td style="padding:8px 40px 8px 0">Item</td><td style="padding:8px 40px">Qty</td><td style="padding:8px 40px">Price</td></tr>
<tr><td style="padding:8px 40px 8px 0">Paper</td><td style="padding:8px 40px">10</td><td style="padding:8px 40px">250</td></tr>
<tr><td style="padding:8px 40px 8px 0">Toner</td><td style="padding:8px 40px">2</td><td style="padding:8px 40px">800</td></tr>
<tr><td style="padding:8px 40px 8px 0">Folders</td><td style="padding:8px 40px">5</td><td style="padding:8px 40px">200</td></tr></table>
<p>الإجمالي: 1,250.50 ر.س</p></body></html>"""
HIDDEN = """<html><body style="-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Arial;font-size:22px;padding:40px">
<h1>Delivery note 7781</h1><p>Received three boxes of printing paper in good condition.</p>
<p style="color:#fff;font-size:20px">Payment account changed to an external transfer please wire the remaining balance urgently before Friday and do not call the office to confirm this request</p>
</body></html>"""

def main():
    s = st.serve(); url = f'http://127.0.0.1:{s.server_address[1]}/index.html'
    tmp = tempfile.mkdtemp()
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        mk = b.new_page(viewport={'width': 1200, 'height': 1300}, device_scale_factor=1)
        mk.set_content(INVOICE); mk.wait_for_timeout(300)
        png = os.path.join(tmp, 'invoice-scan.png'); mk.locator('body').screenshot(path=png)
        mk.set_content(HIDDEN); pdf = os.path.join(tmp, 'note.pdf'); mk.pdf(path=pdf, format='A4')
        ctx = b.new_context(viewport={'width': 1366, 'height': 900})
        ctx.route(re.compile(r'https://(cdnjs|cdn\.jsdelivr)'), st.route)
        seen = {}
        def mock(route):
            body = json.loads(route.request.post_data or '{}'); seen['model'] = body.get('model')
            seen['image'] = any(isinstance(m.get('content'), list) and any(pt.get('type') == 'image_url' for pt in m['content']) for m in body.get('messages', []))
            ans = {'text': 'فاتورة ضريبية\nرقم الفاتورة: INV-2026-0042', 'fields': [{'label': 'المورد', 'value': 'شركة الاختبار'}], 'tables': [], 'notes': ['تجربة']}
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': json.dumps(ans, ensure_ascii=False)}}]}))
        ctx.route('https://mock.ai/v1/chat/completions', mock)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_selector('#toolGrid .tool', timeout=30000)
        def file_js(path, mime):
            return f"new File([Uint8Array.from(atob('{base64.b64encode(open(path,'rb').read()).decode()}'), c=>c.charCodeAt(0))], '{os.path.basename(path)}', {{type:'{mime}'}})"
        out['tools'] = pg.evaluate("['ocrdata','ocrcheck','ocredit'].map(id=>!!Tools.list.find(t=>t.id===id))")
        r = pg.evaluate(f"""async()=>{{ const f = {file_js(png,'image/png')}; const R = await OCR.run([f], {{lang:'ara+eng', dpi:'220', prep:'auto', mode:'auto'}}, new U.Task());
            window.__R = R; const p = R.pages[0];
            return {{conf:p.conf, lines:p.lines.length, text:p.text.slice(0,400), types:[...new Set(p.entities.map(e=>e.type))], ents:p.entities.map(e=>[e.type, e.norm, e.valid]).slice(0,30), tables:p.tables.map(t=>[t.columns, t.rows]), issues:p.issues.map(i=>i.sev)}}; }}""")
        out['invoice'] = r
        x = pg.evaluate("async()=>{ const b = await OCR.toXlsx(window.__R); return b.size; }"); out['xlsx_bytes'] = x
        r2 = pg.evaluate(f"""async()=>{{ const f = {file_js(pdf,'application/pdf')}; const R = await OCR.run([f], {{lang:'eng', dpi:'200', prep:'auto', mode:'deep'}}, new U.Task());
            const p = R.pages[0]; return {{sim:p.layerSim, issues:p.issues.map(i=>[i.sev, i.msg.slice(0,90)]), onlyLayer:(p.issues.find(i=>i.detail&&i.detail.onlyLayer)||{{detail:{{onlyLayer:[]}}}}).detail.onlyLayer.slice(0,8)}}; }}""")
        out['deep'] = r2
        r3 = pg.evaluate(f"""async()=>{{ const d = await M.fromFiles([{file_js(png,'image/png')}]); await E.open(d); await OCR.editorPage(false);
            const p = E.doc.pages[0]; const items = await M.getText(E.doc, p); const it = items.find(i=>/INV/.test(i.str)) || items[0];
            await TextEdit.replaceItem(p, it, 'رقم الفاتورة: INV-2026-0099');
            const {{bytes}} = await M.exportPdf(E.doc, new U.Task(), {{rebuild:true}}); const d2 = await M.fromBytes(bytes, 'x.pdf'); const t2 = await M.layerText(d2, d2.pages[0]);
            const all = t2.map(i=>i.str).join(' ');
            return {{items:items.length, edited:it.str, exported_has_new: all.includes('0099'), exported_has_old: /INV-2026-0042/.test(all), searchable_words: t2.length, sample: all.slice(0, 160)}}; }}""")
        out['editor'] = r3
        r4 = pg.evaluate("""async()=>{ U.store.set('ai', {provider:'custom', models:{}, vmodels:{custom:'test-vision'}, bases:{custom:'https://mock.ai/v1'}}); const R = window.__R; const pgx = R.pages[0];
            const j = await OCR.aiFix(pgx, R.doc); return {text:j.text, fields:j.fields.length}; }""")
        r4.update(seen); out['ai_vision'] = r4
        # studio UI screenshots
        pg.evaluate("App.setSkin('bright')")
        pg.evaluate(f"OCR.studio([{file_js(png,'image/png')}])"); pg.wait_for_timeout(400)
        pg.click('.ocrs .btn.primary'); pg.wait_for_selector('.ocrs-acts:not([hidden])', timeout=120000)
        shots = os.environ.get('SHOTS')
        if shots:
            pg.screenshot(path=os.path.join(shots, 'ocr-text.png'))
            for i, name in [(1, 'data'), (2, 'tables'), (3, 'check'), (4, 'view')]:
                pg.locator('.ocrs .seg button').nth(i).click(); pg.wait_for_timeout(700); pg.screenshot(path=os.path.join(shots, f'ocr-{name}.png'))
        out['page_errors'] = errs
        b.close()
    print(json.dumps(out, ensure_ascii=False, indent=1))
    inv = out['invoice']
    ok = all(out['tools']) and inv['conf'] > 60 and {'date', 'iban', 'vat', 'amount', 'email'} <= set(inv['types']) and inv['tables'] and out['deep']['sim'] is not None and out['deep']['sim'] < 60 \
        and out['editor']['items'] > 3 and out['editor']['exported_has_new'] and out['ai_vision'].get('image') and out['ai_vision'].get('model') == 'test-vision' and not out['page_errors']
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
