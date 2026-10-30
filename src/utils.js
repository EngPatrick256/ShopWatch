// Small shared helpers
const crypto = require('crypto');
const { can } = require('./permissions');

const uid = () => crypto.randomBytes(9).toString('base64url');
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const tracked = p => p.tracksStock !== false;

// Dates are computed in the shop's own time zone (shop.meta.tz = hours from UTC)
const dk = (sh, ts) => new Date(ts + sh.meta.tz * 3600e3).toISOString().slice(0, 10);
const today = sh => dk(sh, Date.now());
const hourNow = sh => new Date(Date.now() + sh.meta.tz * 3600e3).getUTCHours();

const pub = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, lastLogin: u.lastLogin });
const shopInfo = sh => ({ shopName: sh.meta.name, currency: sh.meta.currency, tz: sh.meta.tz });
// shopkeepers never see cost prices
const stripCost = (p, user) => { if (can(user, 'view_costs')) return p; const { costPrice, ...rest } = p; return rest; };
const err = (res, code, msg) => res.status(code).json({ error: msg });
// lets express handle errors thrown inside async handlers
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const USERNAME_RE = /^[a-z0-9._@-]{3,40}$/;

module.exports = { stripCost, uid, sum, r2, tracked, dk, today, hourNow, pub, shopInfo, err, h, USERNAME_RE };
