// Customer balances (part payments) and recording later instalments.
const express = require('express');
const store = require('../store');
const { auth, need } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { balances, okSales, momoRefUsed } = require('../services/sales');
const { uid, r2, today, err } = require('../utils');

const r = express.Router();

r.get('/debts', auth, need('view_sales'), (req, res) => {
  const sh = req.sh, bal = balances(sh);
  res.json(okSales(sh).map(s => ({ s, b: bal.get(s.id) })).filter(x => x.b.balance > 0).map(({ s, b }) => ({
    id: s.id, ts: s.ts, customer: s.customer, customerPhone: s.customerPhone, total: s.total, paid: b.paid, balance: b.balance,
    by: s.userName, items: s.items.map(i => `${i.qty}× ${i.name}`).join(', '),
  })).sort((a, b) => a.ts - b.ts));
});

r.post('/sales/:id/pay', auth, need('take_payments'), (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id && x.status === 'ok');
  const amount = Number(req.body.amount), method = req.body.method === 'momo' ? 'momo' : 'cash', ref = String(req.body.momoRef || '').trim();
  if (!s) return err(res, 404, 'Sale not found');
  const bal = balances(sh).get(s.id).balance;
  if (!(bal > 0)) return err(res, 400, 'This sale is already fully paid');
  if (!(amount > 0) || amount > bal + 0.001) return err(res, 400, `Amount must be between 1 and ${bal}`);
  if (method === 'momo') {
    if (ref.length < 4) return err(res, 400, 'Enter the MTN MoMo transaction ID');
    if (momoRefUsed(sh, ref)) return err(res, 400, 'This MoMo transaction ID has already been recorded');
  }
  store.add(sh, 'payments', { id: uid(), saleId: s.id, ts: Date.now(), date: today(sh), amount, method, momoRef: method === 'momo' ? ref : '', by: req.user.name, customer: s.customer });
  audit(sh, req.user, 'debt_payment', `${s.customer} paid ${amount} (${method === 'momo' ? 'MTN MoMo' : 'cash'}), balance now ${r2(bal - amount)}`);
  res.json({ ok: true, balance: r2(bal - amount) });
});

module.exports = r;
