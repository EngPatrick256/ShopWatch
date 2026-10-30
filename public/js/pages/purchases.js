// Money spent buying stock: each new product and each restock, with totals
import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast, openForm } from '../core/dom.js';
import { money, fnum, esc, dt } from '../core/format.js';
import { stat, dateFilter, pill, emptyRow } from '../components/ui.js';

registerPage('purchases', async () => {
  const from = S.pfrom || '', to = S.pto || '';
  const d = await api(`/purchases?from=${from}&to=${to}`), t = d.totals;
  setMain(`<h2>Purchases: money spent on stock</h2>
  <div class="grid g3">
    ${stat({ label: 'Spent on NEW products', value: money(t.newCost), sub: `${fnum(t.newQty)} items bought`, color: 'purple', icon: '🆕' })}
    ${stat({ label: 'Spent on RESTOCKING', value: money(t.restockCost), sub: `${t.restockCount} restock(s), ${fnum(t.restockQty)} items`, color: 'teal', icon: '🔄' })}
    ${stat({ label: 'Total spent on stock', value: money(t.total), color: 'pink', icon: '🧾' })}
  </div>
  <div class="card">${dateFilter(from, to, 'filterPurch')}<p class="hint">Leave the dates empty to see all time.</p>
  <h3>Spending per product</h3>
  <table><tr><th>Product</th><th class="r">New stock qty</th><th class="r">Spent on new stock</th><th class="r">Restocks</th><th class="r">Restock qty</th><th class="r">Spent restocking</th><th class="r">Total spent</th></tr>
  ${d.products.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="r">${fnum(p.newQty)}</td><td class="r">${fnum(p.newCost)}</td><td class="r">${p.restockCount}${p.lastRestock ? `<br><small class="muted">last ${new Date(p.lastRestock).toLocaleDateString()}</small>` : ''}</td><td class="r">${fnum(p.restockQty)}</td><td class="r">${fnum(p.restockCost)}</td><td class="r"><b>${fnum(p.total)}</b></td></tr>`).join('') || emptyRow(7, 'No purchases yet.')}
  <tr class="totalrow"><td>TOTAL</td><td class="r">${fnum(t.newQty)}</td><td class="r">${fnum(t.newCost)}</td><td class="r">${t.restockCount}</td><td class="r">${fnum(t.restockQty)}</td><td class="r">${fnum(t.restockCost)}</td><td class="r">${fnum(t.total)}</td></tr></table></div>
  <div class="card"><h3>Purchase history</h3><table><tr><th>Date</th><th>Product</th><th>Type</th><th class="r">Qty</th><th class="r">Cost each</th><th class="r">Total cost</th><th>By</th><th>Supplier</th><th></th></tr>
  ${d.moves.map(m => `<tr><td>${dt(m.ts)}</td><td>${esc(m.name)}</td><td>${m.kind === 'initial' ? pill('New product', 'new') : pill('Restock', 'restock')}${m.fromCapital ? '' : ' ' + pill('own stock')}</td><td class="r">${fnum(m.qty)}</td><td class="r">${fnum(m.unitCost)}</td><td class="r"><b>${fnum(m.cost)}</b></td><td>${esc(m.by)}</td><td>${esc(m.supplier)}</td><td><button class="btn sm ghost" data-act="fixCost" data-id="${m.id}" data-cost="${m.unitCost}">Edit cost</button></td></tr>`).join('') || emptyRow(9, 'No purchases in this period.')}</table></div>`);
});

registerActions({
  filterPurch: () => { S.pfrom = $('#f').value; S.pto = $('#t').value; reload(); },
  fixCost: ({ id, cost }) => openForm('Correct purchase cost', [{ name: 'unitCost', label: 'Cost per unit actually paid', type: 'number', value: cost, required: 1, min: 0 }],
    async d => { await api('/stock/moves/' + id, 'PATCH', d); toast('Purchase cost corrected', 's'); reload(); }, 'Save', 'Use this if the wrong price was entered when stock was added.'),
});
