// Formatting helpers (money, numbers, dates, HTML escaping)
import { S } from './state.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => S.cur + '\u00a0' + Math.round(n || 0).toLocaleString(); // non-breaking space keeps currency and number together
export const fnum = n => (Math.round((n || 0) * 100) / 100).toLocaleString();
export const dt = ts => new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
export const dayAgo = n => new Date(Date.now() - n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const todayStr = () => dayAgo(0);
export const tracked = p => p.tracksStock !== false;
export const signed = n => (n > 0 ? '+' : '') + fnum(n);
