// New sale screen (shopkeeper). Exact price per item, amount paid now, balance, Cash / MTN MoMo.
import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, toast } from '../core/dom.js';
import { money, fnum, esc, tracked } from '../core/format.js';
import { loadProducts } from './products.js';
import { showReceipt } from '../components/receipt.js';

const freshPay = () => ({ method: 'cash', paid: null, customer: '', phone: '', momoRef: '', momoPhone: '' });
const P = id => S.products.find(p => p.id === id);
const priceOf = id => S.prices[id] ?? P(id).price;
const cartTotal = () => Object.keys(S.cart).reduce((a, id) => a + S.cart[id] * priceOf(id), 0);
const listTotal = () => Object.keys(S.cart).reduce((a, id) => a + S.cart[id] * P(id).price, 0);
const paidNow = total => (S.pay.paid === null ? total : Number(S.pay.paid) || 0);

registerPage('pos', async () => {
  await loadProducts(); S.cart = {}; S.prices = {}; S.pay = freshPay();
  setMain(`<h2>New sale</h2><div class="pos"><div class="card"><h3>Products</h3><input id="q" placeholder="🔍 Search product…"><div class="plist" id="plist"></div></div>
  <div class="card"><h3>Current sale</h3><div id="cart"></div></div></div>`);
  $('#q').oninput = drawList;
  // typed values are remembered; qty/price edits redraw the cart
  $('#cart').oninput = e => {
    const t = e.target;
    if (t.id === 'paid') { S.pay.paid = t.value; refreshPay(); } else if (t.dataset.f) S.pay[t.dataset.f] = t.value;
  };
  $('#cart').onchange = e => {
    const t = e.target;
    if (t.dataset.cartqty) { const v = Number(t.value); if (v > 0) S.cart[t.dataset.cartqty] = v; else { delete S.cart[t.dataset.cartqty]; delete S.prices[t.dataset.cartqty]; } S.pay.paid = null; drawCart(); }
    if (t.dataset.cartprice) { const v = Number(t.value); if (t.value === '' || !(v >= 0)) toast('Enter a valid price', true); else S.prices[t.dataset.cartprice] = v; S.pay.paid = null; drawCart(); }
  };
  drawList(); drawCart();
});

function drawList() {
  const q = ($('#q')?.value || '').toLowerCase();
  const l = S.products.filter(p => !p.archived && (p.name + p.sku + p.category).toLowerCase().includes(q));
  $('#plist').innerHTML = l.map(p => `<div class="pitem ${tracked(p) && p.stock <= 0 ? 'out' : ''}"><div><b>${esc(p.name)}</b><br><small class="muted">${tracked(p) ? fnum(p.stock) + ' ' + esc(p.unit) + ' left' : 'service'}</small></div>
  <div class="row"><span class="chip">${fnum(p.price)}</span><button class="btn sm green" ${tracked(p) && p.stock <= 0 ? 'disabled' : ''} data-act="addCart" data-id="${p.id}">Add</button></div></div>`).join('') || '<p class="muted">No products found.</p>';
}

