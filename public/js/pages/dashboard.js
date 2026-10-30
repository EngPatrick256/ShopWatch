// Owner overview: grouped into clear sections (today, money, capital & stock), then charts
import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { money, fnum, dt, esc } from '../core/format.js';
import { S } from '../core/state.js';
import { stat, bars } from '../components/ui.js';

registerPage('dashboard', async () => {
  const d = await api('/dashboard'), t = d.today, c = d.capital, p = d.purchases, lc = d.lastClose;
  const closeNote = lc ? `Last till close ${dt(lc.ts)} · variance <b>${lc.variance < 0 ? '⚠️ ' : ''}${fnum(lc.variance)}</b>` : 'No till close yet';
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const date = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  setMain(`<div class="hero-banner"><div class="hero-text"><small>${esc(date)}</small><h2>${greet}, ${esc(S.user.name)}</h2><p>${esc(S.shop)} · ${esc(S.roleLabel)}</p></div></div>
  ${d.alerts.length ? d.alerts.map(a => `<div class="alert ${a.level === 'bad' ? 'bad' : ''}" data-nav="${a.go}">${a.level === 'bad' ? '🚨' : '⚠️'} ${esc(a.text)}</div>`).join('') : '<div class="alert okbox">✅ No warnings right now.</div>'}

  <h3 class="section">Today at a glance</h3>
  <div class="grid g4 has-hero">
    ${stat({ label: 'Net profit today', value: money(t.net), sub: `Gross ${money(t.gross)} − expenses ${money(t.expenses)}`, color: t.net >= 0 ? 'green' : 'red', icon: '💹', nav: 'reports', hero: true })}
    ${stat({ label: 'Sales today', value: money(t.total), sub: `${t.count} sale(s)`, color: 'purple', icon: '🛍️', nav: 'sales' })}
    ${stat({ label: 'Expenses today', value: money(t.expenses), color: 'orange', icon: '💸', nav: 'expenses' })}
    ${stat({ label: 'Bargain discounts today', value: money(t.discount), sub: 'Given below listed prices', color: 'amber', icon: '🏷️' })}
  </div>

  <h3 class="section">Money received</h3>
  <div class="grid g4">
    ${stat({ label: 'Cash received today', value: money(t.cash), sub: closeNote, color: 'green', icon: '💵', nav: 'closings' })}
    ${stat({ label: 'MTN MoMo received today', value: money(t.momo), color: 'mtn', icon: '📱' })}
    ${stat({ label: 'Unpaid today', value: money(t.unpaid), sub: 'Balances left by customers today', color: 'red', icon: '⏳', nav: 'debts' })}
    ${stat({ label: 'Customers owe you', value: money(d.debts), sub: 'Total of all open balances', color: 'pink', icon: '📒', nav: 'debts' })}
  </div>

  <h3 class="section">Capital & stock</h3>
  <div class="grid g4 has-hero">
    ${stat({ label: 'Cash capital left', value: money(c.totalLeft), sub: `Cash ${money(c.cashLeft)} · MoMo ${money(c.momoLeft)}`, color: c.totalLeft >= 0 ? 'teal' : 'red', icon: '💰', nav: 'capital', hero: true })}
    ${stat({ label: 'Spent on stock (all time)', value: money(p.total), sub: `New ${money(p.newCost)} · Restock ${money(p.restockCost)}`, color: 'pink', icon: '🧾', nav: 'purchases' })}
    ${stat({ label: 'Stock value', value: money(d.stockCost), sub: `At cost · ${money(d.stockRetail)} at selling price`, color: 'blue', icon: '📦', nav: 'products' })}
    ${stat({ label: 'Products / out of stock', value: `${d.productCount} / ${d.outOfStock}`, sub: `${d.outOfStock ? 'Some items need restocking' : 'Nothing out of stock'}${d.checks.total ? ` · Daily checks ${d.checks.done}/${d.checks.total}` : ''}`, color: d.outOfStock ? 'red' : 'purple', icon: '📋', nav: 'restock' })}
  </div>

  <h3 class="section">Trends</h3>
  <div class="two">
    <div class="card"><h3>Sales, last 7 days</h3>${bars(d.days, 'total')}</div>
    <div class="card"><h3>Net profit, last 7 days</h3>${bars(d.days, 'net', 'net')}</div>
  </div>
  <div class="two">
    <div class="card"><h3>Best sellers (7 days)</h3>${d.top.length ? `<table>${d.top.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${fnum(x.qty)} sold</td><td class="r">${money(x.revenue)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales yet.</p>'}</div>
    <div class="card"><h3>Low / out of stock</h3>${d.low.length ? `<table><tr><th>Product</th><th class="r">Left</th><th class="r">Reorder at</th></tr>${d.low.map(x => `<tr><td>${esc(x.name)}</td><td class="r ${x.stock <= 0 ? 'badtxt' : ''}">${fnum(x.stock)} ${esc(x.unit)}</td><td class="r">${fnum(x.reorderLevel)}</td></tr>`).join('')}</table>` : '<p class="muted">Everything is above reorder level.</p>'}</div>
  </div>
  <div class="card"><h3>Latest activity</h3><table>${d.activity.map(a => `<tr><td class="muted" style="white-space:nowrap">${dt(a.ts)}</td><td><b>${esc(a.user)}</b> ${esc(a.detail)}</td></tr>`).join('')}</table></div>`);
});
