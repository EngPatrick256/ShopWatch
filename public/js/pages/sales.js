// Sales list (owner: any dates; shopkeeper: today) with void requests
import { S, isOwner, can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast, openForm } from '../core/dom.js';
import { money, fnum, esc, dt, todayStr } from '../core/format.js';
import '../components/receipt.js';
import { dateFilter, methodPill, balanceCell, pill, emptyRow } from '../components/ui.js';

registerPage('sales', async () => {
  const own = can('view_all_sales'), boss = isOwner(), from = S.from || todayStr(), to = S.to || todayStr();
  const l = await api(`/sales?from=${from}&to=${to}`), ok = l.filter(s => s.status === 'ok'); S.sales = l;
  const sum = f => ok.reduce((a, s) => a + f(s), 0);
  setMain(`<h2>${own ? 'Sales' : 'Today\'s sales'}</h2><div class="card">
  ${own ? dateFilter(from, to, 'filterSales') : ''}
  <p><b>${ok.length}</b> sale(s) · total <b>${money(sum(s => s.total))}</b> · received <b class="good">${money(sum(s => s.paid))}</b> · still owed <b class="badtxt">${money(sum(s => s.balance))}</b></p>
  <table><tr><th>Time</th><th>Sold by</th><th>Items (exact price sold)</th><th>Payment</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr>
  ${l.map(s => `<tr style="${s.status === 'void' ? 'opacity:.55' : ''}"><td>${dt(s.ts)}${s.receiptNo ? `<br><small class="muted">${esc(s.receiptNo)}</small>` : ''}</td><td>${esc(s.userName)}</td>
  <td>${s.items.map(i => `${fnum(i.qty)}× ${esc(i.name)} @ ${fnum(i.price)}${i.listPrice !== i.price ? ` <small class="${i.price < i.listPrice ? 'badtxt' : 'good'}">(listed ${fnum(i.listPrice)})</small>` : ''}`).join('<br>')}</td>
  <td>${methodPill(s)}${s.momoRef ? `<br><small class="muted">ID ${esc(s.momoRef)}</small>` : ''}${s.customer ? `<br><small>${esc(s.customer)}${s.customerPhone ? ' · ' + esc(s.customerPhone) : ''}</small>` : ''}</td>
  <td class="r">${fnum(s.total)}</td><td class="r">${fnum(s.paid)}</td><td class="r">${s.status === 'void' ? '-' : balanceCell(s.balance)}</td>
  <td>${s.status === 'void' ? '' : `<button class="btn sm teal" data-act="showReceipt" data-id="${s.id}">🧾 Receipt</button><br>`}${s.status === 'void' ? `${pill('VOID', 'bad')}<br><small>${esc(s.voidReason || '')}</small>` :
    s.voidRequest?.status === 'pending' ? `${pill('Void requested', 'warn')}<br><small>${esc(s.voidRequest.reason)}</small>${boss ? `<br><button class="btn sm red" data-act="voidOk" data-id="${s.id}">Approve</button> <button class="btn sm ghost" data-act="voidNo" data-id="${s.id}">Reject</button>` : ''}` :
    boss ? `<button class="btn sm ghost" data-act="voidNow" data-id="${s.id}">Void</button>` : (s.userId === S.user.id && can('sell') ? `<button class="btn sm ghost" data-act="voidReq" data-id="${s.id}">Request void</button>` : '')}${s.voidRequest?.status === 'rejected' ? ' ' + pill('void rejected') : ''}</td></tr>`).join('') || emptyRow(8, 'No sales in this period.')}</table></div>`);
});

registerActions({
  filterSales: () => { S.from = $('#f').value; S.to = $('#t').value; reload(); },
  voidReq: ({ id }) => openForm('Request void', [{ name: 'reason', label: 'Why should this sale be voided?', type: 'textarea', required: 1 }], async d => { await api(`/sales/${id}/void-request`, 'POST', d); toast('Request sent to owner', 's'); reload(); }, 'Send request', '', 'orange'),
  voidNow: ({ id }) => openForm('Void this sale', [{ name: 'reason', label: 'Reason', type: 'textarea', required: 1 }], async d => { await api(`/sales/${id}/void`, 'POST', d); toast('Sale voided, stock returned', 's'); reload(); }, 'Void sale', 'Stock goes back on the shelf and any money recorded for this sale is removed.', 'red'),
  voidOk: async ({ id }) => { if (confirm('Approve void? Stock will be returned.')) { await api(`/sales/${id}/void`, 'POST', {}); reload(); } },
  voidNo: async ({ id }) => { await api(`/sales/${id}/void-reject`, 'POST'); reload(); },
});
