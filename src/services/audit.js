const store = require('../store');
const { uid } = require('../utils');

// Append-only log of everything that happens in a shop
function audit(sh, u, action, detail) {
  store.add(sh, 'audit', { id: uid(), ts: Date.now(), userId: u?.id, user: u?.name || 'system', role: u?.role, action, detail });
  if (sh.audit.length > 6000) sh.audit.splice(0, 1000).forEach(a => store.drop(sh, 'audit', a.id));
}
module.exports = { audit };
