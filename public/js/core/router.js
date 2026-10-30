// Page registry + navigation. Pages register themselves; nothing here imports a page.
import { S } from './state.js';
import { $, $$ } from './dom.js';
import { esc } from './format.js';

const pages = {};
let refreshTimer;
export const registerPage = (name, fn) => (pages[name] = fn);
export const setMain = html => { $('#main').innerHTML = html; };

export async function go(page) {
  S.page = page; clearInterval(refreshTimer);
  document.body.classList.remove('menu-open');
  $$('.drawer-item').forEach(b => b.classList.toggle('on', b.dataset.nav === page));
  const it = document.querySelector(`.drawer-item[data-nav="${page}"]`), pt = $('#pageTitle'); if (pt && it) pt.textContent = it.lastChild.textContent.trim();
  setMain('<p class="muted">Loading…</p>');
  try { await pages[page](); } catch (e) { setMain(`<p class="err">${esc(e.message)}</p>`); }
  if (page === 'dashboard') refreshTimer = setInterval(() => S.page === 'dashboard' && pages.dashboard().catch(() => {}), 60000);
}
export const reload = () => go(S.page);
