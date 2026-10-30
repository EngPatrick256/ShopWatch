// Cash capital: how much money the business has left
import { isOwner } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { toast, openForm } from '../core/dom.js';
import { money, fnum, esc, dt } from '../core/format.js';
import { stat, pill, emptyRow } from '../components/ui.js';

registerPage('capital', async () => {
  const { summary: c, entries } = await api('/capital');
  const line = (label, v, sign) => `<tr><td>${sign} ${label}</td><td class="r ${sign === '−' ? 'badtxt' : ''}">${money(v)}</td></tr>`;
  setMain(`<h2>Cash capital</h2>
  <div class="grid g4">
    ${stat({ label: 'Total cash capital left', value: money(c.totalLeft), sub: 'Cash + MTN MoMo', color: c.totalLeft >= 0 ? 'teal' : 'red', icon: '💰' })}
    ${stat({ label: 'Cash in hand', value: money(c.cashLeft), color: 'green', icon: '💵' })}
    ${stat({ label: 'MTN MoMo balance', value: money(c.momoLeft), color: 'mtn', icon: '📱' })}
    ${stat({ label: 'Whole business worth', value: money(c.businessWorth), sub: 'Money + stock at cost + owed to you', color: 'purple', icon: '🏦' })}
  </div>
  ${isOwner() ? '<div class="row" style="margin:14px 0"><button class="btn green" data-act="addCapital">＋ Add capital</button><button class="btn red" data-act="withdraw">− Withdraw money</button></div>' : '<div style="height:8px"></div>'}
  <div class="two">
    <div class="card"><h3>How it is worked out</h3><table>
      ${line('Capital you added', c.invested, '+')}${line('Cash collected from customers', c.collectedCash, '+')}${line('MTN MoMo collected from customers', c.collectedMomo, '+')}
      ${line('Spent buying stock (new + restock)', c.spentStock, '−')}${line('Expenses', c.expenses, '−')}${line('Money you withdrew', c.withdrawn, '−')}
      <tr class="totalrow"><td>= Cash capital left</td><td class="r">${money(c.totalLeft)}</td></tr></table>
      <p class="hint">Record your starting money with “Add capital”, otherwise this figure starts at zero and shows what you spend as a minus. Stock marked “I already owned it” is not deducted.</p></div>
    <div class="card"><h3>Other assets</h3><table><tr><td>Stock on the shelf (at cost)</td><td class="r">${money(c.stockValue)}</td></tr><tr><td>Customers still owe you</td><td class="r">${money(c.owed)}</td></tr></table></div>
  </div>
  <div class="card"><h3>Capital ledger</h3><table><tr><th>Date</th><th>Type</th><th>Note</th><th>By</th><th class="r">Amount</th></tr>
  ${entries.map(e => `<tr><td>${dt(e.ts)}</td><td>${e.type === 'in' ? pill('Capital added', 'ok') : pill('Withdrawn', 'bad')}</td><td>${esc(e.note)}</td><td>${esc(e.by)}</td><td class="r">${fnum(e.amount)}</td></tr>`).join('') || emptyRow(5, 'No entries yet. Start by adding your capital.')}</table></div>`);
});

const form = type => ({ name: 'amount', label: 'Amount', type: 'number', required: 1, min: 0 });
registerActions({
  addCapital: () => openForm('Add capital', [form(), { name: 'note', label: 'Note (e.g. starting money, savings, loan)' }], async d => { await api('/capital', 'POST', { ...d, type: 'in' }); toast('Capital added', 's'); reload(); }, 'Add capital', '', 'green'),
  withdraw: () => openForm('Withdraw money', [form(), { name: 'note', label: 'Note (e.g. owner took for personal use)' }], async d => { await api('/capital', 'POST', { ...d, type: 'out' }); toast('Withdrawal recorded', 's'); reload(); }, 'Record withdrawal', '', 'red'),
});
