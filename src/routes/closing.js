// End-of-day till closing. The shopkeeper counts blind (expected amounts are shown only to the owner).
const express = require('express');
const store = require('../store');
const { auth, owner, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { audit } = require('../services/audit');
const { cashSummary } = require('../services/cash');
const alerts = require('../services/alerts');
const { uid, r2, today, err } = require('../utils');

const r = express.Router();

r.get('/closing/today', auth, need('view_closings'), (req, res) => {
  const c = cashSummary(req.sh);
  res.json(can(req.user, 'view_reports') ? c : { since: c.since, sinceDate: c.sinceDate, salesCount: c.salesCount });
});

r.post('/closing', auth, need('close_till'), (req, res) => {
  const sh = req.sh, { countedCash, handedOver = 0, momoCounted, note } = req.body || {};
  const cc = Number(countedCash), ho = Number(handedOver || 0);
  if (countedCash === '' || countedCash == null || !(cc >= 0)) return err(res, 400, 'Enter the cash you counted');
  if (!(ho >= 0) || ho > cc) return err(res, 400, 'Cash handed over cannot be more than cash counted');
  const c = cashSummary(sh), mc = momoCounted === '' || momoCounted == null ? null : Number(momoCounted);
  const rec = store.add(sh, 'closings', {
    id: uid(), ts: Date.now(), date: today(sh), userId: req.user.id, userName: req.user.name, periodFrom: c.since,
    opening: c.opening, cashSales: c.cashSales, debtCash: c.debtCash, expenses: c.expenses, expectedCash: c.expectedCash,
    countedCash: cc, variance: r2(cc - c.expectedCash), handedOver: ho, floatLeft: r2(cc - ho),
    expectedMomo: c.expectedMomo, momoCounted: mc, momoVariance: mc == null ? null : r2(mc - c.expectedMomo), note: note || '',
  });
  if (ho > 0) { rec.handover = { status: 'pending' }; store.put(sh, 'closings', rec); }
  audit(sh, req.user, 'closing', `Closed till: counted ${cc}, variance ${rec.variance}${ho > 0 ? ', handed over ' + ho : ''}`);
  if (rec.variance < 0 || (rec.momoVariance != null && rec.momoVariance < 0)) {
    alerts.notify(sh, 'cash_short', `Till is short at close (${req.user.name})`, [
      `${req.user.name} closed the till. Expected cash ${c.expectedCash}, counted ${cc}: variance ${rec.variance}.`,
      ...(rec.momoVariance != null && rec.momoVariance < 0 ? [`MTN MoMo expected ${c.expectedMomo}, shopkeeper reports ${mc}: variance ${rec.momoVariance}.`] : []),
      ...(ho > 0 ? [`Cash the shopkeeper says was handed to you: ${ho}. Please confirm what you received in the app.`] : [])]);
  }
  res.json(can(req.user, 'view_reports') ? rec : { id: rec.id, variance: rec.variance, momoVariance: rec.momoVariance });
});

r.get('/closings', auth, need('view_closings'), (req, res) => {
  const list = [...req.sh.closings].sort((a, b) => b.ts - a.ts).slice(0, 60);
  res.json(can(req.user, 'view_reports') ? list : list.slice(0, 10).map(c => ({ id: c.id, ts: c.ts, userName: c.userName, countedCash: c.countedCash, handedOver: c.handedOver, handover: c.handover ? { status: c.handover.status } : null })));
});

// The owner confirms how much cash he actually received from the shopkeeper
r.post('/closings/:id/confirm', auth, owner, (req, res) => {
  const sh = req.sh, c = sh.closings.find(x => x.id === req.params.id), got = Number(req.body.received);
  if (!c || !(c.handedOver > 0)) return err(res, 404, 'No cash handover to confirm');
  if (c.handover && c.handover.status !== 'pending') return err(res, 400, 'Already confirmed');
  if (req.body.received === '' || req.body.received == null || !(got >= 0)) return err(res, 400, 'Enter the amount you received');
  const match = Math.abs(got - c.handedOver) < 0.005;
  c.handover = { status: match ? 'confirmed' : 'mismatch', received: got, ts: Date.now(), by: req.user.name }; store.put(sh, 'closings', c);
  audit(sh, req.user, match ? 'handover_confirmed' : 'handover_mismatch', `${c.userName} said handed over ${c.handedOver}, owner received ${got}`);
  if (!match) alerts.notify(sh, 'handover_mismatch', `Cash handover mismatch: ${r2(c.handedOver - got)} difference`, [`${c.userName} reported handing over ${c.handedOver}, but you confirmed receiving ${got}.`, `Difference: ${r2(c.handedOver - got)}.`]);
  res.json({ ok: true, status: c.handover.status });
});

module.exports = r;
