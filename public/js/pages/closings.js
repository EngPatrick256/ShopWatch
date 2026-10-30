// Closing the till and comparing expected vs counted cash
import { isOwner, can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { toast, openForm } from '../core/dom.js';
import { pill } from '../components/ui.js';
import { fnum, esc, dt, signed } from '../core/format.js';
import { emptyRow } from '../components/ui.js';

registerPage('closings', async () => {
  const own = can('view_reports'), boss = isOwner(), [c, list] = await Promise.all([api('/closing/today'), api('/closings')]);
  setMain(`<h2>${own ? 'Cash closings' : 'Close the till'}</h2>
  <div class="card"><h3>Close till now</h3><p class="muted">Counts everything since the last close${c.sinceDate ? ' (' + dt(c.sinceDate) + ')' : ''}. Count the physical cash and enter it. ${own ? '' : 'The expected amount is shown to the owner only, so count honestly.'}</p>
  ${own ? `<table><tr><td>Float left at last close</td><td class="r">${fnum(c.opening)}</td></tr><tr><td>+ Cash received from sales</td><td class="r">${fnum(c.cashSales)}</td></tr><tr><td>+ Cash from customer balance payments</td><td class="r">${fnum(c.debtCash)}</td></tr><tr><td>− Expenses paid</td><td class="r">${fnum(c.expenses)}</td></tr><tr class="totalrow"><td>Expected cash in till</td><td class="r">${fnum(c.expectedCash)}</td></tr><tr><td>Expected MTN MoMo received</td><td class="r">${fnum(c.expectedMomo)}</td></tr><tr><td class="muted">Left unpaid by customers (not cash)</td><td class="r muted">${fnum(c.creditGiven)}</td></tr></table><br>` : `<p>${c.salesCount} sale(s) recorded since last close.</p>`}
  ${can('close_till') ? '<button class="btn" data-act="closeTill">🔒 Count & close till</button>' : ''}</div>
  <div class="card"><h3>History</h3><table><tr><th>Closed</th><th>By</th>${own ? '<th class="r">Expected</th><th class="r">Counted</th><th class="r">Variance</th><th class="r">MoMo var.</th>' : '<th class="r">Counted</th>'}<th class="r">Handed over</th>${own ? '<th>Note</th>' : ''}</tr>
  ${list.map(x => `<tr><td>${dt(x.ts)}</td><td>${esc(x.userName)}</td>${own ? `<td class="r">${fnum(x.expectedCash)}</td><td class="r">${fnum(x.countedCash)}</td><td class="r ${x.variance < 0 ? 'badtxt' : x.variance > 0 ? 'good' : ''}">${signed(x.variance)}</td><td class="r ${x.momoVariance < 0 ? 'badtxt' : ''}">${x.momoVariance == null ? '-' : fnum(x.momoVariance)}</td>` : `<td class="r">${fnum(x.countedCash)}</td>`}<td class="r">${x.handedOver > 0 ? `${fnum(x.handedOver)}<br>${handoverCell(x, own, boss)}` : '0'}</td>${own ? `<td>${esc(x.note)}</td>` : ''}</tr>`).join('') || emptyRow(8, 'No closings yet.')}</table></div>`);
});

const handoverCell = (x, own, boss) => {
  const st = x.handover?.status || 'pending';
  if (st === 'confirmed') return pill('Owner confirmed', 'ok');
  if (st === 'mismatch') return pill(own ? `Received ${fnum(x.handover.received)}` : 'Mismatch', 'bad');
  return boss ? `<button class="btn sm green" data-act="confirmHandover" data-id="${x.id}" data-amt="${x.handedOver}">Confirm received</button>` : pill('Waiting for owner', 'warn');
};

registerActions({
  confirmHandover: ({ id, amt }) => openForm('Confirm cash received', [{ name: 'received', label: 'How much cash did you actually receive?', type: 'number', value: amt, required: 1, min: 0 }],
    async d => { const r = await api(`/closings/${id}/confirm`, 'POST', d); toast(r.status === 'confirmed' ? 'Confirmed ✔' : 'Recorded as a mismatch and flagged', r.status === 'confirmed' ? 's' : true); reload(); }, 'Confirm', 'The shopkeeper says he handed you ' + fnum(amt) + '. If you received a different amount, enter it and the difference is flagged.', 'green'),
  closeTill: () => openForm('Count & close till', [
    { name: 'countedCash', label: 'Cash counted in the till now', type: 'number', required: 1, min: 0 },
    { name: 'handedOver', label: 'Cash handed over to owner (0 if none)', type: 'number', value: 0, min: 0 },
    { name: 'momoCounted', label: 'MTN MoMo received (check the phone, optional)', type: 'number' },
    { name: 'note', label: 'Note' },
  ], async d => {
    const r = await api('/closing', 'POST', d);
    toast(r.variance === 0 ? 'Till closed. Cash balanced ✔' : `Till closed. Variance: ${fnum(r.variance)}`, r.variance < 0 ? true : 's'); reload();
  }, 'Close till', '', 'purple'),
});
