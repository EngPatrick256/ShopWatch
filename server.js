// ShopWatch v2 - multi-business shop monitoring.
// Many businesses share one app; every shop's data is separate (tenant = shop).
// Storage: PostgreSQL when DATABASE_URL is set (use a free Neon/Supabase DB when hosting),
// otherwise an embedded Postgres (PGlite) kept in ./data/pgdata for local use.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_KEY = process.env.ADMIN_KEY || '';       // enables /admin.html
const SIGNUP_CODE = process.env.SIGNUP_CODE || '';   // if set, new shops need this code
const DEFAULT_TZ = Number(process.env.TZ_OFFSET_HOURS ?? 3);

/* ===================== storage layer ===================== */
let pool = null, lite = null;
const q = (sql, p = []) => (pool ? pool.query(sql, p) : lite.query(sql, p));
async function initDb() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    console.log('Database: PostgreSQL (DATABASE_URL)');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    lite = new PGlite(path.join(DATA_DIR, 'pgdata'));
    await lite.waitReady;
    console.log('Database: local embedded Postgres in ' + path.join(DATA_DIR, 'pgdata'));
  }
  await q(`CREATE TABLE IF NOT EXISTS records(
    shop_id text NOT NULL, coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
    PRIMARY KEY (shop_id, coll, id))`);
}

const COLLS = ['users', 'products', 'sales', 'payments', 'moves', 'expenses', 'closings', 'audit'];
const shops = new Map();        // shopId -> shop (all data in memory, written through to SQL)
const userIndex = new Map();    // username -> shopId (usernames are unique across the platform)
const newShop = id => ({ id, meta: null, users: [], products: [], sales: [], payments: [], moves: [], expenses: [], closings: [], audit: [] });
let SECRET = process.env.JWT_SECRET || '';

let chain = Promise.resolve();
const enqueue = fn => (chain = chain.then(fn).catch(e => console.error('DB write failed:', e.message)));
const UP = 'INSERT INTO records(shop_id,coll,id,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT (shop_id,coll,id) DO UPDATE SET data=EXCLUDED.data';
const put = (sh, coll, o) => enqueue(() => q(UP, [sh.id, coll, o.id, JSON.stringify(o)]));
const add = (sh, coll, o) => { sh[coll].push(o); put(sh, coll, o); return o; };
const drop = (sh, coll, id) => enqueue(() => q('DELETE FROM records WHERE shop_id=$1 AND coll=$2 AND id=$3', [sh.id, coll, id]));
const putMeta = sh => put(sh, 'meta', sh.meta);

async function loadAll() {
  const { rows } = await q('SELECT shop_id, coll, id, data FROM records');
  for (const r of rows) {
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (r.shop_id === '_sys') { if (r.id === 'secret' && !SECRET) SECRET = d.v; continue; }
    let sh = shops.get(r.shop_id);
    if (!sh) shops.set(r.shop_id, (sh = newShop(r.shop_id)));
    if (r.coll === 'meta') sh.meta = d; else if (sh[r.coll]) sh[r.coll].push(d);
  }
  for (const [id, sh] of shops) {
    if (!sh.meta) { shops.delete(id); continue; }
    for (const c of COLLS) sh[c].sort((a, b) => (a.ts || a.created || 0) - (b.ts || b.created || 0));
    sh.users.forEach(u => userIndex.set(u.username, sh.id));
  }
  if (!SECRET) {
    SECRET = crypto.randomBytes(32).toString('hex');
    await q(UP, ['_sys', 'sys', 'secret', JSON.stringify({ id: 'secret', v: SECRET })]);
  }
}

/* ===================== helpers ===================== */
const uid = () => crypto.randomBytes(9).toString('base64url');
const dk = (sh, ts) => new Date(ts + sh.meta.tz * 3600e3).toISOString().slice(0, 10);
const today = sh => dk(sh, Date.now());
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
const r2 = n => Math.round(n * 100) / 100;
const saleProfit = s => sum(s.items, i => (i.price - i.cost) * i.qty);
const tracked = p => p.tracksStock !== false;
const pub = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, lastLogin: u.lastLogin });
const sign = (u, sh) => jwt.sign({ id: u.id, shop: sh.id }, SECRET, { expiresIn: '14d' });
const err = (res, code, msg) => res.status(code).json({ error: msg });
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function audit(sh, u, action, detail) {
  add(sh, 'audit', { id: uid(), ts: Date.now(), userId: u?.id, user: u?.name || 'system', role: u?.role, action, detail });
  if (sh.audit.length > 6000) sh.audit.splice(0, 1000).forEach(a => drop(sh, 'audit', a.id));
}
const shopInfo = sh => ({ shopName: sh.meta.name, currency: sh.meta.currency, tz: sh.meta.tz });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ===================== auth & signup ===================== */
function auth(req, res, next) {
  try {
    const { id, shop } = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    const sh = shops.get(shop), u = sh?.users.find(x => x.id === id && x.active);
    if (!u) return err(res, 401, 'Session expired');
    if (sh.meta.active === false) return err(res, 403, 'This shop account is suspended. Contact the administrator.');
    req.user = u; req.sh = sh; next();
  } catch { err(res, 401, 'Please log in'); }
}
const owner = (req, res, next) => (req.user.role === 'owner' ? next() : err(res, 403, 'Owner only'));

