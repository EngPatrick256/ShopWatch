// Roles and what each one may do. The server checks these on every request; the web pages use the same list to hide buttons.
const ROLES = {
  owner: { label: 'Owner', desc: 'Full control of the business.' },
  manager: { label: 'Manager', desc: 'Runs the shop: sells, adds products and sets prices, sees reports, costs and profit. Cannot manage staff, capital, settings, backups, or approve voids.' },
  shopkeeper: { label: 'Shopkeeper / Cashier', desc: 'Sells, receives and counts stock, records expenses, takes customer payments and closes the till. Never sees cost prices or profit.' },
  storekeeper: { label: 'Storekeeper', desc: 'Handles stock only: receives stock, counts and daily checks. Cannot sell and never sees money or cost prices.' },
  accountant: { label: 'Accountant (view only)', desc: 'Can view sales, costs, purchases, expenses, capital, reports and the audit trail. Cannot change anything.' },
};
const ASSIGNABLE = ['manager', 'shopkeeper', 'storekeeper', 'accountant']; // roles the owner can give to employees

// capability -> roles that have it (the owner always has every capability)
const CAPS = {
  view_reports: ['manager', 'accountant'],                 // dashboard, reports, purchases, restock list, stock log, check results
  view_finance: ['manager', 'accountant'],                 // capital page
  view_costs: ['manager', 'accountant'],                   // cost prices and profit
  view_audit: ['accountant'],
  view_stock: ['manager', 'shopkeeper', 'storekeeper', 'accountant'],
  view_sales: ['manager', 'shopkeeper', 'accountant'],
  view_all_sales: ['manager', 'accountant'],               // any date range (others see today only)
  view_expenses: ['manager', 'shopkeeper', 'accountant'],
  view_closings: ['manager', 'shopkeeper', 'accountant'],
  sell: ['manager', 'shopkeeper'],
  take_payments: ['manager', 'shopkeeper'],
  record_expense: ['manager', 'shopkeeper'],
  close_till: ['manager', 'shopkeeper'],
  receive_stock: ['manager', 'shopkeeper', 'storekeeper'],
  count_stock: ['manager', 'shopkeeper', 'storekeeper'],
  see_stock_diff: ['manager'],                             // others count "blind"
  manage_products: ['manager'],
  set_costs: ['manager'],
};
const can = (user, cap) => !!user && (user.role === 'owner' || (CAPS[cap] || []).includes(user.role));
const capsOf = user => Object.keys(CAPS).filter(c => can(user, c));
const roleLabel = role => (ROLES[role] || ROLES.shopkeeper).label;

module.exports = { ROLES, ASSIGNABLE, CAPS, can, capsOf, roleLabel };
