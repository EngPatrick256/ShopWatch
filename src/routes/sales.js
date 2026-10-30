// Recording sales. The shopkeeper enters the exact price agreed with the customer for each item
// (bargaining) and how much the customer paid now; any remaining balance becomes a debt.
const express = require('express');
const store = require('../store');
const { auth, owner, need } = require('../middleware/auth');
const { can } = require('../permissions');
const { audit } = require('../services/audit');
const alerts = require('../services/alerts');
const { balances, paidNow, momoRefUsed } = require('../services/sales');
const { uid, sum, r2, tracked, today, hourNow, err } = require('../utils');

const r = express.Router();
const showSale = (s, u, bal) => {
  const b = bal?.get(s.id), out = { ...s, paid: b ? b.paid : paidNow(s), balance: b ? b.balance : r2(s.total - paidNow(s)) };
  return can(u, 'view_costs') ? out : { ...out, items: out.items.map(({ cost, ...i }) => i) };
};
r.post('/sales', auth, need('sell'), (req, res) => {
  const sh = req.sh, b = req.body || {}, items = b.items;
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Add at least one item');
  const lines = [], need = {};
  for (const it of items) {
    const p = sh.products.find(x => x.id === it.productId && !x.archived), n = Number(it.qty);
    if (!p || !(n > 0)) return err(res, 400, 'Invalid item in sale');
    need[p.id] = (need[p.id] || 0) + n;
    let price = p.price; // exact price actually charged (bargaining allowed, below or above the listed price)
    if (it.price !== undefined && it.price !== null && it.price !== '') {
      price = Number(it.price);
      if (!(price >= 0)) return err(res, 400, 'Invalid price for ' + p.name);
    }
    lines.push({ productId: p.id, name: p.name, qty: n, price, listPrice: p.price, cost: p.costPrice || 0 });
  }
  for (const pid in need) {
    const p = sh.products.find(x => x.id === pid);
    if (tracked(p) && p.stock < need[pid]) return err(res, 400, `Not enough stock for ${p.name} (only ${p.stock} left)`);
  }
  const total = r2(sum(lines, l => l.price * l.qty));
  // how much the customer paid now (default: everything)
  const paid = b.amountPaid === undefined || b.amountPaid === null || b.amountPaid === '' ? total : Number(b.amountPaid);
  if (!(paid >= 0)) return err(res, 400, 'Enter a valid amount paid');
  if (paid > total + 0.001) return err(res, 400, 'Amount paid cannot be more than the sale total');
  const balance = r2(total - paid);
  if (balance > 0 && !String(b.customer || '').trim()) return err(res, 400, 'Customer name is required when the customer has not paid in full');
  const method = b.payment === 'momo' ? 'momo' : 'cash';
  const momoRef = String(b.momoRef || '').trim();
  if (paid > 0 && method === 'momo') {
    if (momoRef.length < 4) return err(res, 400, 'Enter the MTN MoMo transaction ID (from the confirmation SMS)');
    if (momoRefUsed(sh, momoRef)) return err(res, 400, 'This MoMo transaction ID has already been recorded');
  }
  for (const pid in need) { const p = sh.products.find(x => x.id === pid); if (tracked(p)) { p.stock = r2(p.stock - need[pid]); store.put(sh, 'products', p); } }
  // numbered receipts: gaps in the numbers would reveal a sale that was removed
  const seq = (sh.meta.receiptSeq || 0) + 1; sh.meta.receiptSeq = seq; store.putMeta(sh);
  const s = store.add(sh, 'sales', {
    id: uid(), receiptNo: 'R-' + String(seq).padStart(6, '0'), ts: Date.now(), date: today(sh), userId: req.user.id, userName: req.user.name, items: lines, total,
    listTotal: r2(sum(lines, l => l.listPrice * l.qty)),
    discount: r2(sum(lines, l => Math.max(0, l.listPrice - l.price) * l.qty)),
    extra: r2(sum(lines, l => Math.max(0, l.price - l.listPrice) * l.qty)),
    payment: paid > 0 ? method : 'credit', paidNow: paid, momoRef: paid > 0 && method === 'momo' ? momoRef : '',
    momoPhone: String(b.momoPhone || '').trim(), customer: String(b.customer || '').trim(), customerPhone: String(b.customerPhone || '').trim(),
    note: b.note || '', status: 'ok', voidRequest: null,
  });
  audit(sh, req.user, 'sale', `Sale ${total} (${paid > 0 ? (method === 'momo' ? 'MTN MoMo' : 'cash') + ' ' + paid : 'nothing paid'}${balance > 0 ? ', balance ' + balance : ''}): ${lines.map(l => l.qty + '×' + l.name).join(', ')}${s.discount ? ' [bargain discount ' + s.discount + ']' : ''}`);
  // email alerts to the owner (fire-and-forget)
  const al = alerts.settings(sh), below = lines.filter(l => l.price < l.cost), hr = hourNow(sh);
  if (below.length) alerts.notify(sh, 'below_cost', `Sold below cost price: ${below[0].name}`, [`${req.user.name} sold ${below.map(l => `${l.qty} × ${l.name} at ${l.price} (cost ${l.cost})`).join(', ')}.`, `Receipt ${s.receiptNo}. Sale total ${total}.`]);
  if (s.listTotal > 0 && (s.discount / s.listTotal) * 100 >= al.discountPct) alerts.notify(sh, 'big_discount', `Big discount: ${Math.round(s.discount)} given off`, [`${req.user.name} gave a discount of ${s.discount} on a sale listed at ${s.listTotal} (${Math.round((s.discount / s.listTotal) * 100)}%).`, `Items: ${lines.map(l => `${l.qty} × ${l.name} sold at ${l.price}, listed ${l.listPrice}`).join('; ')}.`, `Receipt ${s.receiptNo}.`]);
  if (req.user.role !== 'owner' && (hr < al.openHour || hr >= al.closeHour)) alerts.notify(sh, 'after_hours', 'Sale recorded outside opening hours', [`${req.user.name} recorded a sale of ${total} at ${String(hr).padStart(2, '0')}:00, outside your opening hours (${al.openHour}:00 to ${al.closeHour}:00).`, `Receipt ${s.receiptNo}.`]);
  res.json(showSale(s, req.user));
});