const hits = {};
function limited(key, max, ms) {
  const n = Date.now(), e = hits[key];
  if (!e || n - e.t > ms) { hits[key] = { n: 1, t: n }; return false; }
  return ++e.n > max;
}

app.get('/api/status', (q_, r) => r.json({ codeRequired: !!SIGNUP_CODE, defaultTz: DEFAULT_TZ }));

app.post('/api/signup', h(async (req, res) => {
  if (limited('signup|' + req.ip, 6, 3600e3)) return err(res, 429, 'Too many sign-ups from this connection. Try later.');
  const { shopName, name, username, password, currency, tz, code } = req.body || {};
  if (SIGNUP_CODE && code !== SIGNUP_CODE) return err(res, 403, 'Wrong sign-up code');
  const un = String(username || '').toLowerCase().trim();
  if (!shopName?.trim() || !name?.trim()) return err(res, 400, 'Shop name and your name are required');
  if (!/^[a-z0-9._@-]{3,40}$/.test(un)) return err(res, 400, 'Username: 3-40 letters, numbers or . _ @ - (no spaces)');
  if (!password || password.length < 6) return err(res, 400, 'Password must be at least 6 characters');
  if (userIndex.has(un)) return err(res, 400, 'That username is taken. Try another one.');
  const tzn = Number(tz ?? DEFAULT_TZ);
  const sh = newShop(uid());
  sh.meta = { id: 'meta', name: shopName.trim().slice(0, 80), currency: String(currency || 'UGX').trim().toUpperCase().slice(0, 6) || 'UGX', tz: tzn >= -12 && tzn <= 14 ? tzn : DEFAULT_TZ, created: Date.now(), active: true };
  const u = { id: uid(), name: name.trim().slice(0, 80), username: un, hash: await bcrypt.hash(password, 10), role: 'owner', active: true, created: Date.now() };
  shops.set(sh.id, sh); userIndex.set(un, sh.id);
  putMeta(sh); add(sh, 'users', u); audit(sh, u, 'setup', 'Shop created');
  res.json({ token: sign(u, sh), user: pub(u) });
}));

app.post('/api/login', h(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const un = String(username).toLowerCase().trim(), key = 'login|' + req.ip + '|' + un;
  if (limited(key, 8, 15 * 60e3)) return err(res, 429, 'Too many attempts. Try again in 15 minutes.');
  const sh = shops.get(userIndex.get(un)), u = sh?.users.find(x => x.username === un);
  if (!u || !u.active || !(await bcrypt.compare(String(password), u.hash))) {
    if (sh) audit(sh, null, 'login_failed', `Failed login for "${un}"`);
    return err(res, 400, 'Wrong username or password');
  }
  if (sh.meta.active === false) return err(res, 403, 'This shop account is suspended. Contact the administrator.');
  delete hits[key];
  u.lastLogin = Date.now(); put(sh, 'users', u); audit(sh, u, 'login', 'Logged in');
  res.json({ token: sign(u, sh), user: pub(u) });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: pub(req.user), ...shopInfo(req.sh) }));

app.post('/api/me/password', auth, h(async (req, res) => {
  const { current, password } = req.body || {};
  if (!(await bcrypt.compare(String(current || ''), req.user.hash))) return err(res, 400, 'Current password is wrong');
  if (!password || password.length < 6) return err(res, 400, 'New password must be at least 6 characters');
  req.user.hash = await bcrypt.hash(password, 10); put(req.sh, 'users', req.user);
  audit(req.sh, req.user, 'password_change', 'Changed own password'); res.json({ ok: true });
}));

