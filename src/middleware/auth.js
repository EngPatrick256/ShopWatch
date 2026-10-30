const jwt = require('jsonwebtoken');
const store = require('../store');
const { err } = require('../utils');
const { can } = require('../permissions');

const sign = (u, sh) => jwt.sign({ id: u.id, shop: sh.id }, store.state.secret, { expiresIn: '14d' });

// Verifies the token and attaches req.user and req.sh (the user's own shop only)
function auth(req, res, next) {
  try {
    const { id, shop } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), store.state.secret);
    const sh = store.shops.get(shop), u = sh?.users.find(x => x.id === id && x.active);
    if (!u) return err(res, 401, 'Session expired');
    if (sh.meta.active === false) return err(res, 403, 'This shop account is suspended. Contact the administrator.');
    req.user = u; req.sh = sh; next();
  } catch { err(res, 401, 'Please log in'); }
}
const owner = (req, res, next) => (req.user.role === 'owner' ? next() : err(res, 403, 'Owner only'));

// requires one capability (see permissions.js)
const need = cap => (req, res, next) => (can(req.user, cap) ? next() : err(res, 403, 'Your role is not allowed to do this'));

// simple in-memory rate limiter
const hits = {};
function limited(key, max, ms) {
  const n = Date.now(), e = hits[key];
  if (!e || n - e.t > ms) { hits[key] = { n: 1, t: n }; return false; }
  return ++e.n > max;
}
const clearLimit = key => delete hits[key];

module.exports = { sign, auth, owner, need, limited, clearLimit };
