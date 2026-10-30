// Sends email. Works over HTTPS (Brevo API, needed on free hosts that block SMTP) or SMTP (local / paid hosts).
//   BREVO_API_KEY + MAIL_FROM   -> Brevo HTTPS API (recommended for hosting)
//   SMTP_HOST/PORT/USER/PASS + MAIL_FROM -> any SMTP server (e.g. Gmail app password)
//   MAIL_CONSOLE=1              -> just print emails to the terminal (testing)
const state = { day: '', n: 0 };
const PLATFORM_DAILY_CAP = Number(process.env.MAIL_DAILY_CAP || 280); // Brevo free plan allows 300/day

const provider = () => {
  if (process.env.MAIL_CONSOLE === '1') return 'console';
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) return 'brevo';
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) return 'smtp';
  return null;
};

async function send({ to, subject, text, html }) {
  const p = provider();
  if (!p) return { ok: false, error: 'Email sending is not set up on the server yet (the administrator must add BREVO_API_KEY and MAIL_FROM).' };
  const day = new Date().toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.n = 0; }
  if (state.n >= PLATFORM_DAILY_CAP) return { ok: false, error: 'Daily email limit of the platform reached' };
  try {
    if (p === 'console') {
      console.log(`\n=== EMAIL to ${to} ===\nSubject: ${subject}\n${text}\n=== END EMAIL ===\n`);
    } else if (p === 'brevo') {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: process.env.MAIL_FROM_NAME || 'ShopWatch', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, error: `Brevo: ${j.message || r.status}` }; }
    } else {
      const nodemailer = require('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      await nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
        .sendMail({ from: `"${process.env.MAIL_FROM_NAME || 'ShopWatch'}" <${process.env.MAIL_FROM}>`, to, subject, text, html });
    }
    state.n++;
    return { ok: true, provider: p };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
module.exports = { send, provider };
