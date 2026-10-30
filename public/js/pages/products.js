// Product catalogue, receiving stock (restock) and stock counts
import { S, can } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast, openForm } from '../core/dom.js';
import { money, fnum, esc, tracked } from '../core/format.js';
import { emptyRow } from '../components/ui.js';

export const loadProducts = async () => (S.products = await api('/products'));

registerPage('products', async () => {
  await loadProducts();
  const own = can('manage_products'), costs = can('view_costs');
  setMain(`<h2>${own ? 'Products & stock' : 'Stock on hand'}</h2><div class="card">
  <div class="row" style="margin-bottom:12px"><input id="psearch" placeholder="🔍 Search products…" style="max-width:300px">
  <span class="spacer row">${own ? '<button class="btn green" data-act="addProduct">＋ New product</button>' : ''}${can('receive_stock') ? '<button class="btn blue" data-act="receive">📦 Receive stock</button>' : ''}${can('count_stock') ? '<button class="btn orange" data-act="count">🔢 Count stock</button>' : ''}</span></div>
  <div id="ptable"></div></div>`);
  const draw = () => {
    const q = $('#psearch').value.toLowerCase(), list = S.products.filter(p => (p.name + p.sku + p.category).toLowerCase().includes(q));
    $('#ptable').innerHTML = `<table><tr><th>Product</th><th>Category</th>${costs ? '<th class="r">Cost</th>' : ''}<th class="r">Selling price</th><th class="r">Stock</th><th class="r">Reorder at</th><th></th></tr>
    ${list.map(p => `<tr style="${p.archived ? 'opacity:.5' : ''}"><td><b>${esc(p.name)}</b><br><small class="muted">${esc(p.sku)}</small></td><td>${esc(p.category)}</td>${costs ? `<td class="r">${fnum(p.costPrice)}</td>` : ''}<td class="r">${fnum(p.price)}</td>
    <td class="r">${tracked(p) ? `<span class="pill ${p.stock <= 0 ? 'bad' : p.stock <= p.reorderLevel ? 'warn' : 'ok'}">${fnum(p.stock)} ${esc(p.unit)}</span>` : '<span class="pill info">service</span>'}</td><td class="r">${tracked(p) ? fnum(p.reorderLevel) : '-'}</td>
    <td class="r">${own ? `<button class="btn sm ghost" data-act="editProduct" data-id="${p.id}">Edit</button> <button class="btn sm ghost" data-act="archive" data-id="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button>` : ''}</td></tr>`).join('') || emptyRow(7, 'No products yet.')}</table>`;
  };
  $('#psearch').oninput = draw; draw();
});

const YESNO = [{ v: 'yes', t: 'Yes, from shop money' }, { v: 'no', t: 'No, I already owned it' }];
const productFields = (p = {}) => [
  { name: 'name', label: 'Product name', value: p.name, required: 1 }, { name: 'sku', label: 'Code / barcode (optional)', value: p.sku },
  { name: 'category', label: 'Category', value: p.category || 'General' }, { name: 'unit', label: 'Unit (pcs, kg, litre…)', value: p.unit || 'pcs' },
  { name: 'costPrice', label: 'Buying (cost) price per unit', type: 'number', value: p.costPrice ?? '', required: 1, min: 0 },
  { name: 'price', label: 'Selling price (listed)', type: 'number', value: p.price ?? '', required: 1, min: 0, hint: 'The shopkeeper can enter a different exact price when a customer bargains.' },
  { name: 'tracksStock', label: 'Count stock for this item?', type: 'select', options: [{ v: 'yes', t: 'Yes, a physical item' }, { v: 'no', t: 'No, a service (e.g. tailoring)' }], value: p.tracksStock === false ? 'no' : 'yes' },
  ...(p.id ? [] : [
    { name: 'stock', label: 'Opening stock (quantity bought now)', type: 'number', value: 0, min: 0, hint: 'Money spent = quantity × buying price. It is shown on the Purchases page.' },
    { name: 'fromCapital', label: 'Paid with shop money?', type: 'select', options: YESNO, value: 'yes' },
  ]),
  { name: 'reorderLevel', label: 'Reorder level (warn when stock reaches this)', type: 'number', value: p.reorderLevel ?? 5, min: 0 },
];
// shopkeepers count blind: the system quantity is not shown in the list
const prodOpts = (blind = false) => S.products.filter(p => !p.archived && tracked(p)).map(p => ({ v: p.id, t: blind ? p.name : `${p.name} (${fnum(p.stock)} ${p.unit})` }));

registerActions({
  addProduct: () => openForm('New product', productFields(), async d => { await api('/products', 'POST', d); toast('Product added', 's'); reload(); }, 'Add product', '', 'green'),
  editProduct: ({ id }) => { const p = S.products.find(x => x.id === id); openForm('Edit product', productFields(p), async d => { await api('/products/' + id, 'PUT', d); toast('Saved', 's'); reload(); }); },
  archive: async ({ id }) => { const p = S.products.find(x => x.id === id); await api('/products/' + id, 'PUT', { archived: !p.archived }); reload(); },
  receive: () => {
    if (!prodOpts().length) return toast('Add a product that counts stock first', true);
    openForm('Receive stock (restock)', [
      { name: 'productId', label: 'Product', type: 'select', options: prodOpts() },
      { name: 'qty', label: 'Quantity received', type: 'number', required: 1, min: 0 },
      { name: 'supplier', label: 'Supplier' },
      ...(can('set_costs') ? [{ name: 'unitCost', label: 'Price paid per unit this time (optional)', type: 'number', hint: 'Leave empty to use the current buying price. This also updates the product\'s cost price.' }, { name: 'fromCapital', label: 'Paid with shop money?', type: 'select', options: YESNO, value: 'yes' }] : []),
      { name: 'note', label: 'Note (invoice no. etc.)' },
    ], async d => { await api('/stock/in', 'POST', d); toast('Stock updated', 's'); reload(); }, 'Add to stock', '', 'blue');
  },
  count: () => {
    if (!prodOpts().length) return toast('Add a product that counts stock first', true);
    openForm('Count stock', [
      { name: 'productId', label: 'Product', type: 'select', options: prodOpts(!can('see_stock_diff')) },
      { name: 'counted', label: 'Physical count on the shelf', type: 'number', required: 1, min: 0 },
      { name: 'reason', label: can('see_stock_diff') ? 'Reason if different (damaged, expired, miscount…)' : 'Note (optional)' },
    ], async d => { await api('/stock/count', 'POST', d); toast('Count recorded', 's'); reload(); }, 'Record count', can('see_stock_diff') ? 'Count what is physically on the shelf. If it differs from the system, a reason is required.' : 'Count what is physically on the shelf and enter exactly that number. The owner reviews every count.', 'orange');
  },
});
