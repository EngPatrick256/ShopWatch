// Owner manages shopkeepers and shop settings
const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const { auth, owner } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { uid, pub, err, h, USERNAME_RE } = require('../utils');
const { ROLES, ASSIGNABLE, roleLabel } = require('../permissions');

const r = express.Router();

r.get('/users', auth, owner, (req, res) => {
  res.json(req.sh.users.map(u => ({ ...pub(u), roleLabel: roleLabel(u.role), lastSale: [...req.sh.sales].reverse().find(s => s.userId === u.id)?.ts })));
});

r.post('/users', auth, owner, h(async (req, res) => {
  const { name, username, password } = req.body || {};
  const role = req.body.role || 'shopkeeper';
  if (!ASSIGNABLE.includes(role)) return err(res, 400, 'Choose a valid role for this employee');
  const un = String(username || '').toLowerCase().trim();
  if (!name?.trim() || !password || password.length < 6) return err(res, 400, 'Fill all fields (password at least 6 characters)');
  if (!USERNAME_RE.test(un)) return err(res, 400, 'Username: 3-40 letters, numbers or . _ @ - (no spaces)');
  if (store.userIndex.has(un)) return err(res, 400, 'Username already taken. Try adding your shop name, e.g. sam.' + req.sh.meta.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10));
  const u = { id: uid(), name: name.trim(), username: un, hash: await bcrypt.hash(password, 10), role, active: true, created: Date.now() };
  store.add(req.sh, 'users', u); store.userIndex.set(un, req.sh.id);
  audit(req.sh, req.user, 'user_add', `Added ${roleLabel(role)} ${u.name}`); res.json({ ...pub(u), roleLabel: roleLabel(role) });
}));

r.patch('/users/:id', auth, owner, h(async (req, res) => {
  const sh = req.sh, u = sh.users.find(x => x.id === req.params.id);
  if (!u) return err(res, 404, 'Not found');
  if (u.role === 'owner' && req.body.active === false) return err(res, 400, 'Cannot deactivate the owner');
  if (req.body.role !== undefined) {
    if (u.role === 'owner' || !ASSIGNABLE.includes(req.body.role)) return err(res, 400, 'This role cannot be changed');
    if (u.role !== req.body.role) { audit(sh, req.user, 'user_role', `${u.name}: ${roleLabel(u.role)} → ${roleLabel(req.body.role)}`); u.role = req.body.role; }
  }
  if (typeof req.body.active === 'boolean') { u.active = req.body.active; audit(sh, req.user, 'user_status', `${u.name} ${u.active ? 'activated' : 'deactivated'}`); }
  if (req.body.password) {
    if (req.body.password.length < 6) return err(res, 400, 'Password too short');
    u.hash = await bcrypt.hash(req.body.password, 10); audit(sh, req.user, 'user_password', `Reset password for ${u.name}`);
  }
  store.put(sh, 'users', u); res.json(pub(u));
}));

r.get('/roles', auth, owner, (req, res) => res.json(ASSIGNABLE.map(k => ({ key: k, label: ROLES[k].label, desc: ROLES[k].desc }))));

r.post('/settings', auth, owner, (req, res) => {
  const b = req.body || {};
  if (b.shopName) req.sh.meta.name = String(b.shopName).trim().slice(0, 80);
  if (b.currency) req.sh.meta.currency = String(b.currency).trim().toUpperCase().slice(0, 6);
  store.putMeta(req.sh); audit(req.sh, req.user, 'settings', 'Updated shop settings'); res.json({ ok: true });
});

module.exports = r;
