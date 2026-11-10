# وثيق PDF — Wathiq

تطبيق مجاني ثنائي اللغة (عربي/إنجليزي) لتحرير ملفات PDF والمستندات وتحويلها، يعمل داخل المتصفح على الكمبيوتر والهاتف، ويمكن تثبيته كتطبيق (PWA). كل المعالجة محلية على جهاز المستخدم، ولا يُرسل أي ملف إلى خادم إلا عند اختيار خدمة سحابية بضغطة صريحة.

A free, bilingual PDF & document toolkit that runs in the browser on desktop and mobile and installs as an app (PWA). Processing is local; files leave the device only when the user explicitly uploads to a connected cloud service.

---

## التشغيل السريع

```bash
npm run serve          # يبني dist/ ويشغّله على http://localhost:8080
# أو مع خادم Odoo الوسيط ويخدم التطبيق نفسه:
cp server/.env.example server/.env   # عدّل القيم
npm start              # http://localhost:8787
```

النشر: ارفع مجلد `dist/` (بعد `npm run build`) إلى أي استضافة ثابتة تعمل بـ HTTPS (GitHub Pages، Netlify، Cloudflare Pages، Vercel، أو خادمك). بعد الفتح يظهر خيار «تثبيت التطبيق» في Chrome/Edge على الكمبيوتر وAndroid، و«إضافة إلى الشاشة الرئيسية» في Safari على iPhone/iPad. يعمل دون اتصال بعد أول تشغيل.