/* ===================== staff & settings ===================== */
app.get('/api/users', auth, owner, (req, res) => {
  res.json(req.sh.users.map(u => ({ ...pub(u), lastSale: [...req.sh.sales].reverse().find(s => s.userId === u.id)?.ts })));
});
app.post('/api/users', auth, owner, h(async (req, res) => {
  const { name, username, password } = req.body || {};
  const un = String(username || '').toLowerCase().trim();
  if (!name?.trim() || !password || password.length < 6) return err(res, 400, 'Fill all fields (password at least 6 characters)');
  if (!/^[a-z0-9._@-]{3,40}$/.test(un)) return err(res, 400, 'Username: 3-40 letters, numbers or . _ @ - (no spaces)');
  if (userIndex.has(un)) return err(res, 400, 'Username already taken. Try adding your shop name, e.g. sam.' + req.sh.meta.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10));
  const u = { id: uid(), name: name.trim(), username: un, hash: await bcrypt.hash(password, 10), role: 'shopkeeper', active: true, created: Date.now() };
  add(req.sh, 'users', u); userIndex.set(un, req.sh.id);
  audit(req.sh, req.user, 'user_add', `Added shopkeeper ${u.name}`); res.json(pub(u));
}));
app.patch('/api/users/:id', auth, owner, h(async (req, res) => {
  const sh = req.sh, u = sh.users.find(x => x.id === req.params.id);
  if (!u) return err(res, 404, 'Not found');
  if (u.role === 'owner' && req.body.active === false) return err(res, 400, 'Cannot deactivate the owner');
  if (typeof req.body.active === 'boolean') { u.active = req.body.active; audit(sh, req.user, 'user_status', `${u.name} ${u.active ? 'activated' : 'deactivated'}`); }
  if (req.body.password) {
    if (req.body.password.length < 6) return err(res, 400, 'Password too short');
    u.hash = await bcrypt.hash(req.body.password, 10); audit(sh, req.user, 'user_password', `Reset password for ${u.name}`);
  }
  put(sh, 'users', u); res.json(pub(u));
}));
app.post('/api/settings', auth, owner, (req, res) => {
  const b = req.body || {};
  if (b.shopName) req.sh.meta.name = String(b.shopName).trim().slice(0, 80);
  if (b.currency) req.sh.meta.currency = String(b.currency).trim().toUpperCase().slice(0, 6);
  putMeta(req.sh); audit(req.sh, req.user, 'settings', 'Updated shop settings'); res.json({ ok: true });
});

/* ===================== products ===================== */
const strip = (p, u) => { if (u.role === 'owner') return p; const { costPrice, ...r } = p; return r; };
app.get('/api/products', auth, (req, res) => res.json(req.sh.products.filter(p => req.user.role === 'owner' || !p.archived).map(p => strip(p, req.user))));

app.post('/api/products', auth, owner, (req, res) => {
  const b = req.body || {}, sh = req.sh;
  const price = Number(b.price), cost = Number(b.costPrice || 0), rl = Number(b.reorderLevel || 0);
  const track = b.tracksStock !== 'no' && b.tracksStock !== false;
  const stock = track ? Number(b.stock || 0) : 0;
  if (!b.name?.trim() || !(price >= 0) || !(cost >= 0) || !(stock >= 0) || !(rl >= 0)) return err(res, 400, 'Name and valid numbers are required');
  const p = { id: uid(), name: b.name.trim(), sku: (b.sku || '').trim(), category: (b.category || 'General').trim(), unit: (b.unit || 'pcs').trim(), costPrice: cost, price, stock, reorderLevel: track ? rl : 0, tracksStock: track, archived: false, created: Date.now() };
  add(sh, 'products', p);
  if (stock > 0) add(sh, 'moves', { id: uid(), ts: Date.now(), type: 'in', productId: p.id, name: p.name, qty: stock, before: 0, after: stock, by: req.user.name, note: 'Opening stock' });
  audit(sh, req.user, 'product_add', `Added ${p.name} (stock ${track ? stock : 'not tracked'}, price ${price})`);
  res.json(p);
});
app.put('/api/products/:id', auth, owner, (req, res) => {
  const sh = req.sh, p = sh.products.find(x => x.id === req.params.id);
  if (!p) return err(res, 404, 'Not found');
  const b = req.body || {}, changes = [];
  for (const k of ['name', 'sku', 'category', 'unit']) if (b[k] !== undefined && b[k] !== p[k]) { changes.push(`${k}: ${p[k]} → ${b[k]}`); p[k] = String(b[k]).trim(); }
  for (const k of ['costPrice', 'price', 'reorderLevel']) if (b[k] !== undefined) {
    const v = Number(b[k]); if (!(v >= 0)) return err(res, 400, `Invalid ${k}`);
    if (v !== p[k]) { changes.push(`${k}: ${p[k]} → ${v}`); p[k] = v; }
  }
  if (b.tracksStock !== undefined) { const t = b.tracksStock !== 'no' && b.tracksStock !== false; if (t !== tracked(p)) { p.tracksStock = t; changes.push(t ? 'now tracks stock' : 'stops tracking stock'); } }
  if (b.archived !== undefined) { p.archived = !!b.archived; changes.push(p.archived ? 'archived' : 'restored'); }
  put(sh, 'products', p); audit(sh, req.user, 'product_edit', `${p.name}: ${changes.join(', ') || 'no change'}`);
  res.json(p);
});

