// Product catalogue. Creating a product with opening stock records the money spent buying it.
const express = require('express');
const store = require('../store');
const { auth, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { audit } = require('../services/audit');
const { uid, r2, tracked, err, stripCost: strip } = require('../utils');

const r = express.Router();

r.get('/products', auth, (req, res) => res.json(req.sh.products.filter(p => can(req.user, 'manage_products') || !p.archived).map(p => strip(p, req.user))));

r.post('/products', auth, need('manage_products'), (req, res) => {
  const b = req.body || {}, sh = req.sh;
  const price = Number(b.price), cost = Number(b.costPrice || 0), rl = Number(b.reorderLevel || 0);
  const track = b.tracksStock !== 'no' && b.tracksStock !== false;
  const stock = track ? Number(b.stock || 0) : 0;
  if (!b.name?.trim() || !(price >= 0) || !(cost >= 0) || !(stock >= 0) || !(rl >= 0)) return err(res, 400, 'Name and valid numbers are required');
  const p = { id: uid(), name: b.name.trim(), sku: (b.sku || '').trim(), category: (b.category || 'General').trim(), unit: (b.unit || 'pcs').trim(), costPrice: cost, price, stock, reorderLevel: track ? rl : 0, tracksStock: track, archived: false, created: Date.now() };
  store.add(sh, 'products', p);
  if (stock > 0) {
    store.add(sh, 'moves', {
      id: uid(), ts: Date.now(), type: 'in', kind: 'initial', productId: p.id, name: p.name, qty: stock, before: 0, after: stock,
      unitCost: cost, totalCost: r2(stock * cost), fromCapital: b.fromCapital !== 'no', by: req.user.name, note: 'Opening stock',
    });
  }
  audit(sh, req.user, 'product_add', `Added ${p.name} (stock ${track ? stock : 'not tracked'}, cost ${cost}, price ${price}${stock > 0 ? ', spent ' + r2(stock * cost) : ''})`);
  res.json(p);
});

r.put('/products/:id', auth, need('manage_products'), (req, res) => {
  const sh = req.sh, p = sh.products.find(x => x.id === req.params.id);
  if (!p) return err(res, 404, 'Not found');
  const b = req.body || {}, changes = [];
  for (const k of ['name', 'sku', 'category', 'unit']) if (b[k] !== undefined && b[k] !== p[k]) { changes.push(`${k}: ${p[k]} → ${b[k]}`); p[k] = String(b[k]).trim(); }
  for (const k of ['costPrice', 'price', 'reorderLevel']) if (b[k] !== undefined && b[k] !== '') {
    const v = Number(b[k]); if (!(v >= 0)) return err(res, 400, `Invalid ${k}`);
    if (v !== p[k]) { changes.push(`${k}: ${p[k]} → ${v}`); p[k] = v; }
  }
  if (b.tracksStock !== undefined) { const t = b.tracksStock !== 'no' && b.tracksStock !== false; if (t !== tracked(p)) { p.tracksStock = t; changes.push(t ? 'now tracks stock' : 'stops tracking stock'); } }
  if (b.archived !== undefined) { p.archived = !!b.archived; changes.push(p.archived ? 'archived' : 'restored'); }
  store.put(sh, 'products', p); audit(sh, req.user, 'product_edit', `${p.name}: ${changes.join(', ') || 'no change'}`);
  res.json(p);
});

module.exports = r;
