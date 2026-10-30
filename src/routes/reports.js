// Period reports and the audit trail
const express = require('express');
const { auth, need } = require('../middleware/auth');
const { okSales, saleProfit } = require('../services/sales');
const purchases = require('../services/purchases');
const { sum, r2, dk, today } = require('../utils');

const r = express.Router();

r.get('/reports', auth, need('view_reports'), (req, res) => {
  const sh = req.sh, to = req.query.to || today(sh), from = req.query.from || dk(sh, Date.now() - 6 * 864e5);
  const sales = okSales(sh).filter(s => s.date >= from && s.date <= to), exp = sh.expenses.filter(e => e.date >= from && e.date <= to);
  const byDay = {}, byProd = {};
  const day = k => (byDay[k] = byDay[k] || { date: k, sales: 0, profit: 0, expenses: 0, net: 0, count: 0 });
  for (const s of sales) {
    const d = day(s.date); d.sales += s.total; d.profit += saleProfit(s); d.count++;
    for (const i of s.items) { const p = (byProd[i.productId] = byProd[i.productId] || { name: i.name, qty: 0, revenue: 0, profit: 0 }); p.qty += i.qty; p.revenue += i.price * i.qty; p.profit += (i.price - i.cost) * i.qty; }
  }
  for (const e of exp) day(e.date).expenses += e.amount;
  const rows = Object.values(byDay).map(d => ({ ...d, sales: r2(d.sales), profit: r2(d.profit), net: r2(d.profit - d.expenses) })).sort((a, b) => a.date.localeCompare(b.date));
  const pur = purchases.summary(sh, from, to).totals;
  const t = { sales: sum(sales, s => s.total), profit: r2(sum(sales, saleProfit)), expenses: sum(exp, e => e.amount), count: sales.length, spentNew: pur.newCost, spentRestock: pur.restockCost };
  t.net = r2(t.profit - t.expenses);
  res.json({ from, to, totals: t, byDay: rows, byProduct: Object.values(byProd).map(p => ({ ...p, revenue: r2(p.revenue), profit: r2(p.profit) })).sort((a, b) => b.revenue - a.revenue) });
});

r.get('/audit', auth, need('view_audit'), (req, res) => res.json([...req.sh.audit].reverse().slice(0, Number(req.query.limit) || 300)));

module.exports = r;
