// ShopWatch - entry point. Everything else lives in /src (server) and /public (web pages).
const express = require('express');
const path = require('path');
const config = require('./src/config');
const store = require('./src/store');
const routes = require('./src/routes');
const { err } = require('./src/utils');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', routes);
app.use('/api', (req, res) => err(res, 404, 'Not found'));
app.use((e, req, res, next) => { console.error(e); err(res, 500, 'Server error. Please try again.'); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

(async () => {
  await store.init();
  await store.loadAll();
  const server = app.listen(config.PORT, () => console.log(`ShopWatch running on http://localhost:${config.PORT}  (${store.shops.size} shop(s) loaded)`));
  require('./src/services/alerts').startScheduler();
  const stop = async () => { server.close(); await store.flush(); process.exit(0); };
  ['SIGINT', 'SIGTERM'].forEach(s => process.on(s, stop));
})().catch(e => { console.error('Startup failed:', e); process.exit(1); });
