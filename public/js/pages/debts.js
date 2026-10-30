// Customer balances (part payments) and recording instalments
import { can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { toast, openForm } from '../core/dom.js';
import { money, fnum, esc, dt } from '../core/format.js';
import { emptyRow } from '../components/ui.js';

registerPage('debts', async () => {
  const l = await api('/debts');
  setMain(`<h2>Balances owed by customers</h2><div class="card"><p>Total owed: <b class="badtxt">${money(l.reduce((a, d) => a + d.balance, 0))}</b></p>
  <table><tr><th>Date</th><th>Customer</th><th>Items</th><th>Sold by</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr>
  ${l.map(d => `<tr><td>${dt(d.ts)}</td><td><b>${esc(d.customer)}</b>${d.customerPhone ? `<br><small>${esc(d.customerPhone)}</small>` : ''}</td><td><small>${esc(d.items)}</small></td><td>${esc(d.by)}</td><td class="r">${fnum(d.total)}</td><td class="r">${fnum(d.paid)}</td><td class="r"><b class="badtxt">${fnum(d.balance)}</b></td>
  <td>${can('take_payments') ? `<button class="btn sm teal" data-act="payDebt" data-id="${d.id}" data-bal="${d.balance}">Record payment</button>` : ''}</td></tr>`).join('') || emptyRow(8, 'Nobody owes you anything.')}</table></div>`);
});

registerActions({
  payDebt: ({ id, bal }) => openForm('Record customer payment', [
    { name: 'amount', label: `Amount paid now (balance ${fnum(bal)})`, type: 'number', value: bal, required: 1, min: 0 },
    { name: 'method', label: 'Paid by', type: 'select', options: [{ v: 'cash', t: '💵 Cash' }, { v: 'momo', t: '📱 MTN MoMo' }] },
    { name: 'momoRef', label: 'MoMo transaction ID (only if paid by MTN MoMo)' },
  ], async d => { const r = await api(`/sales/${id}/pay`, 'POST', d); toast(r.balance > 0 ? `Recorded. Remaining balance ${fnum(r.balance)}` : 'Fully paid ✔', 's'); reload(); }, 'Record payment', '', 'teal'),
});
