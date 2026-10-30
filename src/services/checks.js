// Daily surprise stock checks: a few random products the shopkeeper must count each day, without seeing the system number.
const crypto = require('crypto');
const store = require('../store');
const { uid, tracked, today, dk } = require('../utils');

function today_(sh) {
  const d = today(sh), n = Number((sh.meta.alerts || {}).spotChecks ?? 3);
  const existing = sh.checks.filter(c => c.date === d);
  if (existing.length || !(n > 0)) return existing;
  const recent = new Set(sh.checks.filter(c => c.date >= dk(sh, Date.now() - 3 * 864e5)).map(c => c.productId));
  let pool = sh.products.filter(p => !p.archived && tracked(p) && p.stock > 0);
  const fresh = pool.filter(p => !recent.has(p.id));
  if (fresh.length >= n) pool = fresh;
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n).map(p => store.add(sh, 'checks', { id: uid(), ts: Date.now(), date: d, productId: p.id, name: p.name, unit: p.unit, status: 'pending' }));
}
module.exports = { today: today_ };
