// Owner's capital ledger: money put into the business or taken out of it.
const express = require('express');
const store = require('../store');
const { auth, owner, need } = require('../middleware/auth');
const { audit } = require('../services/audit');
const capital = require('../services/capital');
const { uid, today, err } = require('../utils');

const r = express.Router();

r.get('/capital', auth, need('view_finance'), (req, res) => res.json({ summary: capital.summary(req.sh), entries: [...req.sh.capital].reverse().slice(0, 200) }));

r.post('/capital', auth, owner, (req, res) => {
  const sh = req.sh, { type, amount, note } = req.body || {}, a = Number(amount);
  if (!['in', 'out'].includes(type)) return err(res, 400, 'Choose add capital or withdraw');
  if (!(a > 0)) return err(res, 400, 'Enter an amount above 0');
  const e = store.add(sh, 'capital', { id: uid(), ts: Date.now(), date: today(sh), type, amount: a, note: String(note || '').trim(), by: req.user.name });
  audit(sh, req.user, type === 'in' ? 'capital_in' : 'capital_out', `${type === 'in' ? 'Added capital' : 'Withdrew'} ${a}${e.note ? ': ' + e.note : ''}`);
  res.json(e);
});

module.exports = r;