/* ===================== stock ===================== */
app.post('/api/stock/in', auth, (req, res) => {
  const sh = req.sh, { productId, qty, supplier, note, costPrice } = req.body || {};
  const p = sh.products.find(x => x.id === productId && !x.archived), n = Number(qty);
  if (!p || !(n > 0)) return err(res, 400, 'Choose a product and a quantity above 0');
  if (!tracked(p)) return err(res, 400, 'This item does not track stock');
  const before = p.stock; p.stock = r2(p.stock + n);
  if (req.user.role === 'owner' && Number(costPrice) > 0) p.costPrice = Number(costPrice);
  put(sh, 'products', p);
  add(sh, 'moves', { id: uid(), ts: Date.now(), type: 'in', productId: p.id, name: p.name, qty: n, before, after: p.stock, by: req.user.name, supplier: supplier || '', note: note || '' });
  audit(sh, req.user, 'stock_in', `Received ${n} ${p.unit} of ${p.name}${supplier ? ' from ' + supplier : ''}`);
  res.json(strip(p, req.user));
});
app.post('/api/stock/count', auth, (req, res) => {
  const sh = req.sh, { productId, counted, reason } = req.body || {};
  const p = sh.products.find(x => x.id === productId && !x.archived), c = Number(counted);
  if (!p || counted === '' || counted == null || !(c >= 0)) return err(res, 400, 'Choose a product and enter the physical count');
  if (!tracked(p)) return err(res, 400, 'This item does not track stock');
  const diff = r2(c - p.stock);
  if (diff !== 0 && !String(reason || '').trim()) return err(res, 400, 'Give a reason for the difference');
  const before = p.stock; p.stock = c; put(sh, 'products', p);
  add(sh, 'moves', { id: uid(), ts: Date.now(), type: 'count', productId: p.id, name: p.name, qty: diff, before, after: c, by: req.user.name, note: reason || 'Count matched', valueLost: diff < 0 ? r2(-diff * p.costPrice) : 0 });
  audit(sh, req.user, 'stock_count', `${p.name}: system ${before}, counted ${c} (${diff >= 0 ? '+' : ''}${diff})${reason ? ' - ' + reason : ''}`);
  res.json(strip(p, req.user));
});
app.get('/api/stock/moves', auth, owner, (req, res) => res.json([...req.sh.moves].reverse().slice(0, 400)));

/* ===================== sales ===================== */
const showSale = (s, u) => (u.role === 'owner' ? s : { ...s, items: s.items.map(({ cost, ...i }) => i) });
app.post('/api/sales', auth, (req, res) => {
  const sh = req.sh, { items, payment, customer, note } = req.body || {};
  if (!Array.isArray(items) || !items.length) return err(res, 400, 'Add at least one item');
  if (!['cash', 'momo', 'credit'].includes(payment)) return err(res, 400, 'Choose a payment method');
  if (payment === 'credit' && !String(customer || '').trim()) return err(res, 400, 'Customer name is required for credit sales');
  const lines = [], need = {};
  for (const it of items) {
    const p = sh.products.find(x => x.id === it.productId && !x.archived), n = Number(it.qty);
    if (!p || !(n > 0)) return err(res, 400, 'Invalid item in sale');
    need[p.id] = (need[p.id] || 0) + n;
    const price = req.user.role === 'owner' && it.price != null && Number(it.price) >= 0 ? Number(it.price) : p.price;
    lines.push({ productId: p.id, name: p.name, qty: n, price, cost: p.costPrice || 0 });
  }
  for (const pid in need) {
    const p = sh.products.find(x => x.id === pid);
    if (tracked(p) && p.stock < need[pid]) return err(res, 400, `Not enough stock for ${p.name} (only ${p.stock} left)`);
  }
  for (const pid in need) { const p = sh.products.find(x => x.id === pid); if (tracked(p)) { p.stock = r2(p.stock - need[pid]); put(sh, 'products', p); } }
  const total = r2(sum(lines, l => l.price * l.qty));
  const s = add(sh, 'sales', { id: uid(), ts: Date.now(), date: today(sh), userId: req.user.id, userName: req.user.name, items: lines, total, payment, customer: (customer || '').trim(), note: note || '', status: 'ok', voidRequest: null });
  audit(sh, req.user, 'sale', `Sale ${total} (${payment}): ${lines.map(l => l.qty + '×' + l.name).join(', ')}`);
  res.json(showSale(s, req.user));
});
app.get('/api/sales', auth, (req, res) => {
  const sh = req.sh;
  let { from, to } = req.query;
  if (req.user.role !== 'owner') from = to = today(sh);
  from = from || today(sh); to = to || today(sh);
  const list = sh.sales.filter(s => s.date >= from && s.date <= to).sort((a, b) => b.ts - a.ts).slice(0, 600);
  res.json(list.map(s => showSale({ ...s, paid: s.payment === 'credit' ? sum(sh.payments.filter(p => p.saleId === s.id), p => p.amount) : s.total }, req.user)));
});

