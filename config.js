/* وثيق — runtime configuration.
   Copy this file and fill the values for your own deployment. These are PUBLIC identifiers (OAuth client IDs),
   not secrets. Never put API secrets, passwords or Odoo API keys here — Odoo keys live only in the proxy server's
   environment (see server/.env.example). Users can also enter these values in the app (Cloud → Settings);
   values entered there are stored in that browser only. */
window.WATHIQ_CONFIG = {
  // Google Drive (Google Cloud Console → APIs & Services → Credentials)
  googleClientId: '',      // OAuth 2.0 Web client ID, e.g. 1234567890-abc.apps.googleusercontent.com
  googleApiKey: '',        // Browser API key restricted to your domain + Google Picker API
  googleAppId: '',         // Cloud project number (digits)

  // Microsoft OneDrive / SharePoint (Microsoft Entra admin center → App registrations → SPA redirect URI = your app URL)
  msClientId: '',          // Application (client) ID
  msTenant: 'common',      // 'common', 'organizations', or your tenant ID

  // Odoo — URL of YOUR proxy (server/odoo-proxy.mjs), never Odoo itself
  odooProxyUrl: '',        // e.g. https://pdf.example.com/odoo-proxy

  // Support section
  support: { name: { ar: 'م. علي الجدع', en: 'Eng. Ali Al-Jadaa' }, phoneLocal: '0597778853', phoneIntl: '966597778853', email: 'asaa.today2030@gmail.com' },
  telegramUser: '',        // Telegram username without @. Left empty on purpose: it was not provided, so the app falls back to the phone number.

  // Organisation logos in the header and on issued approval records (users can change them in the app: logos button in the header)
  orgLogos: [
    { name: { ar: 'شركة الأساس العريض', en: 'Alasas Alareedh Co.' }, src: 'logos/alasas.png' },
    { name: { ar: 'السعودية للطاقة', en: 'Saudi Electricity' }, src: 'logos/se.png' },
    { name: { ar: 'PDC', en: 'PDC' }, src: 'logos/pdc.png' }
  ],

  // OCR language data (ara/eng traineddata.gz) served next to the app
  tessdataPath: 'tessdata/'
};
