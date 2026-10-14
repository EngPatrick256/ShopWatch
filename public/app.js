/* ShopWatch front-end (vanilla JS, no build step) */
const $ = s => document.querySelector(s);
const S = { token: localStorage.getItem('sw_token'), user: null, shop: 'ShopWatch', cur: 'UGX', codeReq: false, defTz: 3, page: null, products: [], cart: {}, q: '' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => S.cur + ' ' + Math.round(n || 0).toLocaleString();
const tracked = p => p.tracksStock !== false;
const fnum = n => (Math.round((n || 0) * 100) / 100).toLocaleString();
const dt = ts => new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const dayAgo = n => new Date(Date.now() - n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const todayStr = () => dayAgo(0);
const isOwner = () => S.user?.role === 'owner';

async function api(p, method = 'GET', body) {
  const r = await fetch('/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && S.token) { logout(true); throw new Error(j.error || 'Please log in again'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
function toast(msg, bad) {
  const d = document.createElement('div'); d.textContent = msg; if (bad) d.className = 'e';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 3500);
}
const run = async fn => { try { await fn(); } catch (e) { toast(e.message, true); } };
const closeModal = () => { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; };

function openForm(title, fields, submit, ok = 'Save', intro = '') {
  const inp = f => {
    const v = f.value ?? '';
    if (f.type === 'select') return `<select name="${f.name}">${f.options.map(o => { const val = o.v ?? o, t = o.t ?? o; return `<option value="${esc(val)}"${val == f.value ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea name="${f.name}" rows="2" ${f.required ? 'required' : ''}>${esc(v)}</textarea>`;
    return `<input name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(v)}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>`;
  };
  $('#modal').innerHTML = `<div class="modal-card"><h3>${esc(title)}</h3>${intro ? `<p class="muted">${intro}</p>` : ''}<form id="mf">${fields.map(f => `<label>${esc(f.label)}${inp(f)}</label>`).join('')}<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn">${esc(ok)}</button></div></form></div>`;
  $('#modal').classList.remove('hidden');
  $('#mf').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); try { await submit(d); closeModal(); } catch (err) { toast(err.message, true); } };
  const first = $('#mf input,#mf select'); if (first) first.focus();
}

/* ---------------- login / setup / shell ---------------- */
async function boot() {
  try { const st = await fetch('/api/status').then(r => r.json()); S.codeReq = st.codeRequired; S.defTz = st.defaultTz; } catch {}
  if (S.token) { try { const m = await api('/me'); S.user = m.user; S.shop = m.shopName; S.cur = m.currency; return shell(); } catch {} }
  loginView(false);
}
const TZS = [[-8, 'UTC-8 (US Pacific)'], [-5, 'UTC-5 (US East)'], [0, 'UTC+0 (UK, Ghana)'], [1, 'UTC+1 (Nigeria, Central Europe)'], [2, 'UTC+2 (South Africa, Egypt)'], [3, 'UTC+3 (Uganda, Kenya, Tanzania)'], [4, 'UTC+4 (UAE)'], [5.5, 'UTC+5:30 (India)'], [8, 'UTC+8 (China, Singapore)']];
function loginView(signup) {
  $('#app').innerHTML = `<div class="login"><div class="card"><h2>🏪 ShopWatch</h2><p class="muted">${signup ? 'Create your business account. You will be the owner and can add shopkeepers afterwards.' : 'Sign in to watch your shop.'}</p>
  <form id="lf">${signup ? `<label>Shop / business name<input name="shopName" required></label><label>Your full name<input name="name" required></label>
  <label>Currency (e.g. UGX, KES, USD)<input name="currency" value="UGX" maxlength="6" required></label>
  <label>Time zone<select name="tz">${TZS.map(([v, t]) => `<option value="${v}"${v === S.defTz ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
  ${S.codeReq ? '<label>Sign-up code<input name="code" required></label>' : ''}` : ''}
  <label>Username<input name="username" autocomplete="username" required ${signup ? 'placeholder="letters, numbers, . _ -"' : ''}></label>
  <label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 6 : 1}" required></label>
  <button class="btn big">${signup ? 'Create my shop' : 'Sign in'}</button></form>
  <p style="text-align:center;margin:14px 0 0"><a href="#" id="sw" style="color:var(--pri2);font-weight:600">${signup ? 'I already have an account' : 'New business? Create a shop account'}</a></p></div></div>`;
  $('#sw').onclick = e => { e.preventDefault(); loginView(!signup); };
  $('#lf').onsubmit = e => { e.preventDefault(); run(async () => {
    const d = Object.fromEntries(new FormData(e.target));
    const r = await api(signup ? '/signup' : '/login', 'POST', d);
    S.token = r.token; localStorage.setItem('sw_token', r.token); S.user = r.user;
    const m = await api('/me'); S.shop = m.shopName; S.cur = m.currency; shell();
  }); };
}
function logout(silent) {
  S.token = null; S.user = null; localStorage.removeItem('sw_token');
  if (!silent) toast('Signed out'); boot();
}
const NAV_OWNER = [['dashboard', 'Dashboard'], ['restock', 'Restock'], ['products', 'Products'], ['sales', 'Sales'], ['stocklog', 'Stock log'], ['expenses', 'Expenses'], ['closings', 'Cash closings'], ['debts', 'Debts'], ['reports', 'Reports'], ['audit', 'Audit trail'], ['settings', 'Staff & settings']];
const NAV_SHOP = [['pos', 'New sale'], ['sales', 'Today\'s sales'], ['products', 'Stock'], ['expenses', 'Expenses'], ['debts', 'Credit / debts'], ['closings', 'Close till'], ['account', 'Account']];
function shell() {
  const nav = isOwner() ? NAV_OWNER : NAV_SHOP;
  $('#app').innerHTML = `<header><div><b>🏪 ${esc(S.shop)}</b><small>${esc(S.user.name)} · ${isOwner() ? 'Owner' : 'Shopkeeper'}</small></div><button data-act="logout">Sign out</button></header>
  <nav>${nav.map(([k, l]) => `<button data-nav="${k}">${l}</button>`).join('')}</nav><main id="main"></main>`;
  go(nav[0][0]);
}
let refreshTimer;
async function go(page) {
  S.page = page; clearInterval(refreshTimer);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.nav === page));
  $('#main').innerHTML = '<p class="muted">Loading…</p>';
  try { await pages[page](); } catch (e) { $('#main').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  if (page === 'dashboard') refreshTimer = setInterval(() => S.page === 'dashboard' && pages.dashboard(), 60000);
}
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav);
  const b = e.target.closest('[data-act]'); if (b) run(async () => acts[b.dataset.act]?.(b.dataset, b));
});

/* ---------------- pages ---------------- */
const pages = {};

pages.dashboard = async () => {
  const d = await api('/dashboard'), t = d.today, max = Math.max(...d.days.map(x => x.total), 1);
  $('#main').innerHTML = `<h2>Overview</h2>
  ${d.alerts.length ? d.alerts.map(a => `<div class="alert ${a.level === 'bad' ? 'bad' : ''}" data-nav="${a.go}">${a.level === 'bad' ? '🚨' : '⚠️'} ${esc(a.text)}</div>`).join('') : '<div class="card good">✅ No warnings right now.</div>'}
  <div class="grid">
   <div class="stat"><span>Sales today</span><b>${money(t.total)}</b><small class="muted">${t.count} sale(s)</small></div>
   <div class="stat"><span>Profit today</span><b>${money(t.profit)}</b><small class="muted">before expenses</small></div>
   <div class="stat"><span>Cash · Mobile money · Credit</span><b style="font-size:15px">${money(t.cash)}<br>${money(t.momo)}<br>${money(t.credit)}</b></div>
   <div class="stat"><span>Expenses today</span><b>${money(t.expenses)}</b></div>
   <div class="stat"><span>Stock value (cost / retail)</span><b style="font-size:15px">${money(d.stockCost)}<br>${money(d.stockRetail)}</b></div>
   <div class="stat"><span>Customers owe you</span><b>${money(d.debts)}</b></div>
   <div class="stat"><span>Products / out of stock</span><b>${d.productCount} / <span class="${d.outOfStock ? 'badtxt' : ''}">${d.outOfStock}</span></b></div>
   <div class="stat"><span>Last till close</span><b style="font-size:15px">${d.lastClose ? dt(d.lastClose.ts) + '<br><span class="' + (d.lastClose.variance < 0 ? 'badtxt' : 'good') + '">variance ' + fnum(d.lastClose.variance) + '</span>' : 'Never'}</b></div>
  </div>
  <div class="two">
   <div class="card"><h3>Sales, last 7 days</h3><div class="bars">${d.days.map(x => `<div style="height:${Math.max(2, x.total / max * 100)}%"><span>${x.total ? Math.round(x.total / 1000) + 'k' : ''}</span><em>${x.date.slice(5)}</em></div>`).join('')}</div></div>
   <div class="card"><h3>Best sellers (7 days)</h3>${d.top.length ? `<table>${d.top.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${fnum(p.qty)} sold</td><td class="r">${money(p.revenue)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales yet.</p>'}</div>
  </div>
  <div class="two">
   <div class="card"><h3>Low / out of stock</h3>${d.low.length ? `<table><tr><th>Product</th><th class="r">Left</th><th class="r">Reorder at</th></tr>${d.low.map(p => `<tr><td>${esc(p.name)}</td><td class="r ${p.stock <= 0 ? 'badtxt' : ''}">${fnum(p.stock)} ${esc(p.unit)}</td><td class="r">${fnum(p.reorderLevel)}</td></tr>`).join('')}</table>` : '<p class="muted">Everything is above reorder level.</p>'}</div>
   <div class="card"><h3>Latest activity</h3><table>${d.activity.map(a => `<tr><td class="muted">${dt(a.ts)}</td><td><b>${esc(a.user)}</b> ${esc(a.detail)}</td></tr>`).join('')}</table></div>
  </div>`;
};

pages.restock = async () => {
  const l = await api('/restock');
  const total = l.reduce((a, p) => a + p.estCost, 0);
  S.shopList = 'Restock list - ' + S.shop + '\n' + l.map(p => `- ${p.name}: buy ${p.suggested} ${p.unit} (have ${fnum(p.stock)})`).join('\n');
  $('#main').innerHTML = `<h2>What to restock</h2><div class="card"><p class="muted">Products at/below reorder level, or expected to run out within 7 days based on the last 14 days of sales. Suggested quantity covers about 2 weeks.</p>
  ${l.length ? `<table><tr><th>Product</th><th class="r">In stock</th><th class="r">Reorder at</th><th class="r">Sells/day</th><th class="r">Days left</th><th class="r">Buy</th><th class="r">Est. cost</th></tr>
  ${l.map(p => `<tr><td>${esc(p.name)}</td><td class="r ${p.stock <= 0 ? 'badtxt' : ''}">${fnum(p.stock)}</td><td class="r">${fnum(p.reorderLevel)}</td><td class="r">${p.avgPerDay}</td><td class="r">${p.daysLeft ?? '-'}</td><td class="r"><b>${p.suggested} ${esc(p.unit)}</b></td><td class="r">${money(p.estCost)}</td></tr>`).join('')}
  <tr><td colspan="6" class="r"><b>Estimated total</b></td><td class="r"><b>${money(total)}</b></td></tr></table>
  <div class="row" style="margin-top:12px"><button class="btn" data-act="whatsapp">Send list via WhatsApp</button><button class="btn ghost" data-act="copyList">Copy list</button></div>` : '<p class="good">Nothing needs restocking right now 🎉</p>'}</div>`;
};

async function loadProducts() { S.products = await api('/products'); }
pages.products = async () => {
  await loadProducts();
  const own = isOwner();
  $('#main').innerHTML = `<h2>${own ? 'Products & stock' : 'Stock on hand'}</h2><div class="card">
  <div class="row grow" style="margin-bottom:10px"><input id="psearch" placeholder="Search products…" style="max-width:320px">
  <span style="flex:0 0 auto" class="row">${own ? '<button class="btn" data-act="addProduct">+ New product</button>' : ''}<button class="btn ghost" data-act="receive">📦 Receive stock</button><button class="btn ghost" data-act="count">🔢 Count stock</button></span></div>
  <div id="ptable"></div></div>`;
  const draw = () => {
    const q = $('#psearch').value.toLowerCase();
    const list = S.products.filter(p => (p.name + p.sku + p.category).toLowerCase().includes(q));
    $('#ptable').innerHTML = `<table><tr><th>Product</th><th>Category</th>${own ? '<th class="r">Cost</th>' : ''}<th class="r">Price</th><th class="r">Stock</th><th class="r">Reorder at</th><th></th></tr>
    ${list.map(p => `<tr style="${p.archived ? 'opacity:.5' : ''}"><td>${esc(p.name)}<br><small class="muted">${esc(p.sku)}</small></td><td>${esc(p.category)}</td>${own ? `<td class="r">${fnum(p.costPrice)}</td>` : ''}<td class="r">${fnum(p.price)}</td>
    <td class="r">${tracked(p) ? `<span class="pill ${p.stock <= 0 ? 'bad' : p.stock <= p.reorderLevel ? 'warn' : 'ok'}">${fnum(p.stock)} ${esc(p.unit)}</span>` : '<span class="pill">service</span>'}</td><td class="r">${tracked(p) ? fnum(p.reorderLevel) : '-'}</td>
    <td class="r">${own ? `<button class="btn sm ghost" data-act="editProduct" data-id="${p.id}">Edit</button> <button class="btn sm ghost" data-act="archive" data-id="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No products yet.</td></tr>'}</table>`;
  };
  $('#psearch').oninput = draw; draw();
};

pages.pos = async () => {
  await loadProducts(); S.cart = {};
  $('#main').innerHTML = `<h2>New sale</h2><div class="pos"><div class="card"><input id="q" placeholder="🔍 Search product…" autofocus><div class="plist" id="plist"></div></div>
  <div class="card"><h3>Current sale</h3><div id="cart"></div></div></div>`;
  $('#q').oninput = drawList; drawList(); drawCart();
};
function drawList() {
  const q = ($('#q')?.value || '').toLowerCase();
  const l = S.products.filter(p => !p.archived && (p.name + p.sku + p.category).toLowerCase().includes(q));
  $('#plist').innerHTML = l.map(p => `<div class="pitem ${tracked(p) && p.stock <= 0 ? 'out' : ''}"><div><b>${esc(p.name)}</b><br><small class="muted">${fnum(p.price)} · ${tracked(p) ? fnum(p.stock) + ' ' + esc(p.unit) + ' left' : 'service'}</small></div><button class="btn sm" ${tracked(p) && p.stock <= 0 ? 'disabled' : ''} data-act="addCart" data-id="${p.id}">Add</button></div>`).join('') || '<p class="muted">No products found.</p>';
}
function drawCart() {
  const ids = Object.keys(S.cart);
  const total = ids.reduce((a, id) => a + S.cart[id] * S.products.find(p => p.id === id).price, 0);
  $('#cart').innerHTML = ids.length ? `<table>${ids.map(id => { const p = S.products.find(x => x.id === id); return `<tr><td>${esc(p.name)}<br><small class="muted">${fnum(p.price)}</small></td><td><input class="qty" type="number" step="any" min="0" value="${S.cart[id]}" data-cartqty="${id}"></td><td class="r">${fnum(S.cart[id] * p.price)}</td><td><button class="btn sm ghost" data-act="rmCart" data-id="${id}">✕</button></td></tr>`; }).join('')}</table>
  <div class="total">Total: ${money(total)}</div>
  <label>Payment method<select id="pay"><option value="cash">Cash</option><option value="momo">Mobile money</option><option value="credit">Credit (customer pays later)</option></select></label>
  <label id="custl" class="hidden">Customer name<input id="cust"></label>
  <button class="btn big" data-act="completeSale">Complete sale</button>` : '<p class="muted">Tap “Add” on a product to start a sale.</p>';
  const pay = $('#pay'); if (pay) pay.onchange = () => $('#custl').classList.toggle('hidden', pay.value !== 'credit');
  document.querySelectorAll('[data-cartqty]').forEach(i => i.onchange = () => { const v = Number(i.value); if (v > 0) S.cart[i.dataset.cartqty] = v; else delete S.cart[i.dataset.cartqty]; drawCart(); });
}

pages.sales = async () => {
  const own = isOwner(), from = S.from || todayStr(), to = S.to || todayStr();
  const l = await api(`/sales?from=${from}&to=${to}`);
  const ok = l.filter(s => s.status === 'ok');
  $('#main').innerHTML = `<h2>${own ? 'Sales' : 'Today\'s sales'}</h2><div class="card">
  ${own ? `<div class="row" style="margin-bottom:10px"><label style="margin:0">From<input type="date" id="f" value="${from}"></label><label style="margin:0">To<input type="date" id="t" value="${to}"></label><button class="btn" data-act="filter" style="margin-top:18px">Show</button></div>` : ''}
  <p><b>${ok.length}</b> sale(s) · total <b>${money(ok.reduce((a, s) => a + s.total, 0))}</b></p>
  <table><tr><th>Time</th><th>Sold by</th><th>Items</th><th>Payment</th><th class="r">Total</th><th></th></tr>
  ${l.map(s => `<tr style="${s.status === 'void' ? 'opacity:.55' : ''}"><td>${dt(s.ts)}</td><td>${esc(s.userName)}</td><td>${s.items.map(i => `${fnum(i.qty)}× ${esc(i.name)}`).join(', ')}</td>
  <td>${esc(s.payment)}${s.customer ? '<br><small>' + esc(s.customer) + '</small>' : ''}</td><td class="r">${fnum(s.total)}</td>
  <td>${s.status === 'void' ? `<span class="pill bad">VOID</span><br><small>${esc(s.voidReason || '')}</small>` :
    s.voidRequest?.status === 'pending' ? `<span class="pill warn">Void requested</span><br><small>${esc(s.voidRequest.reason)}</small>${own ? `<br><button class="btn sm bad" data-act="voidOk" data-id="${s.id}">Approve</button> <button class="btn sm ghost" data-act="voidNo" data-id="${s.id}">Reject</button>` : ''}` :
    own ? `<button class="btn sm ghost" data-act="voidNow" data-id="${s.id}">Void</button>` : (s.userId === S.user.id ? `<button class="btn sm ghost" data-act="voidReq" data-id="${s.id}">Request void</button>` : '')}${s.voidRequest?.status === 'rejected' ? ' <span class="pill">void rejected</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No sales in this period.</td></tr>'}</table></div>`;
};

pages.stocklog = async () => {
  const l = await api('/stock/moves');
  $('#main').innerHTML = `<h2>Stock log</h2><div class="card"><p class="muted">Every stock received and every physical count. Red rows are shortages found during counts, which is the best way to catch unrecorded sales or theft.</p>
  <table><tr><th>Time</th><th>Type</th><th>Product</th><th class="r">Change</th><th class="r">Before → After</th><th>By</th><th>Note</th></tr>
  ${l.map(m => `<tr style="${m.type === 'count' && m.qty < 0 ? 'background:#fef2f2' : ''}"><td>${dt(m.ts)}</td><td>${m.type === 'in' ? '📦 Received' : '🔢 Count'}</td><td>${esc(m.name)}</td><td class="r ${m.qty < 0 ? 'badtxt' : ''}">${m.qty > 0 ? '+' : ''}${fnum(m.qty)}</td><td class="r">${fnum(m.before)} → ${fnum(m.after)}</td><td>${esc(m.by)}</td><td>${esc(m.supplier ? m.supplier + '. ' : '')}${esc(m.note || '')}${m.valueLost ? ` <b>(lost ${money(m.valueLost)})</b>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nothing yet.</td></tr>'}</table></div>`;
};

pages.expenses = async () => {
  const own = isOwner(), from = S.efrom || (own ? dayAgo(6) : todayStr()), to = S.eto || todayStr();
  const l = await api(`/expenses?from=${from}&to=${to}`);
  $('#main').innerHTML = `<h2>Expenses</h2><div class="card"><div class="row"><button class="btn" data-act="addExpense">+ Record expense</button>
  ${own ? `<label style="margin:0 0 0 auto">From<input type="date" id="f" value="${from}"></label><label style="margin:0">To<input type="date" id="t" value="${to}"></label><button class="btn ghost" data-act="filterExp" style="margin-top:18px">Show</button>` : ''}</div>
  <p>Total: <b>${money(l.reduce((a, e) => a + e.amount, 0))}</b></p>
  <table><tr><th>Time</th><th>Category</th><th>Details</th><th>By</th><th class="r">Amount</th></tr>${l.map(e => `<tr><td>${dt(e.ts)}</td><td>${esc(e.category)}</td><td>${esc(e.note)}</td><td>${esc(e.by)}</td><td class="r">${fnum(e.amount)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No expenses.</td></tr>'}</table></div>`;
};

pages.debts = async () => {
  const l = await api('/debts');
  $('#main').innerHTML = `<h2>Credit / debts</h2><div class="card"><p>Total owed: <b>${money(l.reduce((a, d) => a + d.balance, 0))}</b></p>
  <table><tr><th>Date</th><th>Customer</th><th>Sold by</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr>
  ${l.map(d => `<tr><td>${dt(d.ts)}</td><td>${esc(d.customer)}</td><td>${esc(d.by)}</td><td class="r">${fnum(d.total)}</td><td class="r">${fnum(d.paid)}</td><td class="r"><b>${fnum(d.balance)}</b></td><td><button class="btn sm" data-act="payDebt" data-id="${d.id}" data-bal="${d.balance}">Record payment</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nobody owes you anything.</td></tr>'}</table></div>`;
};

pages.closings = async () => {
  const own = isOwner(), [c, list] = await Promise.all([api('/closing/today'), api('/closings')]);
  $('#main').innerHTML = `<h2>${own ? 'Cash closings' : 'Close the till'}</h2>
  <div class="card"><h3>Close till now</h3><p class="muted">Counts everything since the last close${c.sinceDate ? ' (' + dt(c.sinceDate) + ')' : ''}. Count the physical cash and enter it. ${own ? '' : 'The expected amount is shown to the owner only, so count honestly.'}</p>
  ${own ? `<table><tr><td>Float from last close</td><td class="r">${fnum(c.opening)}</td></tr><tr><td>+ Cash sales</td><td class="r">${fnum(c.cashSales)}</td></tr><tr><td>+ Cash debt payments</td><td class="r">${fnum(c.debtCash)}</td></tr><tr><td>− Expenses paid</td><td class="r">${fnum(c.expenses)}</td></tr><tr><td><b>Expected cash in till</b></td><td class="r"><b>${fnum(c.expectedCash)}</b></td></tr><tr><td>Expected mobile money received</td><td class="r">${fnum(c.expectedMomo)}</td></tr><tr><td class="muted">Credit given (not cash)</td><td class="r muted">${fnum(c.creditGiven)}</td></tr></table><br>` : `<p>${c.salesCount} sale(s) recorded since last close.</p>`}
  <button class="btn" data-act="closeTill">Count & close till</button></div>
  <div class="card"><h3>History</h3><table><tr><th>Closed</th><th>By</th>${own ? '<th class="r">Expected</th><th class="r">Counted</th><th class="r">Variance</th><th class="r">MoMo var.</th>' : '<th class="r">Counted</th>'}<th class="r">Handed over</th>${own ? '<th>Note</th>' : ''}</tr>
  ${list.map(x => `<tr><td>${dt(x.ts)}</td><td>${esc(x.userName)}</td>${own ? `<td class="r">${fnum(x.expectedCash)}</td><td class="r">${fnum(x.countedCash)}</td><td class="r ${x.variance < 0 ? 'badtxt' : x.variance > 0 ? 'good' : ''}">${x.variance > 0 ? '+' : ''}${fnum(x.variance)}</td><td class="r ${x.momoVariance < 0 ? 'badtxt' : ''}">${x.momoVariance == null ? '-' : fnum(x.momoVariance)}</td>` : `<td class="r">${fnum(x.countedCash)}</td>`}<td class="r">${fnum(x.handedOver)}</td>${own ? `<td>${esc(x.note)}</td>` : ''}</tr>`).join('') || '<tr><td colspan="8" class="muted">No closings yet.</td></tr>'}</table></div>`;
};

pages.reports = async () => {
  const from = S.rfrom || dayAgo(6), to = S.rto || todayStr();
  const r = await api(`/reports?from=${from}&to=${to}`), t = r.totals;
  S.report = r;
  $('#main').innerHTML = `<h2>Reports</h2><div class="card"><div class="row"><label style="margin:0">From<input type="date" id="f" value="${from}"></label><label style="margin:0">To<input type="date" id="t" value="${to}"></label><button class="btn" data-act="filterRep" style="margin-top:18px">Show</button><button class="btn ghost" data-act="csvDay" style="margin-top:18px">Download daily CSV</button><button class="btn ghost" data-act="csvProd" style="margin-top:18px">Download products CSV</button></div></div>
  <div class="grid"><div class="stat"><span>Sales</span><b>${money(t.sales)}</b></div><div class="stat"><span>Gross profit</span><b>${money(t.profit)}</b></div><div class="stat"><span>Expenses</span><b>${money(t.expenses)}</b></div><div class="stat"><span>Net profit</span><b class="${t.net < 0 ? 'badtxt' : 'good'}">${money(t.net)}</b></div></div>
  <div class="two"><div class="card"><h3>By day</h3><table><tr><th>Date</th><th class="r">Sales</th><th class="r">Profit</th><th class="r">Expenses</th></tr>${r.byDay.map(d => `<tr><td>${d.date}</td><td class="r">${fnum(d.sales)}</td><td class="r">${fnum(d.profit)}</td><td class="r">${fnum(d.expenses)}</td></tr>`).join('')}</table></div>
  <div class="card"><h3>By product</h3><table><tr><th>Product</th><th class="r">Qty</th><th class="r">Revenue</th><th class="r">Profit</th></tr>${r.byProduct.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${fnum(p.qty)}</td><td class="r">${fnum(p.revenue)}</td><td class="r">${fnum(p.profit)}</td></tr>`).join('')}</table></div></div>`;
};

pages.audit = async () => {
  const l = await api('/audit?limit=400');
  $('#main').innerHTML = `<h2>Audit trail</h2><div class="card"><p class="muted">Everything done in the system, including failed logins. Nobody (even you) can edit this log.</p><table><tr><th>Time</th><th>Who</th><th>Action</th><th>Details</th></tr>${l.map(a => `<tr><td>${dt(a.ts)}</td><td>${esc(a.user)}</td><td><span class="pill ${/fail|void|reject/.test(a.action) ? 'bad' : ''}">${esc(a.action)}</span></td><td>${esc(a.detail)}</td></tr>`).join('')}</table></div>`;
};

pages.settings = async () => {
  const u = await api('/users');
  $('#main').innerHTML = `<h2>Staff & settings</h2><div class="card"><div class="row"><h3 style="margin:0">Staff accounts</h3><button class="btn sm" data-act="addUser" style="margin-left:auto">+ Add shopkeeper</button></div>
  <table><tr><th>Name</th><th>Username</th><th>Role</th><th>Last login</th><th>Last sale</th><th></th></tr>${u.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.username)}</td><td>${x.role}${x.active ? '' : ' <span class="pill bad">disabled</span>'}</td><td>${x.lastLogin ? dt(x.lastLogin) : '-'}</td><td>${x.lastSale ? dt(x.lastSale) : '-'}</td>
  <td class="r">${x.role !== 'owner' ? `<button class="btn sm ghost" data-act="toggleUser" data-id="${x.id}" data-active="${x.active}">${x.active ? 'Disable' : 'Enable'}</button> <button class="btn sm ghost" data-act="resetPw" data-id="${x.id}">Reset password</button>` : ''}</td></tr>`).join('')}</table></div>
  <div class="two"><div class="card"><h3>Shop</h3><div class="row"><button class="btn ghost" data-act="shopName">Shop name & currency</button><button class="btn ghost" data-act="myPw">Change my password</button></div></div>
  <div class="card"><h3>Backup</h3><p class="muted">Download a backup regularly (weekly at least). Free hosts can wipe files, so keep a copy on your phone/computer.</p><div class="row"><button class="btn" data-act="backup">Download backup</button><label class="btn ghost" style="margin:0;cursor:pointer">Restore from file<input type="file" id="rf" accept=".json" class="hidden"></label></div></div></div>`;
  $('#rf').onchange = e => run(async () => {
    const f = e.target.files[0]; if (!f || !confirm('This replaces ALL current data with the backup. Continue?')) return;
    await api('/restore', 'POST', JSON.parse(await f.text())); toast('Restored. Please sign in again.'); logout(true);
  });
};
pages.account = async () => {
  $('#main').innerHTML = `<h2>My account</h2><div class="card"><p>Signed in as <b>${esc(S.user.name)}</b> (${esc(S.user.username)})</p><button class="btn" data-act="myPw">Change my password</button></div>`;
};

/* ---------------- actions ---------------- */
const CATS = ['Transport', 'Rent', 'Electricity / Water', 'Airtime / Data', 'Supplies', 'Staff / Wages', 'Owner withdrawal', 'Other'];
const productFields = (p = {}) => [
  { name: 'name', label: 'Product name', value: p.name, required: 1 }, { name: 'sku', label: 'Code / barcode (optional)', value: p.sku },
  { name: 'category', label: 'Category', value: p.category || 'General' }, { name: 'unit', label: 'Unit (pcs, kg, litre…)', value: p.unit || 'pcs' },
  { name: 'costPrice', label: 'Buying (cost) price', type: 'number', value: p.costPrice ?? '', required: 1, min: 0 }, { name: 'price', label: 'Selling price', type: 'number', value: p.price ?? '', required: 1, min: 0 },
  { name: 'tracksStock', label: 'Count stock for this item?', type: 'select', options: [{ v: 'yes', t: 'Yes, a physical item' }, { v: 'no', t: 'No, a service (e.g. tailoring, printing)' }], value: p.tracksStock === false ? 'no' : 'yes' },
  ...(p.id ? [] : [{ name: 'stock', label: 'Opening stock (ignored for services)', type: 'number', value: 0, min: 0 }]),
  { name: 'reorderLevel', label: 'Reorder level (warn when stock reaches this)', type: 'number', value: p.reorderLevel ?? 5, min: 0 },
];
const prodOpts = () => S.products.filter(p => !p.archived && tracked(p)).map(p => ({ v: p.id, t: `${p.name} (${fnum(p.stock)} ${p.unit})` }));
const reload = () => go(S.page);

const acts = {
  closeModal, logout: () => logout(),
  addProduct: () => openForm('New product', productFields(), async d => { await api('/products', 'POST', d); toast('Product added'); reload(); }),
  editProduct: ({ id }) => { const p = S.products.find(x => x.id === id); openForm('Edit product', productFields(p), async d => { await api('/products/' + id, 'PUT', d); toast('Saved'); reload(); }); },
  archive: async ({ id }) => { const p = S.products.find(x => x.id === id); await api('/products/' + id, 'PUT', { archived: !p.archived }); reload(); },
  receive: () => { if (!S.products.some(p => !p.archived && tracked(p))) return toast('Add a product that counts stock first', true); openForm('Receive stock', [{ name: 'productId', label: 'Product', type: 'select', options: prodOpts() }, { name: 'qty', label: 'Quantity received', type: 'number', required: 1, min: 0 }, { name: 'supplier', label: 'Supplier' }, ...(isOwner() ? [{ name: 'costPrice', label: 'New cost price per unit (optional)', type: 'number' }] : []), { name: 'note', label: 'Note (invoice no. etc.)' }], async d => { await api('/stock/in', 'POST', d); toast('Stock updated'); reload(); }, 'Add to stock'); },
  count: () => { if (!S.products.some(p => !p.archived && tracked(p))) return toast('Add a product that counts stock first', true); openForm('Count stock', [{ name: 'productId', label: 'Product', type: 'select', options: prodOpts() }, { name: 'counted', label: 'Physical count on the shelf', type: 'number', required: 1, min: 0 }, { name: 'reason', label: 'Reason if different (damaged, expired, miscount…)' }], async d => { await api('/stock/count', 'POST', d); toast('Count recorded'); reload(); }, 'Record count', 'Count what is physically on the shelf. If it differs from the system, a reason is required and the owner will see it.'); },
  addCart: ({ id }) => { const p = S.products.find(x => x.id === id); const n = (S.cart[id] || 0) + 1; if (tracked(p) && n > p.stock) return toast(`Only ${p.stock} in stock`, true); S.cart[id] = n; drawCart(); },
  rmCart: ({ id }) => { delete S.cart[id]; drawCart(); },
  completeSale: async () => {
    const items = Object.entries(S.cart).map(([productId, qty]) => ({ productId, qty }));
    const s = await api('/sales', 'POST', { items, payment: $('#pay').value, customer: $('#cust')?.value });
    toast('Sale recorded: ' + money(s.total)); S.cart = {}; await loadProducts(); drawList(); drawCart();
  },
  filter: () => { S.from = $('#f').value; S.to = $('#t').value; reload(); },
  filterExp: () => { S.efrom = $('#f').value; S.eto = $('#t').value; reload(); },
  filterRep: () => { S.rfrom = $('#f').value; S.rto = $('#t').value; reload(); },
  voidReq: ({ id }) => openForm('Request void', [{ name: 'reason', label: 'Why should this sale be voided?', type: 'textarea', required: 1 }], async d => { await api(`/sales/${id}/void-request`, 'POST', d); toast('Request sent to owner'); reload(); }, 'Send request'),
  voidNow: ({ id }) => openForm('Void this sale', [{ name: 'reason', label: 'Reason', type: 'textarea', required: 1 }], async d => { await api(`/sales/${id}/void`, 'POST', d); toast('Sale voided, stock returned'); reload(); }, 'Void sale', 'Stock will be returned to the shelf.'),
  voidOk: async ({ id }) => { if (confirm('Approve void? Stock will be returned.')) { await api(`/sales/${id}/void`, 'POST', {}); reload(); } },
  voidNo: async ({ id }) => { await api(`/sales/${id}/void-reject`, 'POST'); reload(); },
  addExpense: () => openForm('Record expense', [{ name: 'category', label: 'Category', type: 'select', options: CATS }, { name: 'amount', label: 'Amount', type: 'number', required: 1, min: 0 }, { name: 'note', label: 'What was it for?', required: 1 }], async d => { await api('/expenses', 'POST', d); toast('Expense recorded'); reload(); }),
  payDebt: ({ id, bal }) => openForm('Record debt payment', [{ name: 'amount', label: 'Amount paid (balance ' + fnum(bal) + ')', type: 'number', value: bal, required: 1, min: 0 }, { name: 'method', label: 'Paid by', type: 'select', options: [{ v: 'cash', t: 'Cash' }, { v: 'momo', t: 'Mobile money' }] }], async d => { await api(`/sales/${id}/pay`, 'POST', d); toast('Payment recorded'); reload(); }),
  closeTill: () => openForm('Count & close till', [{ name: 'countedCash', label: 'Cash counted in the till now', type: 'number', required: 1, min: 0 }, { name: 'handedOver', label: 'Cash handed over to owner (leave 0 if none)', type: 'number', value: 0, min: 0 }, { name: 'momoCounted', label: 'Mobile money received (check phone, optional)', type: 'number' }, { name: 'note', label: 'Note' }], async d => {
    const r = await api('/closing', 'POST', d);
    toast(r.variance === 0 ? 'Till closed. Cash balanced ✔' : `Till closed. Variance: ${fnum(r.variance)}`, r.variance < 0); reload();
  }, 'Close till'),
  addUser: () => openForm('Add shopkeeper', [{ name: 'name', label: 'Full name', required: 1 }, { name: 'username', label: 'Username', required: 1 }, { name: 'password', label: 'Password (min 6)', type: 'password', required: 1 }], async d => { await api('/users', 'POST', d); toast('Shopkeeper added'); reload(); }),
  toggleUser: async ({ id, active }) => { await api('/users/' + id, 'PATCH', { active: active !== 'true' }); reload(); },
  resetPw: ({ id }) => openForm('Reset password', [{ name: 'password', label: 'New password (min 6)', type: 'password', required: 1 }], async d => { await api('/users/' + id, 'PATCH', d); toast('Password reset'); }),
  shopName: () => openForm('Shop settings', [{ name: 'shopName', label: 'Shop name', value: S.shop, required: 1 }, { name: 'currency', label: 'Currency', value: S.cur, required: 1 }], async d => { await api('/settings', 'POST', d); S.shop = d.shopName; S.cur = d.currency.toUpperCase(); shell(); }),
  myPw: () => openForm('Change my password', [{ name: 'current', label: 'Current password', type: 'password', required: 1 }, { name: 'password', label: 'New password (min 6)', type: 'password', required: 1 }], async d => { await api('/me/password', 'POST', d); toast('Password changed'); }),
  backup: async () => {
    const r = await fetch('/api/backup', { headers: { Authorization: 'Bearer ' + S.token } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `shopwatch-backup-${todayStr()}.json`; a.click();
  },
  whatsapp: () => window.open('https://wa.me/?text=' + encodeURIComponent(S.shopList), '_blank'),
  copyList: async () => { await navigator.clipboard.writeText(S.shopList); toast('Copied'); },
  csvDay: () => csv('daily', ['date', 'sales', 'profit', 'expenses', 'count'], S.report.byDay),
  csvProd: () => csv('products', ['name', 'qty', 'revenue', 'profit'], S.report.byProduct),
};
function csv(name, cols, rows) {
  const t = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = `shopwatch-${name}-${S.report.from}_to_${S.report.to}.csv`; a.click();
}

boot();