function doVoid(sh, s, by, reason) {
  for (const i of s.items) { const p = sh.products.find(x => x.id === i.productId); if (p && tracked(p)) { p.stock = r2(p.stock + i.qty); put(sh, 'products', p); } }
  sh.payments.filter(p => p.saleId === s.id).forEach(p => drop(sh, 'payments', p.id));
  sh.payments = sh.payments.filter(p => p.saleId !== s.id);
  s.status = 'void'; s.voidReason = reason || s.voidRequest?.reason || ''; s.voidBy = by.name; s.voidTs = Date.now();
  put(sh, 'sales', s);
  audit(sh, by, 'sale_void', `Voided sale ${s.total} by ${s.userName}: ${s.voidReason}`);
}
app.post('/api/sales/:id/void-request', auth, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || s.status !== 'ok') return err(res, 404, 'Sale not found');
  if (s.userId !== req.user.id || s.date !== today(sh)) return err(res, 403, 'You can only request voids for your own sales today');
  if (!String(req.body.reason || '').trim()) return err(res, 400, 'Give a reason');
  s.voidRequest = { ts: Date.now(), reason: req.body.reason.trim(), status: 'pending' }; put(sh, 'sales', s);
  audit(sh, req.user, 'void_request', `Requested void of sale ${s.total}: ${s.voidRequest.reason}`);
  res.json({ ok: true });
});
app.post('/api/sales/:id/void', auth, owner, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || s.status !== 'ok') return err(res, 404, 'Sale not found');
  if (s.voidRequest) s.voidRequest.status = 'approved';
  doVoid(sh, s, req.user, req.body.reason); res.json({ ok: true });
});
app.post('/api/sales/:id/void-reject', auth, owner, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id);
  if (!s || !s.voidRequest) return err(res, 404, 'No request');
  s.voidRequest.status = 'rejected'; put(sh, 'sales', s);
  audit(sh, req.user, 'void_reject', `Rejected void of sale ${s.total} by ${s.userName}`); res.json({ ok: true });
});

/* ===================== credit / debts ===================== */
app.get('/api/debts', auth, (req, res) => {
  const sh = req.sh;
  res.json(sh.sales.filter(s => s.status === 'ok' && s.payment === 'credit').map(s => {
    const paid = sum(sh.payments.filter(p => p.saleId === s.id), p => p.amount);
    return { id: s.id, ts: s.ts, customer: s.customer, total: s.total, paid, balance: r2(s.total - paid), by: s.userName };
  }).filter(d => d.balance > 0).sort((a, b) => a.ts - b.ts));
});
app.post('/api/sales/:id/pay', auth, (req, res) => {
  const sh = req.sh, s = sh.sales.find(x => x.id === req.params.id && x.status === 'ok' && x.payment === 'credit');
  const amount = Number(req.body.amount), method = req.body.method === 'momo' ? 'momo' : 'cash';
  if (!s) return err(res, 404, 'Credit sale not found');
  const bal = s.total - sum(sh.payments.filter(p => p.saleId === s.id), p => p.amount);
  if (!(amount > 0) || amount > bal + 0.001) return err(res, 400, `Amount must be between 1 and ${bal}`);
  add(sh, 'payments', { id: uid(), saleId: s.id, ts: Date.now(), date: today(sh), amount, method, by: req.user.name, customer: s.customer });
  audit(sh, req.user, 'debt_payment', `${s.customer} paid ${amount} (${method})`); res.json({ ok: true });
});

