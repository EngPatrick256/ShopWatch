// Entry point: loads every page module (each registers itself) and starts the app
import { initEvents } from './core/events.js';
import { boot } from './pages/auth.js';
import './pages/dashboard.js';
import './pages/restock.js';
import './pages/products.js';
import './pages/pos.js';
import './pages/sales.js';
import './pages/debts.js';
import './pages/purchases.js';
import './pages/capital.js';
import './pages/stocklog.js';
import './pages/expenses.js';
import './pages/closings.js';
import './pages/reports.js';
import './pages/audit.js';
import './pages/settings.js';
import './pages/checks.js';
import './pages/alerts.js';
import { registerActions } from './core/events.js';
import { closeModal } from './core/dom.js';

registerActions({ closeModal });
initEvents();
boot();
