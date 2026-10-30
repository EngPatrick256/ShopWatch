// Storage layer. All shops are kept in memory and written through to SQL.
// PostgreSQL when DATABASE_URL is set (Neon/Supabase), otherwise embedded Postgres (PGlite).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const COLLS = ['users', 'products', 'sales', 'payments', 'moves', 'expenses', 'closings', 'capital', 'checks', 'audit'];
const shops = new Map();       // shopId -> shop
const userIndex = new Map();   // username -> shopId (usernames unique across the platform)
const state = { secret: config.JWT_SECRET };

let pool = null, lite = null;
const q = (sql, p = []) => (pool ? pool.query(sql, p) : lite.query(sql, p));

const newShop = id => {
  const sh = { id, meta: null };
  COLLS.forEach(c => (sh[c] = []));
  return sh;
};

async function init() {
  if (config.DATABASE_URL) {
    const { Pool } = require('pg');
    const local = /localhost|127\.0\.0\.1/.test(config.DATABASE_URL);
    pool = new Pool({ connectionString: config.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    console.log('Database: PostgreSQL (DATABASE_URL)');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    lite = new PGlite(path.join(config.DATA_DIR, 'pgdata'));
    await lite.waitReady;
    console.log('Database: local embedded Postgres in ' + path.join(config.DATA_DIR, 'pgdata'));
  }
  await q(`CREATE TABLE IF NOT EXISTS records(
    shop_id text NOT NULL, coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
    PRIMARY KEY (shop_id, coll, id))`);
}

const UP = 'INSERT INTO records(shop_id,coll,id,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT (shop_id,coll,id) DO UPDATE SET data=EXCLUDED.data';

async function loadAll() {
  const { rows } = await q('SELECT shop_id, coll, id, data FROM records');
  for (const r of rows) {
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (r.shop_id === '_sys') { if (r.id === 'secret' && !state.secret) state.secret = d.v; continue; }
    let sh = shops.get(r.shop_id);
    if (!sh) shops.set(r.shop_id, (sh = newShop(r.shop_id)));
    if (r.coll === 'meta') sh.meta = d; else if (sh[r.coll]) sh[r.coll].push(d);
  }
  for (const [id, sh] of shops) {
    if (!sh.meta) { shops.delete(id); continue; }
    for (const c of COLLS) sh[c].sort((a, b) => (a.ts || a.created || 0) - (b.ts || b.created || 0));
    sh.users.forEach(u => userIndex.set(u.username, sh.id));
  }
  if (!state.secret) {
    state.secret = crypto.randomBytes(32).toString('hex');
    await q(UP, ['_sys', 'sys', 'secret', JSON.stringify({ id: 'secret', v: state.secret })]);
  }
}

// ---- write-through queue: memory is updated instantly, SQL writes happen in order ----
let chain = Promise.resolve();
const enqueue = fn => (chain = chain.then(fn).catch(e => console.error('DB write failed:', e.message)));
const put = (sh, coll, o) => enqueue(() => q(UP, [sh.id, coll, o.id, JSON.stringify(o)]));
const add = (sh, coll, o) => { sh[coll].push(o); put(sh, coll, o); return o; };
const drop = (sh, coll, id) => enqueue(() => q('DELETE FROM records WHERE shop_id=$1 AND coll=$2 AND id=$3', [sh.id, coll, id]));
const putMeta = sh => put(sh, 'meta', sh.meta);
const wipeShopData = sh => enqueue(() => q('DELETE FROM records WHERE shop_id=$1 AND coll<>$2', [sh.id, 'meta']));
const flush = () => chain;

module.exports = { COLLS, shops, userIndex, state, newShop, init, loadAll, put, add, drop, putMeta, wipeShopData, flush, enqueue };
