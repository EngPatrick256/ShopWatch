// Till reconciliation: what SHOULD be in the cash drawer since the last close.
const { sum, r2 } = require('../utils');
const { okSales, paidNow, payMethod } = require('./sales');

function cashSummary(sh) {
  const last = [...sh.closings].sort((a, b) => b.ts - a.ts)[0], since = last ? last.ts : 0;
  const sales = okSales(sh).filter(s => s.ts > since);
  const pays = sh.payments.filter(p => p.ts > since), exp = sh.expenses.filter(e => e.ts > since);
  const opening = last ? last.floatLeft : 0;
  const cashSales = sum(sales.filter(s => payMethod(s) === 'cash'), paidNow);
  const debtCash = sum(pays.filter(p => p.method !== 'momo'), p => p.amount);
  const expenses = sum(exp, e => e.amount);
  return {
    since, sinceDate: last ? new Date(last.ts).toISOString() : null, opening, cashSales, debtCash, expenses,
    expectedCash: r2(opening + cashSales + debtCash - expenses),
    expectedMomo: r2(sum(sales.filter(s => payMethod(s) === 'momo'), paidNow) + sum(pays.filter(p => p.method === 'momo'), p => p.amount)),
    creditGiven: r2(sum(sales, s => s.total - paidNow(s))), salesCount: sales.length,
  };
}
module.exports = { cashSummary };
