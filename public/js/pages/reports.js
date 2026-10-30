// Period report: sales, gross and net profit, spending on stock; CSV download
import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $ } from '../core/dom.js';
import { money, fnum, esc, dayAgo, todayStr } from '../core/format.js';
import { stat, dateFilter } from '../components/ui.js';

registerPage('reports', async () => {
  const from = S.rfrom || dayAgo(6), to = S.rto || todayStr();
  const r = await api(`/reports?from=${from}&to=${to}`), t = r.totals; S.report = r;
  setMain(`<h2>Reports</h2><div class="card">${dateFilter(from, to, 'filterRep', '<button class="btn ghost" data-act="csvDay" style="margin-top:19px">⬇ Daily CSV</button><button class="btn ghost" data-act="csvProd" style="margin-top:19px">⬇ Products CSV</button>')}</div>
  <div class="grid g3">
    ${stat({ label: 'Sales', value: money(t.sales), sub: `${t.count} sale(s)`, color: 'purple', icon: '🛍️' })}
    ${stat({ label: 'Gross profit', value: money(t.profit), color: 'blue', icon: '📈' })}
    ${stat({ label: 'Expenses', value: money(t.expenses), color: 'orange', icon: '💸' })}
    ${stat({ label: 'Net profit', value: money(t.net), color: t.net >= 0 ? 'green' : 'red', icon: '💹' })}
    ${stat({ label: 'Spent on new products', value: money(t.spentNew), color: 'pink', icon: '🆕' })}
    ${stat({ label: 'Spent on restocking', value: money(t.spentRestock), color: 'teal', icon: '🔄' })}
  </div>
  <div class="two"><div class="card"><h3>By day</h3><table><tr><th>Date</th><th class="r">Sales</th><th class="r">Gross profit</th><th class="r">Expenses</th><th class="r">Net profit</th></tr>${r.byDay.map(d => `<tr><td>${d.date}</td><td class="r">${fnum(d.sales)}</td><td class="r">${fnum(d.profit)}</td><td class="r">${fnum(d.expenses)}</td><td class="r ${d.net < 0 ? 'badtxt' : 'good'}"><b>${fnum(d.net)}</b></td></tr>`).join('')}</table></div>
  <div class="card"><h3>By product</h3><table><tr><th>Product</th><th class="r">Qty</th><th class="r">Revenue</th><th class="r">Profit</th></tr>${r.byProduct.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${fnum(p.qty)}</td><td class="r">${fnum(p.revenue)}</td><td class="r">${fnum(p.profit)}</td></tr>`).join('')}</table></div></div>`);
});

function csv(name, cols, rows) {
  const t = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = `shopwatch-${name}-${S.report.from}_to_${S.report.to}.csv`; a.click();
}
registerActions({
  filterRep: () => { S.rfrom = $('#f').value; S.rto = $('#t').value; reload(); },
  csvDay: () => csv('daily', ['date', 'sales', 'profit', 'expenses', 'net', 'count'], S.report.byDay),
  csvProd: () => csv('products', ['name', 'qty', 'revenue', 'profit'], S.report.byProduct),
});
