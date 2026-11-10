# وثيق — Android (APK)

The app is the same web build (`../dist`) inside a Capacitor WebView. It is built automatically by GitHub Actions
(`.github/workflows/android.yml`); you don't need Android Studio.

Build locally (needs Node 20, JDK 17 and the Android SDK):

```bash
cd mobile
npm install
npm run prepare-web        # builds ../dist and copies it to www/
npx cap add android        # first time only
npm run assets             # app icon + splash from assets/
npx cap sync android
npm run apk                # → android/app/build/outputs/apk/debug/app-debug.apk
```

Notes
- Saved files go to Documents/Wathiq on the phone, and the share sheet opens so you can send them.
- PDF libraries load from public CDNs the first time, so the first launch needs internet; OCR data for Arabic and English is bundled.
- Google Drive / OneDrive sign-in pop-ups do not work inside an app WebView; use the web version for cloud sign-in.
- The debug APK is signed with a debug key: fine for sharing with friends (they allow "install unknown apps"), not for Google Play.
