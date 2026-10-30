// Numbered receipt: show, print, send by WhatsApp
import { S } from '../core/state.js';
import { $, closeModal } from '../core/dom.js';
import { esc, fnum, dt } from '../core/format.js';
import { registerActions } from '../core/events.js';

const PREFIX = { UGX: '256', KES: '254', TZS: '255', RWF: '250', NGN: '234', GHS: '233' };
const num = n => S.cur + ' ' + fnum(n);
const method = s => (s.payment === 'momo' ? 'MTN MoMo' : s.payment === 'credit' ? 'Not paid yet' : 'Cash');

export function receiptText(s) {
  return [`${S.shop}`, `Receipt ${s.receiptNo || ''}`, dt(s.ts), `Served by ${s.userName}`, '',
    ...s.items.map(i => `${fnum(i.qty)} x ${i.name} @ ${fnum(i.price)} = ${fnum(i.qty * i.price)}`), '',
    `TOTAL: ${num(s.total)}`, `Paid (${method(s)}): ${num(s.paid ?? s.total)}`, ...(s.balance > 0 ? [`BALANCE DUE: ${num(s.balance)}`] : []), '', 'Thank you for shopping with us!'].join('\n');
}

export function showReceipt(s) {
  S.receipt = s;
  $('#modal').innerHTML = `<div class="modal-card"><div class="receipt">
    <h4>${esc(S.shop)}</h4><div class="c">Receipt <b>${esc(s.receiptNo || '-')}</b><br>${dt(s.ts)}<br>Served by ${esc(s.userName)}</div><hr>
    <table>${s.items.map(i => `<tr><td>${fnum(i.qty)} × ${esc(i.name)}<br>&nbsp;&nbsp;@ ${fnum(i.price)}</td><td class="r">${fnum(i.qty * i.price)}</td></tr>`).join('')}
    <tr class="tot"><td>TOTAL</td><td class="r">${num(s.total)}</td></tr>
    <tr><td>Paid (${method(s)})</td><td class="r">${num(s.paid ?? s.total)}</td></tr>
    ${s.balance > 0 ? `<tr><td><b>BALANCE DUE</b></td><td class="r"><b>${num(s.balance)}</b></td></tr>` : ''}</table>
    ${s.momoRef ? `<div>MoMo ID: ${esc(s.momoRef)}</div>` : ''}${s.customer ? `<div>Customer: ${esc(s.customer)}</div>` : ''}<hr><div class="c">Thank you for shopping with us!</div></div>
    <div class="row" style="margin-top:14px"><button class="btn green" data-act="shareReceipt">📲 WhatsApp</button><button class="btn blue" data-act="printReceipt">🖨 Print</button><button class="btn ghost" data-act="closeModal">Close</button></div></div>`;
  $('#modal').classList.remove('hidden');
}

registerActions({
  printReceipt: () => window.print(),
  shareReceipt: () => {
    const s = S.receipt; let ph = String(s.customerPhone || s.momoPhone || '').replace(/\D/g, '');
    if (ph.startsWith('0') && PREFIX[S.cur]) ph = PREFIX[S.cur] + ph.slice(1);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(receiptText(s))}`, '_blank');
  },
  showReceipt: ({ id }) => { const s = S.sales.find(x => x.id === id); if (s) showReceipt(s); },
  closeModal,
});