/* ===================== expenses ===================== */
app.post('/api/expenses', auth, (req, res) => {
  const sh = req.sh, { category, amount, note } = req.body || {}, a = Number(amount);
  if (!(a > 0)) return err(res, 400, 'Enter an amount above 0');
  if (!String(note || '').trim()) return err(res, 400, 'Describe what the money was spent on');
  const e = add(sh, 'expenses', { id: uid(), ts: Date.now(), date: today(sh), category: category || 'Other', amount: a, note: note.trim(), by: req.user.name, userId: req.user.id });
  audit(sh, req.user, 'expense', `Expense ${a} (${e.category}): ${e.note}`); res.json(e);
});
app.get('/api/expenses', auth, (req, res) => {
  const sh = req.sh;
  let { from, to } = req.query;
  if (req.user.role !== 'owner') from = to = today(sh);
  from = from || today(sh); to = to || today(sh);
  res.json(sh.expenses.filter(e => e.date >= from && e.date <= to).sort((a, b) => b.ts - a.ts));
});

/* ===================== cash closing ===================== */
function cashSummary(sh) {
  const last = [...sh.closings].sort((a, b) => b.ts - a.ts)[0], since = last ? last.ts : 0;
  const sales = sh.sales.filter(s => s.status === 'ok' && s.ts > since);
  const pays = sh.payments.filter(p => p.ts > since), exp = sh.expenses.filter(e => e.ts > since);
  const opening = last ? last.floatLeft : 0;
  const cashSales = sum(sales.filter(s => s.payment === 'cash'), s => s.total);
  const debtCash = sum(pays.filter(p => p.method === 'cash'), p => p.amount);
  const expenses = sum(exp, e => e.amount);
  return {
    since, sinceDate: last ? new Date(last.ts).toISOString() : null, opening, cashSales, debtCash, expenses,
    expectedCash: r2(opening + cashSales + debtCash - expenses),
    expectedMomo: r2(sum(sales.filter(s => s.payment === 'momo'), s => s.total) + sum(pays.filter(p => p.method === 'momo'), p => p.amount)),
    creditGiven: sum(sales.filter(s => s.payment === 'credit'), s => s.total), salesCount: sales.length,
  };
}
app.get('/api/closing/today', auth, (req, res) => {
  const c = cashSummary(req.sh); // shopkeeper counts blind
  res.json(req.user.role === 'owner' ? c : { since: c.since, sinceDate: c.sinceDate, salesCount: c.salesCount });
});
app.post('/api/closing', auth, (req, res) => {
  const sh = req.sh, { countedCash, handedOver = 0, momoCounted, note } = req.body || {};
  const cc = Number(countedCash), ho = Number(handedOver || 0);
  if (countedCash === '' || countedCash == null || !(cc >= 0)) return err(res, 400, 'Enter the cash you counted');
  if (!(ho >= 0) || ho > cc) return err(res, 400, 'Cash handed over cannot be more than cash counted');
  const c = cashSummary(sh), mc = momoCounted === '' || momoCounted == null ? null : Number(momoCounted);
  const rec = add(sh, 'closings', {
    id: uid(), ts: Date.now(), date: today(sh), userId: req.user.id, userName: req.user.name, periodFrom: c.since,
    opening: c.opening, cashSales: c.cashSales, debtCash: c.debtCash, expenses: c.expenses, expectedCash: c.expectedCash,
    countedCash: cc, variance: r2(cc - c.expectedCash), handedOver: ho, floatLeft: r2(cc - ho),
    expectedMomo: c.expectedMomo, momoCounted: mc, momoVariance: mc == null ? null : r2(mc - c.expectedMomo), note: note || '',
  });
  audit(sh, req.user, 'closing', `Closed till: counted ${cc}, variance ${rec.variance}`);
  res.json(req.user.role === 'owner' ? rec : { id: rec.id, variance: rec.variance, momoVariance: rec.momoVariance });
});
app.get('/api/closings', auth, (req, res) => {
  const list = [...req.sh.closings].sort((a, b) => b.ts - a.ts).slice(0, 60);
  res.json(req.user.role === 'owner' ? list : list.slice(0, 10).map(c => ({ id: c.id, ts: c.ts, userName: c.userName, countedCash: c.countedCash, handedOver: c.handedOver })));
});

