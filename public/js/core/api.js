// Talks to the server. Sends the login token automatically.
import { S } from './state.js';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = f => (onUnauthorized = f);

export async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && S.token) { onUnauthorized(); throw new Error(j.error || 'Please sign in again'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
