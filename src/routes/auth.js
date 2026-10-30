// Sign-up, login and own-account routes
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const store = require('../store');
const { sign, auth, limited, clearLimit } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { uid, pub, shopInfo, err, h, USERNAME_RE } = require('../utils');
const { capsOf, roleLabel } = require('../permissions');

const r = express.Router();

r.get('/status', (req, res) => res.json({ codeRequired: !!config.SIGNUP_CODE, defaultTz: config.DEFAULT_TZ }));

r.post('/signup', h(async (req, res) => {
  if (limited('signup|' + req.ip, 6, 3600e3)) return err(res, 429, 'Too many sign-ups from this connection. Try later.');
  const { shopName, name, username, password, currency, tz, code } = req.body || {};
  if (config.SIGNUP_CODE && code !== config.SIGNUP_CODE) return err(res, 403, 'Wrong sign-up code');
  const un = String(username || '').toLowerCase().trim();
  if (!shopName?.trim() || !name?.trim()) return err(res, 400, 'Shop name and your name are required');
  if (!USERNAME_RE.test(un)) return err(res, 400, 'Username: 3-40 letters, numbers or . _ @ - (no spaces)');
  if (!password || password.length < 6) return err(res, 400, 'Password must be at least 6 characters');
  if (store.userIndex.has(un)) return err(res, 400, 'That username is taken. Try another one.');
  const tzn = Number(tz ?? config.DEFAULT_TZ);
  const sh = store.newShop(uid());
  sh.meta = {
    id: 'meta', name: shopName.trim().slice(0, 80), currency: String(currency || 'UGX').trim().toUpperCase().slice(0, 6) || 'UGX',
    tz: tzn >= -12 && tzn <= 14 ? tzn : config.DEFAULT_TZ, created: Date.now(), active: true,
  };
  const u = { id: uid(), name: name.trim().slice(0, 80), username: un, hash: await bcrypt.hash(password, 10), role: 'owner', active: true, created: Date.now() };
  store.shops.set(sh.id, sh); store.userIndex.set(un, sh.id);
  store.putMeta(sh); store.add(sh, 'users', u); audit(sh, u, 'setup', 'Shop created');
  res.json({ token: sign(u, sh), user: pub(u) });
}));

r.post('/login', h(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const un = String(username).toLowerCase().trim(), key = 'login|' + req.ip + '|' + un;
  if (limited(key, 8, 15 * 60e3)) return err(res, 429, 'Too many attempts. Try again in 15 minutes.');
  const sh = store.shops.get(store.userIndex.get(un)), u = sh?.users.find(x => x.username === un);
  if (!u || !u.active || !(await bcrypt.compare(String(password), u.hash))) {
    if (sh) audit(sh, null, 'login_failed', `Failed login for "${un}"`);
    return err(res, 400, 'Wrong username or password');
  }
  if (sh.meta.active === false) return err(res, 403, 'This shop account is suspended. Contact the administrator.');
  clearLimit(key);
  u.lastLogin = Date.now(); store.put(sh, 'users', u); audit(sh, u, 'login', 'Logged in');
  res.json({ token: sign(u, sh), user: pub(u) });
}));

r.get('/me', auth, (req, res) => res.json({ user: pub(req.user), roleLabel: roleLabel(req.user.role), caps: capsOf(req.user), ...shopInfo(req.sh) }));

r.post('/me/password', auth, h(async (req, res) => {
  const { current, password } = req.body || {};
  if (!(await bcrypt.compare(String(current || ''), req.user.hash))) return err(res, 400, 'Current password is wrong');
  if (!password || password.length < 6) return err(res, 400, 'New password must be at least 6 characters');
  req.user.hash = await bcrypt.hash(password, 10); store.put(req.sh, 'users', req.user);
  audit(req.sh, req.user, 'password_change', 'Changed own password'); res.json({ ok: true });
}));

module.exports = r;
