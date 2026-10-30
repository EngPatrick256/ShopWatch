// Sign in / create a shop / sign out
import { S } from '../core/state.js';
import { api, setUnauthorizedHandler } from '../core/api.js';
import { $, run, toast } from '../core/dom.js';
import { esc } from '../core/format.js';
import { registerActions } from '../core/events.js';
import { openShell } from '../core/shell.js';

const TZS = [[-8, 'UTC-8 (US Pacific)'], [-5, 'UTC-5 (US East)'], [0, 'UTC+0 (UK, Ghana)'], [1, 'UTC+1 (Nigeria, Central Europe)'], [2, 'UTC+2 (South Africa, Egypt)'], [3, 'UTC+3 (Uganda, Kenya, Tanzania)'], [4, 'UTC+4 (UAE)'], [5.5, 'UTC+5:30 (India)'], [8, 'UTC+8 (China, Singapore)']];

export async function boot() {
  try { const st = await fetch('/api/status').then(r => r.json()); S.codeReq = st.codeRequired; S.defTz = st.defaultTz; } catch {}
  if (S.token) {
    try { const m = await api('/me'); S.user = m.user; S.shop = m.shopName; S.cur = m.currency; S.caps = m.caps; S.roleLabel = m.roleLabel; return openShell(); } catch {}
  }
  loginView(false);
}

function loginView(signup) {
  $('#app').innerHTML = `<div class="login-wrap"><div class="login"><p class="login-tag">Watch your shop from anywhere.</p><div class="card">
  <div style="text-align:center"><img src="icon.svg" alt="ShopWatch" class="login-logo"><h1>ShopWatch</h1><p class="muted">${signup ? 'Create your business account. You will be the owner and can add shopkeepers afterwards.' : 'Sign in to watch your shop, wherever you are.'}</p></div>
  <form id="lf">${signup ? `<label>Shop / business name<input name="shopName" required></label><label>Your full name<input name="name" required></label>
  <label>Currency (e.g. UGX, KES, USD)<input name="currency" value="UGX" maxlength="6" required></label>
  <label>Time zone<select name="tz">${TZS.map(([v, t]) => `<option value="${v}"${v === S.defTz ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
  ${S.codeReq ? '<label>Sign-up code<input name="code" required></label>' : ''}` : ''}
  <label>Username<input name="username" autocomplete="username" required ${signup ? 'placeholder="letters, numbers, . _ -"' : ''}></label>
  <label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 6 : 1}" required></label>
  <button class="btn big">${signup ? '🚀 Create my shop' : 'Sign in'}</button></form>
  <p style="text-align:center;margin:16px 0 0"><a href="#" id="sw" style="font-weight:700">${signup ? 'I already have an account' : 'New business? Create a shop account'}</a></p></div></div></div>`;
  $('#sw').onclick = e => { e.preventDefault(); loginView(!signup); };
  $('#lf').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const r = await api(signup ? '/signup' : '/login', 'POST', Object.fromEntries(new FormData(e.target)));
      S.token = r.token; localStorage.setItem('sw_token', r.token); S.user = r.user;
      const m = await api('/me'); S.shop = m.shopName; S.cur = m.currency; S.caps = m.caps; S.roleLabel = m.roleLabel; openShell();
    });
  };
}

function logout(silent) {
  S.token = null; S.user = null; localStorage.removeItem('sw_token');
  if (!silent) toast('Signed out'); loginView(false);
}
setUnauthorizedHandler(() => logout(true));
registerActions({ logout: () => logout() });