r.get('/sales', auth, need('view_sales'), (req, res) => {
  const sh = req.sh;
  let { from, to } = req.query;
  if (!can(req.user, 'view_all_sales')) from = to = today(sh);
  from = from || today(sh); to = to || today(sh);
  const bal = balances(sh);
  res.json(sh.sales.filter(s => s.date >= from && s.date <= to).sort((a, b) => b.ts - a.ts).slice(0, 600).map(s => showSale(s, req.user, bal)));
});

function doVoid(sh, s, by, reason) {
  for (const i of s.items) { const p = sh.products.find(x => x.id === i.productId); if (p && tracked(p)) { p.stock = r2(p.stock + i.qty); store.put(sh, 'products', p); } }
  sh.payments.filter(p => p.saleId === s.id).forEach(p => store.drop(sh, 'payments', p.id));
  sh.payments = sh.payments.filter(p => p.saleId !== s.id);
  s.status = 'void'; s.voidReason = reason || s.voidRequest?.reason || ''; s.voidBy = by.name; s.voidTs = Date.now();
  store.put(sh, 'sales', s);
  audit(sh, by, 'sale_void', `Voided sale ${s.total} by ${s.userName}: ${s.voidReason}`);
}

r.post('/sales/:id/void-request', auth, need('sell'), (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || s.status !== 'ok') return err(res, 404, 'Sale not found');
  if (s.userId !== req.user.id || s.date !== today(sh)) return err(res, 403, 'You can only request voids for your own sales today');
  if (!String(req.body.reason || '').trim()) return err(res, 400, 'Give a reason');
  s.voidRequest = { ts: Date.now(), reason: req.body.reason.trim(), status: 'pending' }; store.put(sh, 'sales', s);
  audit(sh, req.user, 'void_request', `Requested void of sale ${s.total}: ${s.voidRequest.reason}`);
  alerts.notify(sh, 'void_request', `Void requested: sale of ${s.total}`, [`${req.user.name} asks to void a sale of ${s.total} (${s.receiptNo || 'no receipt number'}).`, `Items: ${s.items.map(i => `${i.qty} × ${i.name}`).join(', ')}.`, `Reason given: ${s.voidRequest.reason}`, 'Open the Sales page to approve or reject.']);
  res.json({ ok: true });
});
r.post('/sales/:id/void', auth, owner, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || s.status !== 'ok') return err(res, 404, 'Sale not found');
  if (s.voidRequest) s.voidRequest.status = 'approved';
  doVoid(sh, s, req.user, req.body.reason); res.json({ ok: true });
});
r.post('/sales/:id/void-reject', auth, owner, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || !s.voidRequest) return err(res, 404, 'No request');
  s.voidRequest.status = 'rejected'; store.put(sh, 'sales', s);
  audit(sh, req.user, 'void_reject', `Rejected void of sale ${s.total} by ${s.userName}`); res.json({ ok: true });
});

module.exports = r;
