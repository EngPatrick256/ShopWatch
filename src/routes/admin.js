// Platform administrator (you): see all shops, suspend / reactivate
const express = require('express');
const config = require('../config');
const store = require('../store');
const { err } = require('../utils');

const r = express.Router();
const adminAuth = (req, res, next) => (config.ADMIN_KEY && req.headers['x-admin-key'] === config.ADMIN_KEY ? next() : err(res, 403, 'Admin key required'));

r.get('/admin/shops', adminAuth, (req, res) => {
  res.json([...store.shops.values()].map(sh => {
    const ow = sh.users.find(u => u.role === 'owner');
    return { id: sh.id, name: sh.meta.name, active: sh.meta.active !== false, created: sh.meta.created, owner: ow?.name, username: ow?.username, users: sh.users.length, products: sh.products.length, sales: sh.sales.length, lastSale: sh.sales.length ? sh.sales[sh.sales.length - 1].ts : null };
  }).sort((a, b) => b.created - a.created));
});
r.post('/admin/shops/:id', adminAuth, (req, res) => {
  const sh = store.shops.get(req.params.id);
  if (!sh) return err(res, 404, 'Not found');
  sh.meta.active = !!req.body.active; store.putMeta(sh); res.json({ ok: true });
});

module.exports = r;
