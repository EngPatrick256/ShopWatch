// What to buy next
import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { toast } from '../core/dom.js';
import { money, fnum, esc } from '../core/format.js';

registerPage('restock', async () => {
  const l = await api('/restock'), total = l.reduce((a, p) => a + p.estCost, 0);
  S.shopList = 'Restock list - ' + S.shop + '\n' + l.map(p => `- ${p.name}: buy ${p.suggested} ${p.unit} (have ${fnum(p.stock)})`).join('\n');
  setMain(`<h2>What to restock</h2><div class="card"><p class="muted">Products at or below reorder level, or expected to run out within 7 days (from the last 14 days of sales). The suggested quantity covers about 2 weeks.</p>
  ${l.length ? `<table><tr><th>Product</th><th class="r">In stock</th><th class="r">Reorder at</th><th class="r">Sells/day</th><th class="r">Days left</th><th class="r">Buy</th><th class="r">Est. cost</th></tr>
  ${l.map(p => `<tr><td>${esc(p.name)}</td><td class="r ${p.stock <= 0 ? 'badtxt' : ''}">${fnum(p.stock)}</td><td class="r">${fnum(p.reorderLevel)}</td><td class="r">${p.avgPerDay}</td><td class="r">${p.daysLeft ?? '-'}</td><td class="r"><b>${p.suggested} ${esc(p.unit)}</b></td><td class="r">${money(p.estCost)}</td></tr>`).join('')}
  <tr class="totalrow"><td colspan="6" class="r">Estimated total</td><td class="r">${money(total)}</td></tr></table>
  <div class="row" style="margin-top:14px"><button class="btn green" data-act="whatsapp">📲 Send list via WhatsApp</button><button class="btn ghost" data-act="copyList">📋 Copy list</button></div>` : '<p class="good">Nothing needs restocking right now 🎉</p>'}</div>`);
});

registerActions({
  whatsapp: () => window.open('https://wa.me/?text=' + encodeURIComponent(S.shopList), '_blank'),
  copyList: async () => { await navigator.clipboard.writeText(S.shopList); toast('Copied', 's'); },
});
