// Sale maths: what was paid, what is still owed, profit.
const { sum, r2 } = require('../utils');

// amount the customer paid at the moment of sale (older sales: full total unless they were credit)
const paidNow = s => (typeof s.paidNow === 'number' ? s.paidNow : s.payment === 'credit' ? 0 : s.total);
// method used for the money paid at sale time (older "credit" sales: later payments default to cash)
const payMethod = s => (s.payment === 'momo' ? 'momo' : 'cash');
const okSales = sh => sh.sales.filter(s => s.status === 'ok');
const saleProfit = s => sum(s.items, i => (i.price - i.cost) * i.qty);

// Map saleId -> { paid, balance } for all valid sales (includes later instalments)
function balances(sh) {
  const later = {};
  for (const p of sh.payments) later[p.saleId] = (later[p.saleId] || 0) + p.amount;
  const m = new Map();
  for (const s of sh.sales) {
    const paid = r2(paidNow(s) + (later[s.id] || 0));
    m.set(s.id, { paid, balance: r2(s.total - paid) });
  }
  return m;
}
// MoMo transaction IDs may be used only once (stops one real payment being recorded twice)
const momoRefUsed = (sh, ref) => {
  const x = ref.toLowerCase();
  return sh.sales.some(s => s.status === 'ok' && (s.momoRef || '').toLowerCase() === x) || sh.payments.some(p => (p.momoRef || '').toLowerCase() === x);
};
const outstanding = sh => {
  const b = balances(sh);
  return r2(sum(okSales(sh), s => Math.max(0, b.get(s.id).balance)));
};

module.exports = { paidNow, payMethod, okSales, saleProfit, balances, outstanding, momoRefUsed };
