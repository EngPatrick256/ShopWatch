// Cash capital: money put in, money collected from customers, minus what was spent.
const { sum, r2, tracked } = require('../utils');
const { okSales, paidNow, payMethod, outstanding } = require('./sales');
const { spentFromCapital } = require('./purchases');

function summary(sh) {
  const invested = sum(sh.capital.filter(c => c.type === 'in'), c => c.amount);
  const withdrawn = sum(sh.capital.filter(c => c.type === 'out'), c => c.amount);
  const sales = okSales(sh);
  const collectedCash = sum(sales.filter(s => payMethod(s) === 'cash'), paidNow) + sum(sh.payments.filter(p => p.method !== 'momo'), p => p.amount);
  const collectedMomo = sum(sales.filter(s => payMethod(s) === 'momo'), paidNow) + sum(sh.payments.filter(p => p.method === 'momo'), p => p.amount);
  const spentStock = spentFromCapital(sh);
  const expenses = sum(sh.expenses, e => e.amount);
  const cashLeft = r2(invested - withdrawn + collectedCash - spentStock - expenses);
  const momoLeft = r2(collectedMomo);
  const stockValue = r2(sum(sh.products.filter(p => !p.archived && tracked(p)), p => p.stock * p.costPrice));
  const owed = outstanding(sh);
  return {
    invested: r2(invested), withdrawn: r2(withdrawn), collectedCash: r2(collectedCash), collectedMomo: r2(collectedMomo),
    spentStock, expenses: r2(expenses), cashLeft, momoLeft, totalLeft: r2(cashLeft + momoLeft),
    stockValue, owed, businessWorth: r2(cashLeft + momoLeft + stockValue + owed),
  };
}
module.exports = { summary };
