// Daily stock spot checks
const express = require('express');
const store = require('../store');
const checks = require('../services/checks');
const inventory = require('../services/inventory');
const { auth, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { tracked, today, err } = require('../utils');

const r = express.Router();
const view = (c, isOwner) => (isOwner ? c : { id: c.id, date: c.date, productId: c.productId, name: c.name, unit: c.unit, status: c.status });

r.get('/checks/today', auth, (req, res) => {
  if (!can(req.user, 'count_stock') && !can(req.user, 'view_reports')) return err(res, 403, 'Your role is not allowed to do this');
  const full = can(req.user, 'view_reports');
  res.json(checks.today(req.sh).map(c => view(c, full)));
});
r.get('/checks/history', auth, need('view_reports'), (req, res) => {
  const d = today(req.sh); // a check from an earlier day that was never done is "overdue"
  res.json([...req.sh.checks].sort((a, b) => b.ts - a.ts).slice(0, 150).map(c => ({ ...c, overdue: c.status === 'pending' && c.date < d })));
});

r.post('/checks/:id/submit', auth, need('count_stock'), (req, res) => {
  const sh = req.sh, c = sh.checks.find(x => x.id === req.params.id && x.date === today(sh) && x.status === 'pending');
  const counted = Number(req.body.counted);
  if (!c) return err(res, 404, 'This check is not available (already done or from another day)');
  if (req.body.counted === '' || req.body.counted == null || !(counted >= 0)) return err(res, 400, 'Enter the number you counted');
  const p = sh.products.find(x => x.id === c.productId && !x.archived);
  if (!p || !tracked(p)) return err(res, 400, 'This product can no longer be checked');
  const { before, diff } = inventory.applyCount(sh, req.user, p, counted, 'Daily spot check', 'spot');
  Object.assign(c, { status: 'done', countedQty: counted, systemQty: before, diff, doneAt: Date.now(), by: req.user.name });
  store.put(sh, 'checks', c);
  res.json({ ok: true }); // the shopkeeper is never told whether the count matched
});

module.exports = r;