/* ===================== restock ===================== */
app.get('/api/restock', auth, owner, (req, res) => {
  const sh = req.sh, since = Date.now() - 14 * 864e5, v = {};
  for (const s of sh.sales) if (s.status === 'ok' && s.ts >= since) for (const i of s.items) v[i.productId] = (v[i.productId] || 0) + i.qty;
  const list = sh.products.filter(p => !p.archived && tracked(p)).map(p => {
    const avg = (v[p.id] || 0) / 14, daysLeft = avg > 0 ? Math.floor(p.stock / avg) : null;
    const target = Math.max(p.reorderLevel * 2, Math.ceil(avg * 14));
    const suggested = Math.max(0, Math.ceil(target - p.stock));
    return { id: p.id, name: p.name, unit: p.unit, stock: p.stock, reorderLevel: p.reorderLevel, costPrice: p.costPrice, avgPerDay: r2(avg), daysLeft, suggested, estCost: r2(suggested * p.costPrice) };
  }).filter(p => p.stock <= p.reorderLevel || (p.daysLeft !== null && p.daysLeft <= 7))
    .sort((a, b) => (b.stock === 0) - (a.stock === 0) || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  res.json(list);
});

/* ===================== dashboard & reports ===================== */
app.get('/api/dashboard', auth, owner, (req, res) => {
  const sh = req.sh, d = today(sh), ok = sh.sales.filter(s => s.status === 'ok'), ts = ok.filter(s => s.date === d);
  const days = [];
  for (let i = 6; i >= 0; i--) { const k = dk(sh, Date.now() - i * 864e5); days.push({ date: k, total: sum(ok.filter(s => s.date === k), s => s.total) }); }
  const sold = {}, week = Date.now() - 7 * 864e5;
  for (const s of ok) if (s.ts >= week) for (const i of s.items) { sold[i.name] = sold[i.name] || { name: i.name, qty: 0, revenue: 0 }; sold[i.name].qty += i.qty; sold[i.name].revenue += i.price * i.qty; }
  const active = sh.products.filter(p => !p.archived), stockItems = active.filter(tracked);
  const low = stockItems.filter(p => p.stock <= p.reorderLevel).sort((a, b) => a.stock - b.stock);
  const avg7 = sum(days.slice(0, 6), x => x.total) / 6, alerts = [];
  const pend = sh.sales.filter(s => s.status === 'ok' && s.voidRequest?.status === 'pending').length;
  if (pend) alerts.push({ level: 'warn', text: `${pend} void request(s) waiting for your approval`, go: 'sales' });
  sh.closings.filter(c => c.ts >= week && c.variance < 0).forEach(c => alerts.push({ level: 'bad', text: `Cash SHORT by ${Math.abs(c.variance)} at close on ${new Date(c.ts).toLocaleString()} (${c.userName})`, go: 'closings' }));
  sh.closings.filter(c => c.ts >= week && c.momoVariance < 0).forEach(c => alerts.push({ level: 'bad', text: `Mobile money SHORT by ${Math.abs(c.momoVariance)} at close on ${new Date(c.ts).toLocaleString()}`, go: 'closings' }));
  const loss = sh.moves.filter(m => m.type === 'count' && m.qty < 0 && m.ts >= week);
  if (loss.length) alerts.push({ level: 'bad', text: `${loss.length} stock shortage(s) found in counts this week, worth ${sum(loss, m => m.valueLost || 0)} at cost`, go: 'stocklog' });
  const vc = sh.sales.filter(s => s.ts >= week && (s.voidRequest || s.status === 'void')).length;
  if (vc >= 3) alerts.push({ level: 'warn', text: `${vc} void requests/voids in the last 7 days. Review them.`, go: 'sales' });
  if (avg7 > 0 && days[6].total < avg7 * 0.5 && new Date(Date.now() + sh.meta.tz * 3600e3).getUTCHours() >= 15) alerts.push({ level: 'warn', text: `Today's sales (${days[6].total}) are less than half of your usual daily average (${Math.round(avg7)})`, go: 'sales' });
  if (low.length) alerts.push({ level: 'warn', text: `${low.length} product(s) at or below reorder level`, go: 'restock' });
  const lc = [...sh.closings].sort((a, b) => b.ts - a.ts)[0];
  res.json({
    today: { total: sum(ts, s => s.total), count: ts.length, profit: r2(sum(ts, saleProfit)), cash: sum(ts.filter(s => s.payment === 'cash'), s => s.total), momo: sum(ts.filter(s => s.payment === 'momo'), s => s.total), credit: sum(ts.filter(s => s.payment === 'credit'), s => s.total), expenses: sum(sh.expenses.filter(e => e.date === d), e => e.amount) },
    days, top: Object.values(sold).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    low: low.slice(0, 15), outOfStock: stockItems.filter(p => p.stock <= 0).length, productCount: active.length,
    stockCost: r2(sum(stockItems, p => p.stock * p.costPrice)), stockRetail: r2(sum(stockItems, p => p.stock * p.price)),
    debts: r2(sum(sh.sales.filter(s => s.status === 'ok' && s.payment === 'credit'), s => s.total - sum(sh.payments.filter(p => p.saleId === s.id), p => p.amount))),
    lastClose: lc ? { ts: lc.ts, variance: lc.variance, by: lc.userName } : null,
    alerts, activity: [...sh.audit].reverse().slice(0, 12),
  });
});
app.get('/api/reports', auth, owner, (req, res) => {
  const sh = req.sh, to = req.query.to || today(sh), from = req.query.from || dk(sh, Date.now() - 6 * 864e5);
  const sales = sh.sales.filter(s => s.status === 'ok' && s.date >= from && s.date <= to);
  const exp = sh.expenses.filter(e => e.date >= from && e.date <= to), byDay = {}, byProd = {};
  const day = k => (byDay[k] = byDay[k] || { date: k, sales: 0, profit: 0, count: 0, expenses: 0 });
  for (const s of sales) {
    const d = day(s.date); d.sales += s.total; d.profit += saleProfit(s); d.count++;
    for (const i of s.items) { const p = (byProd[i.productId] = byProd[i.productId] || { name: i.name, qty: 0, revenue: 0, profit: 0 }); p.qty += i.qty; p.revenue += i.price * i.qty; p.profit += (i.price - i.cost) * i.qty; }
  }
  for (const e of exp) day(e.date).expenses += e.amount;
  const t = { sales: sum(sales, s => s.total), profit: r2(sum(sales, saleProfit)), expenses: sum(exp, e => e.amount), count: sales.length };
  t.net = r2(t.profit - t.expenses);
  res.json({ from, to, totals: t, byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)), byProduct: Object.values(byProd).sort((a, b) => b.revenue - a.revenue) });
});
app.get('/api/audit', auth, owner, (req, res) => res.json([...req.sh.audit].reverse().slice(0, Number(req.query.limit) || 300)));