function drawCart() {
  const ids = Object.keys(S.cart);
  if (!ids.length) { $('#cart').innerHTML = '<p class="muted">Tap “Add” on a product to start a sale.</p>'; return; }
  const total = cartTotal(), list = listTotal(), pay = S.pay, paid = paidNow(total), bal = total - paid;
  $('#cart').innerHTML = `<table><tr><th>Item</th><th>Qty</th><th>Price each</th><th class="r">Amount</th><th></th></tr>${ids.map(id => {
    const p = P(id), pr = priceOf(id), diff = pr - p.price;
    return `<tr><td><b>${esc(p.name)}</b><br><small class="muted">listed ${fnum(p.price)}</small>${diff ? ` <span class="pill ${diff < 0 ? 'warn' : 'ok'}">${diff < 0 ? 'bargain ' : '+'}${fnum(diff)}</span>` : ''}</td>
    <td><input class="qty" type="number" step="any" min="0" value="${S.cart[id]}" data-cartqty="${id}"></td>
    <td><input class="price-in" type="number" step="any" min="0" value="${pr}" data-cartprice="${id}"></td><td class="r">${fnum(S.cart[id] * pr)}</td>
    <td><button class="btn sm ghost" data-act="rmCart" data-id="${id}">✕</button></td></tr>`;
  }).join('')}</table>
  <p class="hint">Type the exact price agreed with the customer in “Price each”. It is saved as the selling price for this sale, whether lower or higher than the listed price.</p>
  <div class="totalbox"><div>Total to pay</div><div class="big">${money(total)}</div>${list !== total ? `<small>Listed price ${money(list)} · ${total < list ? 'discount ' + money(list - total) : 'extra ' + money(total - list)}</small>` : ''}</div>
  <div class="seg"><button type="button" class="cash ${pay.method === 'cash' ? 'on' : ''}" data-act="payMethod" data-m="cash">💵 Cash</button><button type="button" class="momo ${pay.method === 'momo' ? 'on' : ''}" data-act="payMethod" data-m="momo">📱 MTN MoMo</button></div>
  <label>Amount the customer pays now<input id="paid" type="number" step="any" min="0" value="${pay.paid === null ? total : esc(pay.paid)}"><span class="hint">Enter less than the total if the customer pays only part.</span></label>
  <div id="balbox" class="balbox"></div>
  <div id="owingbox"><label>Customer name (required when a balance remains)<input data-f="customer" value="${esc(pay.customer)}"></label><label>Customer phone<input data-f="phone" type="tel" value="${esc(pay.phone)}"></label></div>
  <div id="momobox"><label>MoMo transaction ID (from the MTN confirmation SMS)<input data-f="momoRef" value="${esc(pay.momoRef)}" placeholder="e.g. 4829371650"></label><label>Customer MoMo number<input data-f="momoPhone" type="tel" value="${esc(pay.momoPhone)}" placeholder="07xx xxx xxx"></label></div>
  <button class="btn green big" data-act="completeSale">✅ Complete sale</button>`;
  refreshPay();
}

// updates balance + shows/hides the customer and MoMo boxes without redrawing (keeps typing focus)
function refreshPay() {
  const total = cartTotal(), paid = paidNow(total), bal = total - paid, box = $('#balbox');
  if (!box) return;
  box.className = 'balbox ' + (bal > 0.001 ? 'owing' : 'clear');
  box.innerHTML = bal > 0.001 ? `<span>Balance remaining</span><span>${money(bal)}</span>` : bal < -0.001 ? '<span>Amount is more than the total</span><span>⚠️</span>' : '<span>Paid in full</span><span>✔</span>';
  $('#owingbox').classList.toggle('hidden', !(bal > 0.001));
  $('#momobox').classList.toggle('hidden', !(S.pay.method === 'momo' && paid > 0));
}

registerActions({
  addCart: ({ id }) => {
    const p = P(id), n = (S.cart[id] || 0) + 1;
    if (tracked(p) && n > p.stock) return toast(`Only ${p.stock} in stock`, true);
    S.cart[id] = n; S.prices[id] ??= p.price; S.pay.paid = null; drawCart();
  },
  rmCart: ({ id }) => { delete S.cart[id]; delete S.prices[id]; S.pay.paid = null; drawCart(); },
  payMethod: ({ m }) => { S.pay.method = m; drawCart(); },
  completeSale: async () => {
    const total = cartTotal(), pay = S.pay;
    const s = await api('/sales', 'POST', {
      items: Object.keys(S.cart).map(id => ({ productId: id, qty: S.cart[id], price: priceOf(id) })),
      payment: pay.method, amountPaid: paidNow(total), customer: pay.customer, customerPhone: pay.phone, momoRef: pay.momoRef, momoPhone: pay.momoPhone,
    });
    toast(`Sale recorded: ${money(s.total)}${s.balance > 0 ? ' · balance ' + money(s.balance) : ''}`, 's');
    S.cart = {}; S.prices = {}; S.pay = freshPay(); await loadProducts(); drawList(); drawCart();
    showReceipt(s);
  },
});
