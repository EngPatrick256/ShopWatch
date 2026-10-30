// Money spent on running costs (transport, rent, airtime...)
import { S, can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast, openForm } from '../core/dom.js';
import { money, fnum, esc, dt, dayAgo, todayStr } from '../core/format.js';
import { dateFilter, emptyRow } from '../components/ui.js';

const CATS = ['Transport', 'Rent', 'Electricity / Water', 'Airtime / Data', 'Supplies', 'Staff / Wages', 'Other'];

registerPage('expenses', async () => {
  const own = can('view_all_sales'), from = S.efrom || (own ? dayAgo(6) : todayStr()), to = S.eto || todayStr();
  const l = await api(`/expenses?from=${from}&to=${to}`);
  setMain(`<h2>Expenses</h2><div class="card">${can('record_expense') ? '<div class="row"><button class="btn orange" data-act="addExpense">＋ Record expense</button></div><br>' : ''}
  ${own ? dateFilter(from, to, 'filterExp') : ''}
  <p>Total: <b>${money(l.reduce((a, e) => a + e.amount, 0))}</b></p>
  <table><tr><th>Time</th><th>Category</th><th>Details</th><th>By</th><th class="r">Amount</th></tr>${l.map(e => `<tr><td>${dt(e.ts)}</td><td>${esc(e.category)}</td><td>${esc(e.note)}</td><td>${esc(e.by)}</td><td class="r">${fnum(e.amount)}</td></tr>`).join('') || emptyRow(5, 'No expenses.')}</table></div>`);
});

registerActions({
  filterExp: () => { S.efrom = $('#f').value; S.eto = $('#t').value; reload(); },
  addExpense: () => openForm('Record expense', [{ name: 'category', label: 'Category', type: 'select', options: CATS }, { name: 'amount', label: 'Amount', type: 'number', required: 1, min: 0 }, { name: 'note', label: 'What was it for?', required: 1 }],
    async d => { await api('/expenses', 'POST', d); toast('Expense recorded', 's'); reload(); }, 'Save expense', 'Money taken out of the shop for the owner is recorded on the Capital page, not here.', 'orange'),
});
