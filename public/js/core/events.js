// One global click handler. Pages register named actions; buttons use data-act="name" / data-nav="page".
import { go } from './router.js';
import { run } from './dom.js';

const acts = {};
export const registerActions = o => Object.assign(acts, o);

export function initEvents() {
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav);
    const b = e.target.closest('[data-act]'); if (b) run(async () => acts[b.dataset.act]?.(b.dataset, b));
  });
}
