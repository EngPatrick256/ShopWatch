// The signed-in frame: header with one Menu button, and a drawer that slides in from the right with every page.
import { S, isOwner, can } from './state.js';
import { $ } from './dom.js';
import { esc } from './format.js';
import { go } from './router.js';
import { registerActions } from './events.js';

// [page, icon, label, who may see it]  (who: capability name, 'owner', a function, or null = everyone)
const ITEMS = [
  ['dashboard', '📊', 'Dashboard', 'view_reports'],
  ['pos', '🛍️', 'New sale', 'sell'],
  ['restock', '🛒', 'Restock', 'view_reports'],
  ['products', '📦', () => (can('manage_products') ? 'Products' : 'Stock'), 'view_stock'],
  ['purchases', '🧾', 'Purchases', 'view_reports'],
  ['capital', '💰', 'Capital', 'view_finance'],
  ['sales', '💵', () => (can('view_all_sales') ? 'Sales' : 'Today\'s sales'), 'view_sales'],
  ['debts', '⏳', 'Balances owed', 'view_sales'],
  ['stocklog', '📋', 'Stock log', 'view_reports'],
  ['checks', '✅', () => (can('view_reports') ? 'Stock checks' : 'Daily check'), () => can('view_reports') || can('count_stock')],
  ['expenses', '💸', 'Expenses', 'view_expenses'],
  ['closings', '🔒', () => (can('view_reports') ? 'Cash closings' : 'Close till'), 'view_closings'],
  ['reports', '📈', 'Reports', 'view_reports'],
  ['audit', '🕵️', 'Audit trail', 'view_audit'],
  ['alerts', '🔔', 'Alerts & email', 'owner'],
  ['settings', '⚙️', 'Staff & settings', 'owner'],
  ['account', '👤', 'My account', null],
];
const allowed = who => who === null || (who === 'owner' ? isOwner() : typeof who === 'function' ? who() : can(who));
const items = () => ITEMS.filter(i => allowed(i[3])).map(([key, icon, label]) => ({ key, icon, label: typeof label === 'function' ? label() : label }));

export function openShell() {
  const nav = items();
  $('#app').innerHTML = `<header class="topbar"><div class="brandwrap"><b class="brand"><img src="icon.svg" alt="" class="brand-logo">${esc(S.shop)}</b><small><span id="pageTitle"></span></small></div>
  <button class="menu-btn" data-act="openMenu" aria-label="Open menu">☰ <span>Menu</span></button></header>
  <main id="main"></main>
  <div class="drawer-backdrop" data-act="closeMenu"></div>
  <aside class="drawer" aria-label="Menu">
    <div class="drawer-head"><div><b>${esc(S.user.name)}</b><small>${esc(S.roleLabel || S.user.role)}</small></div><button class="drawer-x" data-act="closeMenu" aria-label="Close menu">✕</button></div>
    <nav class="drawer-list">${nav.map(i => `<button class="drawer-item" data-nav="${i.key}"><span class="di">${i.icon}</span>${esc(i.label)}</button>`).join('')}</nav>
    <div class="drawer-foot"><button class="btn red big" data-act="logout">Sign out</button></div>
  </aside>`;
  go(nav[0].key);
}

registerActions({
  openMenu: () => document.body.classList.add('menu-open'),
  closeMenu: () => document.body.classList.remove('menu-open'),
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('menu-open'); });
