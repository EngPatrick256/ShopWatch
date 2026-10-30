const express = require('express');
const store = require('../store');
const { auth, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { audit } = require('../services/audit');
const { uid, today, err } = require('../utils');

const r = express.Router();

r.post('/expenses', auth, need('record_expense'), (req, res) => {
  const sh = req.sh, { category, amount, note } = req.body || {}, a = Number(amount);
  if (!(a > 0)) return err(res, 400, 'Enter an amount above 0');
  if (!String(note || '').trim()) return err(res, 400, 'Describe what the money was spent on');
  const e = store.add(sh, 'expenses', { id: uid(), ts: Date.now(), date: today(sh), category: category || 'Other', amount: a, note: note.trim(), by: req.user.name, userId: req.user.id });
  audit(sh, req.user, 'expense', `Expense ${a} (${e.category}): ${e.note}`); res.json(e);
});

r.get('/expenses', auth, need('view_expenses'), (req, res) => {
  const sh = req.sh;
  let { from, to } = req.query;
  if (!can(req.user, 'view_all_sales')) from = to = today(sh);
  from = from || today(sh); to = to || today(sh);
  res.json(sh.expenses.filter(e => e.date >= from && e.date <= to).sort((a, b) => b.ts - a.ts));
});

module.exports = r;
