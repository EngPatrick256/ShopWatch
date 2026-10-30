// Applying a physical stock count (used by manual counts and daily spot checks)
const store = require('../store');
const { audit } = require('./audit');
const alerts = require('./alerts');
const { uid, r2 } = require('../utils');

function applyCount(sh, user, p, counted, note, kind = 'count') {
  const before = p.stock, diff = r2(counted - before);
  p.stock = counted; store.put(sh, 'products', p);
  store.add(sh, 'moves', { id: uid(), ts: Date.now(), type: 'count', kind, productId: p.id, name: p.name, qty: diff, before, after: counted, by: user.name, note, valueLost: diff < 0 ? r2(-diff * p.costPrice) : 0 });
  audit(sh, user, kind === 'spot' ? 'spot_check' : 'stock_count', `${p.name}: system ${before}, counted ${counted} (${diff >= 0 ? '+' : ''}${diff})${note ? ' - ' + note : ''}`);
  if (diff < 0) alerts.notify(sh, 'stock_shortage', `Stock shortage: ${p.name} is short by ${-diff}`, [`${user.name} counted ${counted} ${p.unit} of ${p.name} but the system expected ${before}.`, `Missing: ${-diff} ${p.unit}, worth ${r2(-diff * p.costPrice)} at cost.`, kind === 'spot' ? 'This was a daily spot check.' : 'This was a manual stock count.']);
  return { before, diff };
}
module.exports = { applyCount };
