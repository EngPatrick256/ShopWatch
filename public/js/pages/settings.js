// Staff accounts, shop settings, backup/restore, own account
import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { registerPage, setMain, reload } from '../core/router.js';
import { registerActions } from '../core/events.js';
import { $, run, toast, openForm } from '../core/dom.js';
import { esc, dt, todayStr } from '../core/format.js';
import { openShell } from '../core/shell.js';
import { pill } from '../components/ui.js';

registerPage('settings', async () => {
  const u = await api('/users');
  setMain(`<h2>Staff & settings</h2><div class="card"><div class="row"><h3 style="margin:0">Staff accounts</h3><button class="btn green sm spacer" data-act="addUser">＋ Add employee</button></div>
  <div class="staff">${u.map(x => `<div class="staffcard" style="${x.active ? '' : 'opacity:.6'}"><div class="top"><div><b>${esc(x.name)}</b><br><small class="muted">@${esc(x.username)}</small></div><div>${pill(x.roleLabel || x.role, x.role === 'owner' ? 'new' : x.role === 'manager' ? 'info' : '')}${x.active ? '' : ' ' + pill('disabled', 'bad')}</div></div>
    <div class="meta">Last login: ${x.lastLogin ? dt(x.lastLogin) : 'never'}<br>Last sale: ${x.lastSale ? dt(x.lastSale) : '-'}</div>
    ${x.role !== 'owner' ? `<div class="row"><button class="btn sm ghost" data-act="toggleUser" data-id="${x.id}" data-active="${x.active}">${x.active ? 'Disable' : 'Enable'}</button><button class="btn sm ghost" data-act="changeRole" data-id="${x.id}" data-role="${x.role}">Change role</button><button class="btn sm ghost" data-act="resetPw" data-id="${x.id}">Reset password</button></div>` : '<small class="muted">The owner account cannot be changed here.</small>'}</div>`).join('')}</div></div>
  <div class="two"><div class="card"><h3>Shop</h3><div class="row"><button class="btn blue" data-act="shopName">Shop name & currency</button><button class="btn ghost" data-act="myPw">Change my password</button></div></div>
  <div class="card"><h3>Backup</h3><p class="muted">Download a backup regularly and keep a copy on your phone or computer.</p><div class="row"><button class="btn teal" data-act="backup">⬇ Download backup</button><label class="btn ghost" style="margin:0;cursor:pointer">Restore from file<input type="file" id="rf" accept=".json" class="hidden"></label></div></div></div>`);
  $('#rf').onchange = e => run(async () => {
    const f = e.target.files[0]; if (!f || !confirm('This replaces ALL current data with the backup. Continue?')) return;
    await api('/restore', 'POST', JSON.parse(await f.text())); toast('Restored. Please sign in again.', 's');
    document.querySelector('[data-act="logout"]')?.click();
  });
});

registerPage('account', async () => {
  setMain(`<h2>My account</h2><div class="card"><p>Signed in as <b>${esc(S.user.name)}</b> (${esc(S.user.username)}) · ${esc(S.roleLabel)}</p><button class="btn" data-act="myPw">Change my password</button></div>`);
});

// the explanation under the role box follows the selected role
function showRoleHelp(desc) {
  const sel = $('#mf select[name=role]'), hint = sel.parentElement.querySelector('.hint');
  sel.onchange = () => { hint.textContent = desc[sel.value] || ''; };
}

registerActions({
  addUser: async () => {
    const roles = await api('/roles'), desc = Object.fromEntries(roles.map(r => [r.key, r.desc]));
    openForm('Add employee', [
      { name: 'name', label: 'Full name', required: 1 },
      { name: 'role', label: 'Role', type: 'select', options: roles.map(r => ({ v: r.key, t: r.label })), value: 'shopkeeper', hint: desc.shopkeeper },
      { name: 'username', label: 'Username (unique across the app)', required: 1 },
      { name: 'password', label: 'Password (min 6)', type: 'password', required: 1 },
    ], async d => { await api('/users', 'POST', d); toast('Employee added', 's'); reload(); }, 'Add employee', '', 'green');
    showRoleHelp(desc);
  },
  changeRole: async ({ id, role }) => {
    const roles = await api('/roles'), desc = Object.fromEntries(roles.map(r => [r.key, r.desc]));
    openForm('Change role', [{ name: 'role', label: 'New role', type: 'select', options: roles.map(r => ({ v: r.key, t: r.label })), value: role, hint: desc[role] }],
      async d => { await api('/users/' + id, 'PATCH', d); toast('Role updated', 's'); reload(); }, 'Save role');
    showRoleHelp(desc);
  },
  toggleUser: async ({ id, active }) => { await api('/users/' + id, 'PATCH', { active: active !== 'true' }); reload(); },
  resetPw: ({ id }) => openForm('Reset password', [{ name: 'password', label: 'New password (min 6)', type: 'password', required: 1 }], async d => { await api('/users/' + id, 'PATCH', d); toast('Password reset', 's'); }),
  shopName: () => openForm('Shop name & currency', [{ name: 'shopName', label: 'Shop name', value: S.shop, required: 1 }, { name: 'currency', label: 'Currency', value: S.cur, required: 1 }], async d => { await api('/settings', 'POST', d); S.shop = d.shopName; S.cur = d.currency.toUpperCase(); openShell(); }),
  myPw: () => openForm('Change my password', [{ name: 'current', label: 'Current password', type: 'password', required: 1 }, { name: 'password', label: 'New password (min 6)', type: 'password', required: 1 }], async d => { await api('/me/password', 'POST', d); toast('Password changed', 's'); }),
  backup: async () => {
    const r = await fetch('/api/backup', { headers: { Authorization: 'Bearer ' + S.token } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `shopwatch-backup-${todayStr()}.json`; a.click();
  },
});
