// Daily / period profit figures.
const { sum, r2, dk } = require('../utils');
const { okSales, saleProfit, paidNow, payMethod } = require('./sales');

function dayStats(sh, date) {
  const sales = okSales(sh).filter(s => s.date === date);
  const exp = sh.expenses.filter(e => e.date === date);
  const pays = sh.payments.filter(p => p.date === date);
  const total = sum(sales, s => s.total), gross = r2(sum(sales, saleProfit)), expenses = sum(exp, e => e.amount);
  return {
    date, count: sales.length, total, gross, expenses, net: r2(gross - expenses),
    discount: r2(sum(sales, s => s.discount || 0)),
    cash: r2(sum(sales.filter(s => payMethod(s) === 'cash'), paidNow) + sum(pays.filter(p => p.method !== 'momo'), p => p.amount)),
    momo: r2(sum(sales.filter(s => payMethod(s) === 'momo'), paidNow) + sum(pays.filter(p => p.method === 'momo'), p => p.amount)),
    unpaid: r2(sum(sales, s => s.total - paidNow(s))),
  };
}
const lastDays = (sh, n) => Array.from({ length: n }, (_, i) => dayStats(sh, dk(sh, Date.now() - (n - 1 - i) * 864e5)));

module.exports = { dayStats, lastDays };
