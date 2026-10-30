// Owner: email alerts, evening summary, opening hours and daily stock checks
import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast } from '../core/dom.js';
import { esc } from '../core/format.js';

const HELP = {
  below_cost: 'An item is sold for less than you paid for it',
  big_discount: 'A sale has a bargain discount of at least the percentage below',
  void_request: 'The shopkeeper asks to cancel a sale',
  cash_short: 'Cash or MoMo is short when the till is closed',
  stock_shortage: 'A stock count or spot check finds items missing',
  after_hours: 'A shopkeeper records a sale outside your opening hours',
  handover_mismatch: 'The cash you received differs from what he says he handed over',
  daily_summary: 'A summary of the day is emailed to you each evening',
};
const hours = (sel, extra = '') => `${extra}${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${sel === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}`;

registerPage('alerts', async () => {
  const { settings: s, types, mailConfigured } = await api('/alerts-settings');
  setMain(`<h2>Alerts & email</h2>
  ${mailConfigured ? '' : '<div class="alert bad">🚨 Email sending is not set up on the server yet, so no emails can go out. The administrator must add BREVO_API_KEY and MAIL_FROM (see the README). You can still save your settings now.</div>'}
  <form id="alf" class="card"><h3>Where to send alerts</h3>
    <label>Your email address<input name="email" type="email" value="${esc(s.email)}" placeholder="owner@example.com"></label>
    <p class="hint" style="margin-top:-4px">Leave empty to switch all email alerts off. Each shop can receive at most 25 emails a day.</p>
    <h3 style="margin-top:18px">Email me when…</h3>
    <div class="switches">${Object.keys(types).map(k => `<label class="switch"><input type="checkbox" name="on_${k}" ${s.on[k] ? 'checked' : ''}><span>${esc(types[k])}<br><small class="muted" style="font-weight:500">${esc(HELP[k] || '')}</small></span></label>`).join('')}</div>
    <h3 style="margin-top:18px">Limits and times</h3>
    <div class="grid g3" style="margin:0">
      <label>Big discount means at least (% off list price)<input name="discountPct" type="number" min="1" max="100" value="${s.discountPct}"></label>
      <label>Shop opens at<select name="openHour">${hours(s.openHour)}</select></label>
      <label>Shop closes at<select name="closeHour">${Array.from({ length: 24 }, (_, i) => i + 1).map(h => `<option value="${h}" ${s.closeHour === h ? 'selected' : ''}>${h === 24 ? '24:00 (midnight)' : String(h).padStart(2, '0') + ':00'}</option>`).join('')}</select></label>
      <label>Evening summary time<select name="summaryHour">${hours(s.summaryHour, `<option value="-1" ${s.summaryHour === -1 ? 'selected' : ''}>Off</option>`)}</select></label>
      <label>Random stock checks per day<input name="spotChecks" type="number" min="0" max="10" value="${s.spotChecks}"><span class="hint">0 switches daily checks off</span></label>
    </div>
    <div class="row" style="margin-top:8px"><button class="btn green">💾 Save settings</button><button type="button" class="btn blue" data-act="testMail">✉️ Send test email</button><button type="button" class="btn orange" data-act="sendSummary">📊 Email today's summary now</button></div>
  </form>
  <div class="card"><h3>Good to know</h3><p class="muted">Emails are listed in the <b>Audit trail</b> as "email_alert" (sent) or "email_failed" (with the reason). The summary is sent after the time you choose; on a free host that sleeps it is sent as soon as the app wakes up that day.</p></div>`);
  $('#alf').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), on = {};
    for (const k of Object.keys(types)) on[k] = f['on_' + k] === 'on';
    try { await api('/alerts-settings', 'POST', { email: f.email, on, discountPct: f.discountPct, openHour: f.openHour, closeHour: f.closeHour, summaryHour: f.summaryHour, spotChecks: f.spotChecks }); toast('Settings saved', 's'); }
    catch (err) { toast(err.message, true); }
  };
});

registerActions({
  testMail: async () => { await api('/alerts-test', 'POST', {}); toast('Test email sent. Check your inbox (and spam folder)', 's'); },
  sendSummary: async () => { await api('/alerts-summary-now', 'POST', {}); toast('Summary is on its way to your email', 's'); },
});
