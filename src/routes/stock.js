// Receiving stock (restock), stock counts, stock history and the restock suggestions.
const express = require('express');
const store = require('../store');
const { auth, owner, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { audit } = require('../services/audit');
const inventory = require('../services/inventory');
const { uid, r2, tracked, err, stripCost: strip } = require('../utils');

const r = express.Router();

r.post('/stock/in', auth, need('receive_stock'), (req, res) => {
  const sh = req.sh, isOwner = can(req.user, 'set_costs'), b = req.body || {};
  const p = sh.products.find(x => x.id === b.productId && !x.archived), n = Number(b.qty);
  if (!p || !(n > 0)) return err(res, 400, 'Choose a product and a quantity above 0');
  if (!tracked(p)) return err(res, 400, 'This item does not track stock');
  // The owner can state what was paid per unit; for shopkeepers the product's current cost price is used (they never see it)
  const given = Number(b.unitCost);
  const unitCost = isOwner && given > 0 ? given : p.costPrice || 0;
  if (isOwner && given > 0) p.costPrice = given;
  const before = p.stock; p.stock = r2(p.stock + n); store.put(sh, 'products', p);
  store.add(sh, 'moves', {
    id: uid(), ts: Date.now(), type: 'in', kind: 'restock', productId: p.id, name: p.name, qty: n, before, after: p.stock,
    unitCost, totalCost: r2(n * unitCost), fromCapital: !(isOwner && b.fromCapital === 'no'), by: req.user.name, supplier: b.supplier || '', note: b.note || '',
  });
  audit(sh, req.user, 'stock_in', `Restocked ${n} ${p.unit} of ${p.name}${b.supplier ? ' from ' + b.supplier : ''} (cost ${r2(n * unitCost)})`);
  res.json(strip(p, req.user));
});

// Owner can correct the cost of an earlier purchase
r.patch('/stock/moves/:id', auth, owner, (req, res) => {
  const sh = req.sh, m = sh.moves.find(x => x.id === req.params.id && x.type === 'in'), c = Number(req.body.unitCost);
  if (!m || !(c >= 0)) return err(res, 400, 'Invalid purchase or cost');
  const old = m.totalCost; m.unitCost = c; m.totalCost = r2(m.qty * c); store.put(sh, 'moves', m);
  audit(sh, req.user, 'purchase_cost_fix', `${m.name}: purchase cost ${old} → ${m.totalCost}`); res.json(m);
});

r.post('/stock/count', auth, need('count_stock'), (req, res) => {
  const sh = req.sh, isOwner = can(req.user, 'see_stock_diff'), { productId, counted, reason } = req.body || {};
  const p = sh.products.find(x => x.id === productId && !x.archived), c = Number(counted);
  if (!p || counted === '' || counted == null || !(c >= 0)) return err(res, 400, 'Choose a product and enter the physical count');
  if (!tracked(p)) return err(res, 400, 'This item does not track stock');
  // Shopkeepers count "blind": they are never asked for a reason and never told whether the count matched.
  if (isOwner && c !== p.stock && !String(reason || '').trim()) return err(res, 400, 'Give a reason for the difference');
  const changed = p.stock !== c;
  inventory.applyCount(sh, req.user, p, c, String(reason || '').trim() || (changed ? 'No reason given' : 'Count matched'));
  res.json(isOwner ? strip(p, req.user) : { ok: true });
});
r.get('/stock/moves', auth, need('view_reports'), (req, res) => res.json([...req.sh.moves].reverse().slice(0, 400)));

// What to buy next, using the last 14 days of sales
r.get('/restock', auth, need('view_reports'), (req, res) => {
  const sh = req.sh, since = Date.now() - 14 * 864e5, v = {};
  for (const s of sh.sales) if (s.status === 'ok' && s.ts >= since) for (const i of s.items) v[i.productId] = (v[i.productId] || 0) + i.qty;
  const list = sh.products.filter(p => !p.archived && tracked(p)).map(p => {
    const avg = (v[p.id] || 0) / 14, daysLeft = avg > 0 ? Math.floor(p.stock / avg) : null;
    const target = Math.max(p.reorderLevel * 2, Math.ceil(avg * 14));
    const suggested = Math.max(0, Math.ceil(target - p.stock));
    return { id: p.id, name: p.name, unit: p.unit, stock: p.stock, reorderLevel: p.reorderLevel, costPrice: p.costPrice, avgPerDay: r2(avg), daysLeft, suggested, estCost: r2(suggested * p.costPrice) };
  }).filter(p => p.stock <= p.reorderLevel || (p.daysLeft !== null && p.daysLeft <= 7))
    .sort((a, b) => (b.stock === 0) - (a.stock === 0) || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  res.json(list);
});

module.exports = r;
