// Money spent buying stock: new products (opening stock) and restocking.
const { sum, r2, dk } = require('../utils');

const moveKind = m => m.kind || (m.note === 'Opening stock' ? 'initial' : 'restock');
// cost of one stock-in movement (older movements without a saved cost use the product's cost price)
function moveCost(sh, m) {
  if (typeof m.totalCost === 'number') return m.totalCost;
  const p = sh.products.find(x => x.id === m.productId);
  return r2(m.qty * (m.unitCost ?? p?.costPrice ?? 0));
}
const purchaseMoves = sh => sh.moves.filter(m => m.type === 'in');

function summary(sh, from, to) {
  const rows = new Map();
  const totals = { newCost: 0, restockCost: 0, total: 0, newQty: 0, restockQty: 0, restockCount: 0 };
  for (const m of purchaseMoves(sh)) {
    const d = dk(sh, m.ts);
    if ((from && d < from) || (to && d > to)) continue;
    const cost = moveCost(sh, m), kind = moveKind(m);
    const r = rows.get(m.productId) || { productId: m.productId, name: m.name, newQty: 0, newCost: 0, restockQty: 0, restockCost: 0, restockCount: 0, lastRestock: null };
    if (kind === 'initial') { r.newQty += m.qty; r.newCost += cost; totals.newQty += m.qty; totals.newCost += cost; }
    else { r.restockQty += m.qty; r.restockCost += cost; r.restockCount++; r.lastRestock = Math.max(r.lastRestock || 0, m.ts); totals.restockQty += m.qty; totals.restockCost += cost; totals.restockCount++; }
    rows.set(m.productId, r);
  }
  const list = [...rows.values()].map(r => ({ ...r, newCost: r2(r.newCost), restockCost: r2(r.restockCost), total: r2(r.newCost + r.restockCost) })).sort((a, b) => b.total - a.total);
  totals.newCost = r2(totals.newCost); totals.restockCost = r2(totals.restockCost); totals.total = r2(totals.newCost + totals.restockCost);
  return { totals, products: list };
}
// stock bought with the shop's money (reduces capital)
const spentFromCapital = sh => r2(sum(purchaseMoves(sh).filter(m => m.fromCapital !== false), m => moveCost(sh, m)));

module.exports = { moveKind, moveCost, summary, spentFromCapital };
