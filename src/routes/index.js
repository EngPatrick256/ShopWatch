// Mounts every route module under /api
const express = require('express');
const r = express.Router();
['auth', 'staff', 'products', 'stock', 'sales', 'payments', 'expenses', 'closing', 'capital', 'purchases', 'alerts', 'checks', 'dashboard', 'reports', 'backup', 'admin']
  .forEach(name => r.use(require('./' + name)));
module.exports = r;
