// Daily surprise stock checks. Shopkeeper counts blind; the owner sees the differences.
import { can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast } from '../core/dom.js';
import { fnum, esc, dt, signed } from '../core/format.js';
import { pill, emptyRow } from '../components/ui.js';

registerPage('checks', async () => {
  const own = can('view_reports'), today = await api('/checks/today');
  const done = today.filter(c => c.status === 'done').length;
  if (!own) {
    setMain(`<h2>Daily stock check</h2><div class="card"><p class="muted">Each day the app picks a few products at random. Count each one on the shelf and enter exactly what you count. You will not be shown the system number.</p>
    ${today.length ? `<p><b>${done}</b> of <b>${today.length}</b> done</p><table><tr><th>Product</th><th>Count on the shelf</th><th></th></tr>${today.map(c => c.status === 'done'
      ? `<tr><td>${esc(c.name)}</td><td colspan="2">${pill('Counted ✔', 'ok')}</td></tr>`
      : `<tr><td><b>${esc(c.name)}</b><br><small class="muted">${esc(c.unit)}</small></td><td><input class="qty" type="number" step="any" min="0" id="chk-${c.id}"></td><td><button class="btn sm orange" data-act="submitCheck" data-id="${c.id}">Submit count</button></td></tr>`).join('')}</table>` : '<p class="muted">No stock checks are needed today.</p>'}</div>`);
    return;
  }
  const hist = await api('/checks/history');
  setMain(`<h2>Stock checks</h2><div class="card"><p class="muted">Each day the app asks the shopkeeper to count a few random products, without showing him the system number. You can change how many in <b>Alerts & email</b>.</p>
  <h3>Today: ${done} of ${today.length} done</h3><table><tr><th>Product</th><th>Status</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th><th>By</th></tr>
  ${today.map(c => `<tr><td>${esc(c.name)}</td><td>${c.status === 'done' ? pill('Done', 'ok') : pill('Waiting', 'warn')}</td><td class="r">${c.status === 'done' ? fnum(c.systemQty) : '-'}</td><td class="r">${c.status === 'done' ? fnum(c.countedQty) : '-'}</td><td class="r ${c.diff < 0 ? 'badtxt' : ''}">${c.status === 'done' ? signed(c.diff) : '-'}</td><td>${esc(c.by || '')}</td></tr>`).join('') || emptyRow(6, 'No checks today (switched off or no stock).')}</table></div>
  <div class="card"><h3>History</h3><table><tr><th>Date</th><th>Product</th><th>Status</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th><th>By</th></tr>
  ${hist.map(c => `<tr style="${c.diff < 0 ? 'background:#fef2f2' : ''}"><td>${c.date}</td><td>${esc(c.name)}</td><td>${c.status === 'done' ? pill('Done', 'ok') : c.overdue ? pill('Not done', 'bad') : pill('Waiting', 'warn')}</td><td class="r">${c.status === 'done' ? fnum(c.systemQty) : '-'}</td><td class="r">${c.status === 'done' ? fnum(c.countedQty) : '-'}</td><td class="r ${c.diff < 0 ? 'badtxt' : ''}">${c.status === 'done' ? signed(c.diff) : '-'}</td><td>${esc(c.by || '')}</td></tr>`).join('') || emptyRow(7, 'No history yet.')}</table></div>`);
});

registerActions({
  submitCheck: async ({ id }) => {
    const v = $('#chk-' + id).value;
    await api(`/checks/${id}/submit`, 'POST', { counted: v });
    toast('Count saved. Thank you', 's'); reload();
  },
});