**تطبيق سطح مكتب/متجر (اختياري):** المجلد `dist/` جاهز للتغليف كما هو:
- Windows/macOS/Linux: [Tauri](https://tauri.app) (`npm create tauri-app` ثم اجعل `frontendDist` يشير إلى `dist`).
- Android/iOS: [Capacitor](https://capacitorjs.com) (`npx cap init` ثم `webDir: "dist"`).
لم يُنفَّذ التغليف في هذه المرحلة.

---

## ما يعمل الآن

| المجموعة | الأدوات | ملاحظات |
|---|---|---|
| المحرر | عرض، تكبير، بحث في النص، مصغرات الصفحات، تراجع/إعادة، اختصارات لوحة المفاتيح | |
| التحرير | إضافة نص عربي/إنجليزي، تعديل نص موجود (تغطية + كتابة)، تظليل، تسطير، شطب، أشكال، أسهم، رسم حر، صور، تغطية بيضاء | الإضافات طبقة فوق الصفحة تُرسم كصورة عالية الدقة لضمان تشكيل الحروف العربية؛ لا تُعدَّل نصوص PDF الأصلية في مكانها |
| التعليقات والروابط | تعليقات PDF حقيقية (Text annotation)، روابط قابلة للنقر | |
| التوقيع والأختام | توقيع مرسوم/مكتوب/صورة، حفظ التواقيع محليًا، منشئ أختام، قص وتدوير الصور، إزالة الخلفية | توقيع **مرئي** وليس توقيعًا رقميًا معتمدًا (PAdES) |
| الحجب | إزالة فعلية: الصفحة المحجوبة تُحوّل إلى صورة بعد طمس المناطق | النص في تلك الصفحة لا يعود قابلًا للتحديد |
| النماذج | تعبئة الحقول الموجودة (نص، اختيار، قوائم)، إنشاء حقول نصية ومربعات اختيار، تسطيح | التسطيح للقيم اللاتينية؛ العربية تُحفظ مع NeedAppearances |
| تنظيم | دمج، تقسيم، حذف، استخراج، ترتيب بالسحب، تدوير، تكرار، صفحة فارغة، قص الهوامش | |
| تحسين | ضغط (بدون فقد / متوسط / قوي / رمادي)، إصلاح، OCR عربي+إنجليزي → PDF قابل للبحث أو نص أو Word | ضغط المتوسط والقوي يحوّل الصفحات لصور |
| إلى PDF | صور، Word (DOCX)، Excel/CSV، نص/HTML/Markdown | التنسيق المعقد في Word قد يختلف |
| من PDF | صور (JPG/PNG/WebP)، Word (نص أو صور)، Excel، PowerPoint (صور)، نص/Markdown | الأعمدة في Excel تقريبية |
| الأمان | حماية بكلمة مرور (تشفير فعلي) وصلاحيات، فك الحماية بكلمة المرور الصحيحة، إزالة/تعديل البيانات الوصفية | لا يتم كسر الحماية |
| ملفات | تحويل صيغ الصور، إزالة خلفية التواقيع، إنشاء ZIP وفكه، مقارنة نسختين | |
| السحابة | Google Drive، OneDrive/SharePoint، iCloud (منتقي النظام)، Odoo عبر خادم وسيط | تحتاج إعدادات المستخدم (أدناه) |
| الدعم الفني | م. علي الجدع، 0597778853، asaa.today2030@gmail.com، واتساب، تيليجرام، اتصال، بريد | |

### غير مكتمل وسببه
- **PowerPoint → PDF** محليًا: لا توجد مكتبة متصفح موثوقة. البديل الحالي: افتح الملف من OneDrive داخل التطبيق واختر «→ PDF» (تحويل عبر Microsoft Graph). للحل المحلي الكامل أضف خادم [Gotenberg](https://gotenberg.dev) أو LibreOffice.
- **إزالة الخلفيات المعقدة** (أشخاص/مناظر): تحتاج نموذج ذكاء اصطناعي (مثل `@imgly/background-removal` ~40MB). المدمج حاليًا مخصص للخلفيات الفاتحة/أحادية اللون.
- **التوقيع الإلكتروني ذو الأثر القانوني**: يحتاج شهادة رقمية ومزود ثقة مرخّص.
- **Dropbox وBox**: موصلات مستقبلية، غير معروضة كجاهزة.
- **موصلات Google وMicrosoft وOdoo** مكتوبة كاملة لكنها لم تُختبر على حسابات حقيقية، لأنها تحتاج معرّفاتك الخاصة.

---

## إعداد الخدمات السحابية

القيم في `config.js` معرّفات عامة وليست أسرارًا. يمكن أيضًا إدخالها من داخل التطبيق (السحابة → الإعدادات).

**Google Drive**
1. Google Cloud Console → أنشئ مشروعًا → فعّل *Google Drive API* و*Google Picker API*.
2. OAuth consent screen → أضف النطاق `drive.file` فقط.
3. Credentials → OAuth client ID (Web) → Authorized JavaScript origins = عنوان تطبيقك.
4. Credentials → API key مقيّد بنطاقك وبـ Picker API.
5. ضع `googleClientId` و`googleApiKey` و`googleAppId` (رقم المشروع).

**OneDrive / SharePoint**
1. Microsoft Entra admin center → App registrations → New.
2. Authentication → Single-page application → Redirect URI = عنوان تطبيقك.
3. API permissions → Microsoft Graph (Delegated): `Files.ReadWrite`، و`Sites.Read.All` إن أردت مواقع SharePoint.
4. ضع `msClientId` و`msTenant`.

**iCloud**: لا توجد واجهة برمجة عامة لإدارة ملفات iCloud من الويب. على iPhone/iPad/Mac يظهر iCloud Drive في منتقي الملفات عند «فتح من الملفات»، والحفظ عبر «حفظ في الملفات» من نافذة المشاركة.

**Odoo** (14 حتى 19)
1. أنشئ مستخدم تكامل بصلاحيات محدودة، ثم Preferences → Account Security → New API Key.
2. `cp server/.env.example server/.env` واملأ `ODOO_URL` و`ODOO_DB` و`ODOO_LOGIN` و`ODOO_API_KEY` و`PROXY_TOKEN`.
3. `ODOO_MODE=jsonrpc` لإصدارات 14–18، و`json2` لواجهة JSON-2 في Odoo 19+.
4. اختياري: `ODOO_ALLOWED_MODELS=res.partner,sale.order` لحصر النماذج.
5. في التطبيق: السحابة → Odoo → عنوان الخادم الوسيط + رمز الوصول.
المفتاح يبقى في الخادم فقط؛ المتصفح لا يراه.

---

## البنية

```
index.html            واجهة التطبيق (CSS + هيكل)
config.js             إعدادات عامة (بدون أسرار)
app/i18n.js           النصوص العربية والإنجليزية
app/util.js           أدوات عامة: الحفظ، النوافذ، الصور، إزالة الخلفية
app/model.js          نموذج المستند: القراءة (pdf.js)، الكتابة والتصدير (pdf-lib)
app/editor.js         المحرر، الطبقات، الصفحات، البحث، النماذج
app/sign.js           التوقيع والأختام والقص
app/tools.js          كل الأدوات (دمج، تقسيم، ضغط، OCR، تحويلات…)
app/cloud.js          Google Drive، OneDrive/SharePoint، iCloud، Odoo
app/main.js           التنقل، اللغة، الوضع الداكن، الدعم الفني
app/store.js          قاعدة البيانات المحلية (IndexedDB) والنسخ الاحتياطي
app/workflow.js       الاعتمادات، البصمة، توقيع الخطوات، الحزم، النسخة المعتمدة، التحقق
app/tasks.js          المهام، سجل المتابعة، التصدير والاستيراد
app/automate.js       وصفات الأتمتة
app/ai.js             المساعد الذكي والمزودات
app/textedit.js       محرر النصوص: استبدال، مطابقة الأنماط، التدقيق
app/auth.js           الحسابات الاختيارية والمزامنة
fonts/                IBM Plex Sans Arabic (OFL) لتضمين النص الحقيقي
server/odoo-proxy.mjs خادم Odoo الوسيط (بدون اعتماديات)
tessdata/             بيانات OCR العربية والإنجليزية
sw.js                 العمل دون اتصال
tests/smoke_test.py   اختبار شامل في Chromium
```

المكتبات (مفتوحة المصدر، مثبتة الإصدار): pdf.js 3.11.174، @cantoo/pdf-lib 2.11.1 (يدعم التشفير)، Tesseract.js 5.1.1، JSZip 3.10.1، SheetJS 0.18.5، mammoth 1.6.0، html2canvas 1.4.1، PptxGenJS 3.12.0، MSAL 2.39.0.

## الاختبار

```bash
npm run build && python3 tests/smoke_test.py && python3 tests/workflow_test.py && python3 tests/text_test.py
# بدون إنترنت: LIBDIR=<node_modules تحتوي المكتبات أعلاه> python3 tests/smoke_test.py
```
يشغّل كل أداة على ملفات حقيقية، ويختبر المحرر (نص، تعديل نص موجود، توقيع، روابط، تعليقات، حقول، حجب، تدوير)، وتبديل اللغة، وتخطيط الهاتف.

## الخصوصية
- المعالجة داخل المتصفح. الملفات المؤقتة في الذاكرة فقط وتُحرَّر بانتهاء العملية.
- رموز الدخول للخدمات في `sessionStorage` وتُمسح بإغلاق المتصفح.
- التواقيع المحفوظة في متصفح الجهاز فقط.
- لا تحليلات ولا تتبع.

## التحليل المرجعي
بُني بأسلوب الغرفة النظيفة عبر مهارة app-recloning (أداة REA `rea-agents` 6.8.0): حُلِّلت قوائم الميزات المنشورة لـ Adobe Acrobat وiLovePDF وصورة المحرر المرجعية، ثم كُتب كل شيء من الصفر بهوية بصرية أصلية. لا شيفرة ولا شعارات ولا نصوص منسوخة. البرومت الكامل في `PROMPT.md`.

---

## الإصدار 2: المعاملات والاعتماد والأتمتة والمساعد

### الاعتمادات (المعاملات ← الاعتمادات)
- **طلب اعتماد** من أي مستند: الموضوع، الجهة، الأولوية، تاريخ الاستحقاق، وسلسلة معتمدين **متتابعة أو متوازية**. رقم تسلسلي تلقائي (`WQ-2026-0001`).
- كل معتمد يختار: **اعتماد** (مع توقيعه المحفوظ أو توقيع جديد، والختم الرسمي اختياريًا)، **إعادة للتعديل**، أو **رفض** (مع سبب إلزامي). بعدها يعيد مقدم الطلب الإرسال بنسخة معدلة (يحفظ رقم الإصدار).
- **بصمة المحتوى**: تجزئة SHA-256 لنص كل صفحة وأبعادها، وبصمة شكل مصغّرة لكل صفحة. تمنع اتخاذ القرار على مستند تغيّر بعد إرساله، وتكشف التعديل في النسخة المعتمدة.
- **توقيع كل خطوة بمفتاح الجهاز** (ECDSA P-256 عبر WebCrypto؛ المفتاح الخاص لا يغادر المتصفح). أي تعديل على سجل الخطوات يُكشف عند التحقق.
- **حزمة الاعتماد**: ملف PDF عادي يحمل سجل الطلب كمرفق داخلي. يُرسل عبر واتساب أو البريد أو المشاركة، ويفتحه المعتمد التالي في وثيق على جهازه فيُستورد تلقائيًا. لا يحتاج خادمًا.
- **النسخة المعتمدة**: تواقيع المعتمدين وأسماؤهم وتواريخهم، وختم «معتمد» برقم المعاملة على صفحة التوقيع، وصفحة **سجل اعتماد** مع رمز QR، والسجل الكامل مضمّن في الملف. يمكن ضبط المواضع في المحرر قبل الحفظ.
- **التحقق**: افتح أي نسخة معتمدة لترى: هل تغيّر النص؟ هل تغيّر شكل الصفحات؟ هل توقيعات الخطوات سليمة؟

> حدود: الهوية هنا اسم مكتوب ومفتاح جهاز، وليست شهادة رقمية صادرة من جهة ثقة (PAdES/X.509). للأثر القانوني الملزم استخدم مزود توقيع إلكتروني مرخّص. التعاون المتزامن بين عدة مستخدمين على نفس السجل يحتاج خادمًا مشتركًا؛ الحزم تغطي التمرير بين الأجهزة دون خادم.

### المهام (المعاملات ← لوحة المهام / سجل المتابعة)
- لوحة بأربعة أعمدة: جديدة، قيد التنفيذ، بانتظار الاعتماد، مكتملة. سحب وإفلات على الكمبيوتر، وقائمة نقل على الهاتف.
- كل مهمة: المسؤول، الجهة/الحي/المشروع، الأولوية، الاستحقاق، مرجع، ملاحظات، قائمة تحقق، ومستند مرفق.
- طلبات الاعتماد تُنشئ مهمة تلقائيًا وتتحدث حالتها مع كل قرار.
- **سجل المتابعة** بجدول على نمط جداول المعاملات الورقية، مع إبراز المتأخر.
- تصدير **Excel** و**PDF** (جدول عربي أفقي) و**تقويم ICS** بتذكير، واستيراد من Excel/CSV بأعمدة عربية أو إنجليزية (المهمة، المسؤول/المراقب، الحالة، التاريخ، الحي…).
- نسخة احتياطية واستعادة لكل البيانات في ملف واحد.

### الأتمتة
- **وصفات** تسلسل الأدوات (تحويل ← دمج ← ترقيم ← علامة مائية ← OCR ← ضغط ← حماية ← إرسال للاعتماد…) وتعمل على دفعة ملفات، كل ملف وحده أو الكل معًا، مع قاعدة تسمية `{name} {date} {n}`.
- وصفات جاهزة: تجهيز ملف للإرسال، أرشفة الممسوحات، مستند سري، ممسوح إلى طلب اعتماد، تصغير للمراسلة.

### المساعد الذكي
- إجراءات سريعة: تلخيص، استخراج البيانات كجدول (← Excel)، استخراج المهام والمواعيد (← لوحة المهام)، ترجمة، صياغة خطاب رد، مذكرة اعتماد، تدقيق لغوي. أسئلة حرة عن المستند، وحفظ الإجابة Word أو PDF.
- المزودات:

| المزود | التكلفة | ملاحظات |
|---|---|---|
| Claude | ضمن حسابك | داخل claude.ai فقط، يطلب الإذن عند أول استخدام |
| Google Gemini (AI Studio) | طبقة مجانية | قد تُستخدم بيانات الطبقة المجانية لتحسين الخدمة؛ لا ترسل مستندات سرية |
| Groq | طبقة مجانية | سريع جدًا، حدود بالدقيقة واليوم |
| OpenRouter | نماذج `:free` | حدود يومية؛ بعض المزودين قد يسجّلون الطلبات |
| Mistral | خطة Experiment | تحقق برقم الهاتف، وقد تشمل التدريب على البيانات |
| Ollama / LM Studio | مجاني محليًا | بدون إنترنت وبدون مفتاح |
| خادم وثيق الوسيط | حسب المزود | المفتاح في `server/.env` فقط (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) |

- المفتاح يُحفظ في جلسة المتصفح فقط افتراضيًا، ويُرسل مباشرة إلى المزود. يظهر تنبيه خصوصية قبل أول إرسال لكل مزود. إذا ظهر مفتاحك في مكان عام فألغِه وأنشئ غيره.
- الحدود والشروط تتغير؛ راجع قائمة [free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources) وشروط كل مزود. لا تستخدم واجهات غير رسمية.

### الهوية البصرية
حبر أزرق رسمي للأوامر، وقرمزي الأختام مخصص للاعتماد وشعار الختم، وسطوح ورقية باردة. الخطوط: El Messiri للعناوين وReadex Pro للواجهة، مع شريط تبويب سفلي على الهاتف.

---

## الإصدار 3: التصميم، تحرير النصوص، أدوات iLovePDF، الحسابات

### المظهر
- أربعة خيارات من زر المظهر: **تلقائي** (يتبع الجهاز)، **فاتح**، **داكن**، **مشرق** (ألوان حيوية وتباين أعلى وشريط ملوّن). الألوان مبنية على مهارة theme-factory (Arctic Frost للفاتح، Ocean Depths/Midnight للداكن، Tech Innovation للمشرق).
- الخطوط: Alexandria للعناوين، Readex Pro للواجهة، El Messiri للأختام.
- المحرر بشريط أدوات مُعنون بتبويبات: تحرير، تعليق، توقيع واعتماد، الصفحات، تحويل، حماية. الصفحة الرئيسية فيها «ابدأ بسرعة» وملخص المعاملات المعلقة.

### تحرير وتصحيح النصوص (المحرر ← محرر النصوص)
- **نصوص الصفحة**: كل سطر في الصفحة قابل للتعديل مباشرة. يُغطّى الأصل **بلون خلفيته الفعلي** (يعمل على خلايا الجداول الملونة) ويُكتب الجديد **بلون الخط نفسه** ووزنه وعائلته (عربي، Sans، Serif، Mono).
- **بحث واستبدال** في كل المستند: مطابقة حالة الأحرف، كلمة كاملة، **تجاهل التشكيل والهمزات** (أ إ آ ا، ى ي، ة ه، الأرقام العربية والهندية).
- **التدقيق السريع** على الجهاز: أخطاء عربية شائعة (همزة الوصل في المصادر مثل «إستلام» ← «استلام»، «هاذا» ← «هذا»، «الى» ← «إلى»…)، أخطاء إنجليزية شائعة، الكلمات المكررة، المسافات الزائدة، الأرقام المختلطة.
- **التدقيق بالذكاء الاصطناعي** عبر مزود المساعد (Claude داخل claude.ai أو مفتاحك المجاني)، مع تطبيق كل تصحيح أو تجاهله.
- **نص حقيقي**: النص المضاف أو المعدّل يُكتب داخل PDF كنص متجه قابل للتحديد والبحث والنسخ، بخط IBM Plex Sans Arabic المضمَّن (مع التشكيل الصحيح للحروف العربية) وخطوط PDF القياسية للاتيني.
- خيار **حذف النص الأصلي نهائيًا** عند الحفظ (تتحول الصفحة المعدّلة إلى صورة ويبقى الجديد نصًا حقيقيًا).

> حد معروف: بعض ملفات PDF تخزّن الحرفين «لا» كحرف واحد مركّب، فيظهر في الاستخراج «ال» (قيد في قارئ pdf.js). ملفات وثيق نفسها لا تتأثر.

### أدوات مطابقة لـ iLovePDF
كل أدوات الصفحة الرئيسية في iLovePDF موجودة (41 أداة)، ومن الجديد:
- **مسح ضوئي إلى PDF**: كاميرا الهاتف أو الصور، تحسين أبيض وأسود تكيّفي للمستندات أو رمادي أو ألوان، مع OCR اختياري.
- **PowerPoint إلى PDF** داخل المتصفح: النصوص والصور والأشكال والخلفيات (تحويل تقريبي، لا يشمل الرسوم البيانية وSmartArt).
- **PDF إلى PDF/A** (‏2b): بيانات XMP وملف ألوان sRGB، بخيار أرشيف صور أو الإبقاء على النص. لم يُتحقق منه بمدقق veraPDF.
- **ذكاء اصطناعي**: تلخيص PDF، ترجمة PDF، اسأل المستند، استخراج الجداول، تدقيق النص.
- **HTML إلى PDF** يعمل على ملفات HTML. التحويل من رابط موقع غير مدعوم، لأن المتصفح يمنع جلب صفحات المواقع الأخرى.

### الحسابات (اختيارية)
- يعمل التطبيق كاملًا **بدون تسجيل**. التسجيل يضيف **مزامنة** المعاملات والمهام والوصفات ومستنداتها بين الأجهزة.
- طرق الدخول (تُفعّل في `server/.env`):
  - **البريد الإلكتروني برمز من 6 أرقام**: عبر Gmail (‏`SMTP_HOST=smtp.gmail.com`، و`SMTP_PASS` كلمة مرور تطبيق من حساب Google) أو Resend.
  - **واتساب برمز**: WhatsApp Cloud API من Meta مع قالب مصادقة (Authentication) معتمد (`WA_TOKEN`، `WA_PHONE_ID`، `WA_TEMPLATE`).
  - **تسجيل الدخول بـ Google/Gmail**: ‏`GOOGLE_CLIENT_ID` (يُتحقق من الرمز في الخادم).
- الأمان: الرموز صالحة 10 دقائق، و5 محاولات كحد أقصى، وحد للإرسال لكل رقم أو بريد ولكل IP. الجلسات موقّعة HMAC لمدة 30 يومًا، والمستخدمون والنسخ في `server/data/`. لا تُخزَّن كلمات مرور.
- للتجربة: `AUTH_DEV=1` يطبع الرموز في سجل الخادم بدل إرسالها.
- داخل معاينة claude.ai لا يتوفر الخادم، فيظهر خيار «المتابعة كضيف» فقط.

## الدعم الفني
م. علي الجدع — 0597778853 — asaa.today2030@gmail.com — [واتساب](https://wa.me/966597778853)

## v4 — React shell (web-artifacts-builder) and organisation logos

- `dist/index.html` is now a React 18 + TypeScript + Tailwind + shadcn/ui shell (source in `shell/`). It renders a two-tier header (brand, organisation logos, save, account, language, appearance menu, nav tabs; a side sheet on mobile) and mounts the existing engine (`app/*.js`) unchanged. The previous vanilla page is kept as `dist/classic.html`.
- Organisation logos: set the defaults in `config.js → orgLogos` (files in `logos/`). In the app, the logos button in the header opens a manager to add, rename, reorder, hide, or remove logos and to choose whether each one also prints on issued approval certificates. Changes are stored in that browser (`localStorage: wq.orgLogos`).
- Build the shell: `SHELL_BUILD_DIR=/path/to/build bash shell/build.sh` (runs `npm i` once in that folder, syncs the legacy markup via `shell/sync-legacy.py`, bundles to a single `index.shell.html`), then `node build.mjs`.
- shadcn colour variables are prefixed `--sh-*` so they do not clash with the engine's own tokens; Tailwind preflight is off for the same reason.

## v5 — Vivid bright skin, 3D icons, single-file HTML, Android APK, container, GitHub

- **Bright skin**: warm sun gradient header, coloured quick-start cards, pill tabs and chips, gradient primary buttons, floating mobile tab bar. Light and dark skins keep their calmer look.
- **3D icons** (all skins): every tool, nav and tab icon sits on a glossy gradient tile (top highlight, inner shade, coloured drop shadow); the colour follows the tool group. New app icon in `icons/` and `mobile/assets/`.
- **Single-file HTML**: `node scripts/standalone.mjs` → `dist/wathiq-standalone.html` (engine, fonts, logos embedded; PDF libraries and OCR data load from public CDNs). Open it from disk or send it to anyone. `--no-logos` leaves the organisation logos out.
- **Android APK**: Capacitor project in `mobile/` (see `mobile/README.md`). Saved files go to Documents/Wathiq with the share sheet. Built by `.github/workflows/android.yml`.
- **Container**: `Dockerfile` (Node 20 alpine, no npm deps) serves the app and the optional Odoo/AI/sign-in proxy on port 8080; data in `/data`. `docker run -p 8080:8080 ghcr.io/<user>/<repo>:latest` or `docker compose up -d`.
- **GitHub**: `bash scripts/publish-github.sh [name]` creates the repo, pushes, turns on Pages and tags a release. Workflows:
  - `pages.yml` → web app at `https://<user>.github.io/<repo>/`
  - `docker.yml` → `ghcr.io/<user>/<repo>` (amd64 + arm64)
  - `android.yml` → APK artifact on every push; a `v*` tag publishes a Release with the APK and the single-file HTML.

### مشاركة التطبيق مع الأصدقاء (ملخص)
1. ثبّت GitHub CLI وسجّل الدخول: `gh auth login`
2. من مجلد المشروع: `bash scripts/publish-github.sh wathiq-pdf`
3. بعد دقائق: رابط الويب `https://<اسمك>.github.io/wathiq-pdf/`، وملف APK وصفحة HTML في `Releases`، والحاوية `ghcr.io/<اسمك>/wathiq-pdf`.
4. لجعل الحاوية متاحة للجميع: Packages → wathiq-pdf → Package settings → Change visibility → Public.

## v7 — OCR studio: read, check and edit text and data from any file or image

- **Extract text & data** (`ocrdata` tool, also in the editor's Edit tab): PDFs and photos are read on the device with Tesseract.js (Arabic + English). Image clean-up (auto-levels, or adaptive threshold for shadows), a second English pass for Latin lines inside Arabic pages (IBANs, e-mails, codes), and per-word confidence.
  - **Data**: Gregorian and Hijri dates, amounts and currencies (plus totals with an unreadable currency), IBAN with mod-97 check (and recovery when the "SA" letters are misread), Saudi VAT number, mobile numbers, e-mails, links, CR and reference numbers, and `label: value` fields.
  - **Tables** from column alignment; **Check** tab lists low-confidence words, mixed-script misreads, low resolution, and more.
  - Export to Excel (Text, Data, one sheet per table, words to review), JSON, TXT, Word, or a searchable PDF.
- **Deep text check** (`ocrcheck`): OCRs pages that already have a text layer and compares the two. A low match flags invisible or broken text (e.g. hidden white text, broken font encodings) and lists the words found only in the layer or only in the image.
- **Edit scanned text** (`ocredit`, and "Read page text (OCR)" in the editor): OCR lines become editable items in the Text editor; replacements cover the original with a matched background and colour. Saved files get an invisible text layer so they are searchable (skipped on pages with redaction).
- **AI correction (vision)**: optional, per page, after the user presses the button and accepts the provider notice. Sends a page image plus the OCR text and gets back corrected text, fields and tables. Providers: Claude inside claude.ai, or your own key for Gemini, Groq, OpenRouter, Mistral, NVIDIA NIM, a local model (Ollama), or the Wathiq proxy. Each provider has a separate *vision model* setting.
- **Proxy**: `AI_VISION_MODEL` is used when a request contains images; `AI_FALLBACK_*` is tried automatically when the primary provider answers 429 or 5xx. Keys live only in `server/.env`.
- **Assistant**: scanned PDFs and photos are OCR'd automatically before summarising or asking questions.
- **Fix**: Arabic letter ligatures (e.g. «ضر», «بي») were extracted in reverse order from saved PDFs; the ToUnicode mapping now stores them so copy and search return the right word.
- Test: `LIBDIR=… python3 tests/ocr_test.py`.

## v9 — Council review: speed, fixes, accessibility, recent files, quick search

Three independent reviews (code, performance, design) were run and their findings merged:
- **Speed**: pdf.js now parses and renders in one shared Web Worker (opening a 20-page PDF: ~1.1 s with ~0.95 s of UI freezes → ~0.16 s with none). Engine files download in parallel; signature fonts load when idle; hero animations pause off-screen or in a hidden tab; per-icon CSS filters removed; thumbnails render lazily; far-away page canvases are freed; pixel density capped at 2. Server: gzip/brotli, ETag and cache headers. Service worker: cached app served first and refreshed in the background.
- **Fixes**: redaction now removes the original page objects from the saved file (they were only unlinked before); proxy access for signed-in accounts requires `PROXY_USERS`; static serving blocks `..%2f` traversal and serves `dist/` by default; `X-Forwarded-For` only trusted with `TRUST_PROXY=1`; the AI model can't be chosen by the client unless `AI_ALLOW_CLIENT_MODEL=1`; the service worker never caches `/api/`; recipe passwords are never stored; recipe output names no longer collide; Cancel stops the running step; reference numbers can't repeat; pdf.js documents and idle OCR workers are freed; HTML conversion sanitising is stricter and its CSS is scoped; the "proxy" AI provider uses the signed-in session; "nullnull" in Automation fixed; recipe arrows follow the language direction.
- **Accessibility**: bright-skin accent and primary buttons meet 4.5:1; WhatsApp/Telegram/e-mail buttons meet contrast; dark focus ring in the bright header; skip link; logos and the hidden file input are out of the tab order; 44 px touch targets on phones; ribbon edge fades; English headings use Readex Pro; looser Arabic line-height.
- **New**: recent files on the home page (kept on this device only, clearable) and quick search across all tools and sections (Ctrl/⌘ K, `/`, or the search button).
- **Opening**: the splash shows the animated app icon instead of the name; tool icons tilt in 3D toward the pointer and flip in as they appear.
#   s m a r t - c a s h - v 0 . 1  
 