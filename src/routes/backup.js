// Per-shop backup / restore
const express = require('express');
const store = require('../store');
const { auth, owner } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { shopInfo, today, err, h } = require('../utils');

const r = express.Router();

r.get('/backup', auth, owner, (req, res) => {
  const sh = req.sh, out = { version: 3, meta: shopInfo(sh) };
  store.COLLS.forEach(c => (out[c] = sh[c]));
  res.setHeader('Content-Disposition', `attachment; filename="shopwatch-backup-${today(sh)}.json"`);
  res.json(out);
});

r.post('/restore', auth, owner, h(async (req, res) => {
  const sh = req.sh, b = req.body;
  if (!b || !Array.isArray(b.users) || !Array.isArray(b.products) || !Array.isArray(b.sales)) return err(res, 400, 'This is not a valid ShopWatch backup file');
  for (const u of b.users) { const o = store.userIndex.get(u.username); if (o && o !== sh.id) return err(res, 400, `Username "${u.username}" in this backup is used by another shop.`); }
  await store.wipeShopData(sh);
  sh.users.forEach(u => store.userIndex.delete(u.username));
  for (const c of store.COLLS) { sh[c] = Array.isArray(b[c]) ? b[c].filter(x => x && x.id) : []; sh[c].forEach(o => store.put(sh, c, o)); }
  sh.users.forEach(u => store.userIndex.set(u.username, sh.id));
  audit(sh, null, 'restore', 'Data restored from backup');
  await store.flush(); res.json({ ok: true });
}));

module.exports = r;
