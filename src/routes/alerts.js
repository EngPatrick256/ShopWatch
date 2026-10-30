// Owner's email alert settings
const express = require('express');
const store = require('../store');
const mailer = require('../services/mailer');
const alerts = require('../services/alerts');
const { auth, owner } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { err, h } = require('../utils');

const r = express.Router();
const origin = req => process.env.APP_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`;
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };

r.get('/alerts-settings', auth, owner, (req, res) => res.json({ settings: alerts.settings(req.sh), types: alerts.TYPES, mailConfigured: !!mailer.provider(), provider: mailer.provider() }));

r.post('/alerts-settings', auth, owner, (req, res) => {
  const b = req.body || {}, cur = alerts.settings(req.sh), email = String(b.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err(res, 400, 'Enter a valid email address');
  const on = {}; for (const k of Object.keys(alerts.TYPES)) on[k] = !!(b.on || {})[k];
  req.sh.meta.alerts = {
    email, on, appUrl: origin(req),
    discountPct: int(b.discountPct, 1, 100, cur.discountPct), openHour: int(b.openHour, 0, 23, cur.openHour), closeHour: int(b.closeHour, 1, 24, cur.closeHour),
    summaryHour: int(b.summaryHour, -1, 23, cur.summaryHour), spotChecks: int(b.spotChecks, 0, 10, cur.spotChecks),
  };
  store.putMeta(req.sh); audit(req.sh, req.user, 'alert_settings', email ? `Alerts go to ${email}` : 'Email alerts switched off');
  res.json({ ok: true });
});

r.post('/alerts-test', auth, owner, h(async (req, res) => {
  const a = alerts.settings(req.sh);
  if (!a.email) return err(res, 400, 'Save your email address first');
  const out = await mailer.send({ to: a.email, subject: `[${req.sh.meta.name}] Test alert`, text: 'This is a test alert from ShopWatch. If you can read this, email alerts are working.', html: '<p style="font-family:Arial">This is a test alert from <b>ShopWatch</b>. If you can read this, email alerts are working ✅</p>' });
  if (!out.ok) return err(res, 400, out.error);
  res.json({ ok: true });
}));

r.post('/alerts-summary-now', auth, owner, (req, res) => {
  if (!alerts.settings(req.sh).email) return err(res, 400, 'Save your email address first');
  alerts.sendSummary(req.sh); res.json({ ok: true });
});

module.exports = r;
