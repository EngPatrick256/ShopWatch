import { api } from '../core/api.js';
import { registerPage, setMain } from '../core/router.js';
import { esc, dt } from '../core/format.js';
import { pill } from '../components/ui.js';

registerPage('audit', async () => {
  const l = await api('/audit?limit=400');
  setMain(`<h2>Audit trail</h2><div class="card"><p class="muted">Everything done in the system, including failed logins. Nobody, not even you, can edit this log.</p><table><tr><th>Time</th><th>Who</th><th>Action</th><th>Details</th></tr>
  ${l.map(a => `<tr><td style="white-space:nowrap">${dt(a.ts)}</td><td>${esc(a.user)}</td><td>${pill(a.action, /fail|void|reject/.test(a.action) ? 'bad' : '')}</td><td>${esc(a.detail)}</td></tr>`).join('')}</table></div>`);
});
