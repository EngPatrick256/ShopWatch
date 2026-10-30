// History of stock received and counted
import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { money, fnum, esc, dt, signed } from '../core/format.js';
import { pill, emptyRow } from '../components/ui.js';

registerPage('stocklog', async () => {
  const l = await api('/stock/moves');
  setMain(`<h2>Stock log</h2><div class="card"><p class="muted">Every stock received and every physical count. Red rows are shortages found during counts, the best way to catch unrecorded sales or theft.</p>
  <table><tr><th>Time</th><th>Type</th><th>Product</th><th class="r">Change</th><th class="r">Before → After</th><th>By</th><th>Note</th></tr>
  ${l.map(m => `<tr style="${m.type === 'count' && m.qty < 0 ? 'background:#fef2f2' : ''}"><td>${dt(m.ts)}</td><td>${m.kind === 'spot' ? pill('Spot check', 'info') : m.type === 'count' ? pill('Count', 'warn') : m.kind === 'initial' ? pill('New product', 'new') : pill('Restock', 'restock')}</td><td>${esc(m.name)}</td>
  <td class="r ${m.qty < 0 ? 'badtxt' : ''}">${signed(m.qty)}</td><td class="r">${fnum(m.before)} → ${fnum(m.after)}</td><td>${esc(m.by)}</td>
  <td>${esc(m.supplier ? m.supplier + '. ' : '')}${esc(m.note || '')}${m.totalCost ? ` <b>(cost ${money(m.totalCost)})</b>` : ''}${m.valueLost ? ` <b class="badtxt">(lost ${money(m.valueLost)})</b>` : ''}</td></tr>`).join('') || emptyRow(7, 'Nothing yet.')}</table></div>`);
});
