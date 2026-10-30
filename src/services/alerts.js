// Owner alerts by email + the evening summary.
const mailer = require('./mailer');
const store = require('../store');
const { audit } = require('./audit');
const { dayStats } = require('./stats');
const { cashSummary } = require('./cash');
const { outstanding } = require('./sales');
const checks = require('./checks');
const { sum, r2, tracked, today, hourNow, dk } = require('../utils');

const TYPES = {
  below_cost: 'Item sold below cost price', big_discount: 'Big discount given', void_request: 'Void requested by shopkeeper',
  cash_short: 'Cash or MoMo short at till close', stock_shortage: 'Stock shortage found in a count', after_hours: 'Sale recorded outside opening hours',
  handover_mismatch: 'Cash handed over does not match what you received', daily_summary: 'Evening summary email',
};
const DEFAULTS = {
  email: '', discountPct: 20, openHour: 6, closeHour: 22, summaryHour: 20, spotChecks: 3, appUrl: '',
  on: { below_cost: true, big_discount: true, void_request: true, cash_short: true, stock_shortage: true, after_hours: true, handover_mismatch: true, daily_summary: true },
};
const settings = sh => ({ ...DEFAULTS, ...(sh.meta.alerts || {}), on: { ...DEFAULTS.on, ...(sh.meta.alerts?.on || {}) } });

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function layout(sh, title, lines, appUrl, accent = '#7c3aed') {
  const items = lines.map(l => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#1e1b3a">${esc(l)}</p>`).join('');
  const btn = appUrl ? `<p style="margin:18px 0 0"><a href="${esc(appUrl)}" style="background:${accent};color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;display:inline-block">Open ShopWatch</a></p>` : '';
  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#f5f3ff;padding:20px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e8f6"><div style="background:linear-gradient(110deg,#4338ca,#7c3aed,#db2777);color:#fff;padding:16px 20px"><div style="font-size:13px;opacity:.9">${esc(sh.meta.name)}</div><div style="font-size:19px;font-weight:700">${esc(title)}</div></div><div style="padding:20px">${items}${btn}</div></div></div>`;
}

// Sends an alert (never throws, never blocks the request). Each shop may send at most 25 emails a day.
function notify(sh, type, subject, lines) {
  const a = settings(sh);
  if (!a.email || !a.on[type]) return;
  const day = today(sh), m = (sh._mail = sh._mail && sh._mail.day === day ? sh._mail : { day, n: 0 });
  if (m.n >= 25) return;
  m.n++;
  const text = lines.join('\n') + (a.appUrl ? `\n\nOpen ShopWatch: ${a.appUrl}` : '');
  const bad = ['below_cost', 'cash_short', 'stock_shortage', 'handover_mismatch'].includes(type);
  mailer.send({ to: a.email, subject: `[${sh.meta.name}] ${subject}`, text, html: layout(sh, subject, lines, a.appUrl, bad ? '#dc2626' : '#7c3aed') })
    .then(r => audit(sh, null, r.ok ? 'email_alert' : 'email_failed', r.ok ? `Emailed ${a.email}: ${subject}` : `Could not email "${subject}": ${r.error}`))
    .catch(() => {});
}

// ---------- evening summary ----------
function summaryLines(sh) {
  const d = today(sh), t = dayStats(sh, d), c = cashSummary(sh), cur = sh.meta.currency, f = n => `${cur} ${Math.round(n || 0).toLocaleString('en-US')}`;
  const voidsToday = sh.sales.filter(s => s.status === 'void' && s.voidTs && dk(sh, s.voidTs) === d).length;
  const pendingVoids = sh.sales.filter(s => s.status === 'ok' && s.voidRequest?.status === 'pending').length;
  const low = sh.products.filter(p => !p.archived && tracked(p) && p.stock <= p.reorderLevel).length;
  const chk = checks.today(sh), done = chk.filter(x => x.status === 'done').length;
  const pendingHand = sh.closings.filter(x => x.handedOver > 0 && (!x.handover || x.handover.status === 'pending')).length;
  const lines = [
    `Summary for ${d}`,
    `Sales: ${f(t.total)} from ${t.count} sale(s).`,
    `Net profit: ${f(t.net)} (gross profit ${f(t.gross)} minus expenses ${f(t.expenses)}).`,
    `Money received: cash ${f(t.cash)}, MTN MoMo ${f(t.momo)}. Left unpaid by customers today: ${f(t.unpaid)}.`,
    `Cash that should be in the till since the last close: ${f(c.expectedCash)}.`,
    `Bargain discounts given today: ${f(t.discount)}.`,
    `Voided sales today: ${voidsToday}${pendingVoids ? `, void requests waiting for you: ${pendingVoids}` : ''}.`,
    `Customers owe you in total: ${f(outstanding(sh))}.`,
    `Products at or below reorder level: ${low}.`,
  ];
  if (chk.length) lines.push(`Daily stock checks done: ${done} of ${chk.length}.`);
  if (pendingHand) lines.push(`Cash handovers waiting for your confirmation: ${pendingHand}.`);
  if (!t.count) lines.push('No sales were recorded today.');
  return lines;
}
const sendSummary = sh => notify(sh, 'daily_summary', `Evening summary ${today(sh)}`, summaryLines(sh));

function tick() {
  for (const sh of store.shops.values()) {
    const a = settings(sh);
    if (sh.meta.active === false || !a.email || !a.on.daily_summary || a.summaryHour < 0) continue;
    if (hourNow(sh) >= a.summaryHour && sh.meta.lastSummary !== today(sh)) {
      sh.meta.lastSummary = today(sh); store.putMeta(sh); sendSummary(sh);
    }
  }
}
// checks every minute (a sleeping free host sends it as soon as it wakes later the same day)
const startScheduler = () => setInterval(() => { try { tick(); } catch (e) { console.error('summary error', e.message); } }, 60000).unref();

module.exports = { TYPES, DEFAULTS, settings, notify, summaryLines, sendSummary, startScheduler };
