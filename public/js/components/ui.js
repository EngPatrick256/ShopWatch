// Small reusable HTML building blocks
import { esc, fnum } from '../core/format.js';

// coloured statistic card. color: purple|green|blue|orange|pink|red|teal|amber|mtn. hero = slightly bigger value
export const stat = ({ label, value, sub = '', color = 'purple', icon = '', nav = '', hero = false }) =>
  `<div class="stat c-${color}${hero ? ' hero' : ''}${nav ? ' link' : ''}" ${nav ? `data-nav="${nav}"` : ''}><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}<i class="ico">${icon}</i></div>`;

// bar chart; negative values are drawn red
export function bars(days, key, cls = '') {
  const max = Math.max(...days.map(d => Math.abs(d[key])), 1);
  return `<div class="bars ${cls}">${days.map(d => `<div class="${d[key] < 0 ? 'neg' : ''}" style="height:${Math.max(3, Math.abs(d[key]) / max * 100)}%"><span>${d[key] ? (d[key] < 0 ? '-' : '') + Math.round(Math.abs(d[key]) / 1000) + 'k' : ''}</span><em>${d.date.slice(5)}</em></div>`).join('')}</div>`;
}

export const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
export const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" class="muted">${esc(msg)}</td></tr>`;

export const dateFilter = (from, to, act, extra = '') =>
  `<div class="row" style="margin-bottom:12px"><label style="margin:0">From<input type="date" id="f" value="${from}"></label><label style="margin:0">To<input type="date" id="t" value="${to}"></label><button class="btn blue" data-act="${act}" style="margin-top:19px">Show</button>${extra}</div>`;

export const methodPill = s => (s.payment === 'momo' ? pill('MTN MoMo', 'mtn') : s.payment === 'credit' ? pill('Not paid', 'bad') : pill('Cash', 'ok'));
export const balanceCell = b => (b > 0 ? `<b class="badtxt">${fnum(b)}</b>` : '<span class="good">0</span>');