/* ===================== backup / restore (per shop) ===================== */
app.get('/api/backup', auth, owner, (req, res) => {
  const sh = req.sh, out = { version: 2, meta: shopInfo(sh) };
  COLLS.forEach(c => (out[c] = sh[c]));
  res.setHeader('Content-Disposition', `attachment; filename="shopwatch-backup-${today(sh)}.json"`);
  res.json(out);
});
app.post('/api/restore', auth, owner, h(async (req, res) => {
  const sh = req.sh, b = req.body;
  if (!b || !Array.isArray(b.users) || !Array.isArray(b.products) || !Array.isArray(b.sales)) return err(res, 400, 'This is not a valid ShopWatch backup file');
  for (const u of b.users) { const o = userIndex.get(u.username); if (o && o !== sh.id) return err(res, 400, `Username "${u.username}" in this backup is used by another shop.`); }
  await enqueue(() => q('DELETE FROM records WHERE shop_id=$1 AND coll<>$2', [sh.id, 'meta']));
  sh.users.forEach(u => userIndex.delete(u.username));
  for (const c of COLLS) { sh[c] = Array.isArray(b[c]) ? b[c].filter(x => x && x.id) : []; sh[c].forEach(o => put(sh, c, o)); }
  sh.users.forEach(u => userIndex.set(u.username, sh.id));
  audit(sh, null, 'restore', 'Data restored from backup');
  await chain; res.json({ ok: true });
}));

/* ===================== platform admin (optional) ===================== */
const adminAuth = (req, res, next) => (ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY ? next() : err(res, 403, 'Admin key required'));
app.get('/api/admin/shops', adminAuth, (req, res) => {
  res.json([...shops.values()].map(sh => {
    const ow = sh.users.find(u => u.role === 'owner');
    return { id: sh.id, name: sh.meta.name, active: sh.meta.active !== false, created: sh.meta.created, owner: ow?.name, username: ow?.username, users: sh.users.length, products: sh.products.length, sales: sh.sales.length, lastSale: sh.sales.length ? sh.sales[sh.sales.length - 1].ts : null };
  }).sort((a, b) => b.created - a.created));
});
app.post('/api/admin/shops/:id', adminAuth, (req, res) => {
  const sh = shops.get(req.params.id);
  if (!sh) return err(res, 404, 'Not found');
  sh.meta.active = !!req.body.active; putMeta(sh); res.json({ ok: true });
});

app.use((e, req, res, next) => { console.error(e); err(res, 500, 'Server error. Please try again.'); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  await initDb();
  await loadAll();
  const server = app.listen(PORT, () => console.log(`ShopWatch running on http://localhost:${PORT}  (${shops.size} shop(s) loaded)`));
  const stop = async () => { server.close(); await chain; process.exit(0); };
  ['SIGINT', 'SIGTERM'].forEach(s => process.on(s, stop));
})().catch(e => { console.error('Startup failed:', e); process.exit(1); });
