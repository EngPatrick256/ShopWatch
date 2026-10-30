// Owner dashboard: today's money, profit, capital, warnings.
const express = require('express');
const { auth, need } = require('../middleware/auth');
const { okSales, outstanding } = require('../services/sales');
const capital = require('../services/capital');
const purchases = require('../services/purchases');
const { dayStats, lastDays } = require('../services/stats');
const checksSvc = require('../services/checks');
const { sum, r2, tracked, today, hourNow } = require('../utils');

const r = express.Router();

r.get('/dashboard', auth, need('view_reports'), (req, res) => {
  const sh = req.sh, ok = okSales(sh), week = Date.now() - 7 * 864e5;
  const t = dayStats(sh, today(sh)), days = lastDays(sh, 7);
  const sold = {};
  for (const s of ok) if (s.ts >= week) for (const i of s.items) { const x = (sold[i.name] = sold[i.name] || { name: i.name, qty: 0, revenue: 0 }); x.qty += i.qty; x.revenue += i.price * i.qty; }
  const active = sh.products.filter(p => !p.archived), stockItems = active.filter(tracked);
  const low = stockItems.filter(p => p.stock <= p.reorderLevel).sort((a, b) => a.stock - b.stock);
  const cap = capital.summary(sh), pur = purchases.summary(sh);
  const avg6 = sum(days.slice(0, 6), x => x.total) / 6, alerts = [];

  const pend = sh.sales.filter(s => s.status === 'ok' && s.voidRequest?.status === 'pending').length;
  if (pend) alerts.push({ level: 'warn', text: `${pend} void request(s) waiting for your approval`, go: 'sales' });
  sh.closings.filter(c => c.ts >= week && c.variance < 0).forEach(c => alerts.push({ level: 'bad', text: `Cash SHORT by ${Math.abs(c.variance)} at close on ${new Date(c.ts).toLocaleString()} (${c.userName})`, go: 'closings' }));
  sh.closings.filter(c => c.ts >= week && c.momoVariance < 0).forEach(c => alerts.push({ level: 'bad', text: `MTN MoMo SHORT by ${Math.abs(c.momoVariance)} at close on ${new Date(c.ts).toLocaleString()}`, go: 'closings' }));
  const loss = sh.moves.filter(m => m.type === 'count' && m.qty < 0 && m.ts >= week);
  if (loss.length) alerts.push({ level: 'bad', text: `${loss.length} stock shortage(s) found in counts this week, worth ${sum(loss, m => m.valueLost || 0)} at cost`, go: 'stocklog' });
  const belowCost = ok.filter(s => s.ts >= week && s.items.some(i => i.price < i.cost)).length;
  if (belowCost) alerts.push({ level: 'bad', text: `${belowCost} sale(s) this week were sold BELOW cost price`, go: 'sales' });
  const vc = sh.sales.filter(s => s.ts >= week && (s.voidRequest || s.status === 'void')).length;
  if (vc >= 3) alerts.push({ level: 'warn', text: `${vc} void requests/voids in the last 7 days. Review them.`, go: 'sales' });
  const wk = ok.filter(s => s.ts >= week), discWeek = sum(wk, s => s.discount || 0), listWeek = sum(wk, s => s.listTotal || s.total);
  if (discWeek > 0 && discWeek >= 0.1 * listWeek) alerts.push({ level: 'warn', text: `Bargain discounts this week total ${Math.round(discWeek)} (${Math.round(100 * discWeek / listWeek)}% of list prices). Check the Sales page.`, go: 'sales' });
  if (avg6 > 0 && t.total < avg6 * 0.5 && hourNow(sh) >= 15) alerts.push({ level: 'warn', text: `Today's sales (${t.total}) are less than half of your usual daily average (${Math.round(avg6)})`, go: 'sales' });
  if (cap.invested === 0 && pur.totals.total > 0) alerts.push({ level: 'warn', text: 'Record your starting capital on the Capital page so "cash capital left" is correct', go: 'capital' });
  const chk = checksSvc.today(sh), chkDone = chk.filter(x => x.status === 'done').length;
  if (chk.length && chkDone < chk.length && hourNow(sh) >= 17) alerts.push({ level: 'warn', text: `${chk.length - chkDone} daily stock check(s) not done yet`, go: 'checks' });
  const spotLoss = chk.filter(x => x.status === 'done' && x.diff < 0).length;
  if (spotLoss) alerts.push({ level: 'bad', text: `${spotLoss} daily stock check(s) today found items missing`, go: 'checks' });
  const pendHand = sh.closings.filter(x => x.handedOver > 0 && (!x.handover || x.handover.status === 'pending')).length;
  if (pendHand) alerts.push({ level: 'warn', text: `${pendHand} cash handover(s) waiting for your confirmation`, go: 'closings' });
  sh.closings.filter(x => x.ts >= week && x.handover?.status === 'mismatch').forEach(x => alerts.push({ level: 'bad', text: `Cash handover mismatch: ${x.userName} said ${x.handedOver}, you received ${x.handover.received}`, go: 'closings' }));
  if (low.length) alerts.push({ level: 'warn', text: `${low.length} product(s) at or below reorder level`, go: 'restock' });

  const lc = [...sh.closings].sort((a, b) => b.ts - a.ts)[0];
  res.json({
    today: t, days, top: Object.values(sold).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    low: low.slice(0, 15), outOfStock: stockItems.filter(p => p.stock <= 0).length, productCount: active.length,
    stockCost: r2(sum(stockItems, p => p.stock * p.costPrice)), stockRetail: r2(sum(stockItems, p => p.stock * p.price)),
    debts: outstanding(sh), capital: cap, purchases: pur.totals, checks: { total: chk.length, done: chkDone },
    lastClose: lc ? { ts: lc.ts, variance: lc.variance, by: lc.userName } : null,
    alerts, activity: [...sh.audit].reverse().slice(0, 12),
  });
});

module.exports = r;
