// Money spent on buying stock: each new product and each restock, with totals.
const express = require('express');
const { auth, need } = require('../middleware/auth');
const purchases = require('../services/purchases');
const { dk, r2 } = require('../utils');

const r = express.Router();

r.get('/purchases', auth, need('view_reports'), (req, res) => {
  const sh = req.sh, { from, to } = req.query;
  const inRange = m => { const d = dk(sh, m.ts); return !(from && d < from) && !(to && d > to); };
  const moves = sh.moves.filter(m => m.type === 'in' && inRange(m)).sort((a, b) => b.ts - a.ts).slice(0, 300)
    .map(m => ({ id: m.id, ts: m.ts, name: m.name, qty: m.qty, unitCost: m.unitCost ?? r2(purchases.moveCost(sh, m) / m.qty), cost: purchases.moveCost(sh, m), kind: purchases.moveKind(m), by: m.by, supplier: m.supplier || '', fromCapital: m.fromCapital !== false }));
  res.json({ ...purchases.summary(sh, from, to), moves });
});

module.exports = r;
