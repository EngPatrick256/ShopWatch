// DOM helpers: selectors, toast messages, pop-up forms
import { esc } from './format.js';

export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);

export function toast(msg, kind) {
  const d = document.createElement('div'); d.textContent = msg; if (kind) d.className = kind === true ? 'e' : kind;
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 4200);
}
export const run = async fn => { try { await fn(); } catch (e) { toast(e.message, true); } };
export const closeModal = () => { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; };

// Generic pop-up form. fields: [{name,label,type,value,options,required,min,hint}]
export function openForm(title, fields, submit, okLabel = 'Save', intro = '', okClass = '') {
  const input = f => {
    const v = f.value ?? '';
    if (f.type === 'select') return `<select name="${f.name}">${f.options.map(o => { const val = o.v ?? o, t = o.t ?? o; return `<option value="${esc(val)}"${val == f.value ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea name="${f.name}" rows="2" ${f.required ? 'required' : ''}>${esc(v)}</textarea>`;
    return `<input name="${f.name}" type="${f.type || 'text'}" ${f.type === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(v)}" ${f.required ? 'required' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>`;
  };
  $('#modal').innerHTML = `<div class="modal-card"><h3>${esc(title)}</h3>${intro ? `<p class="muted">${intro}</p>` : ''}<form id="mf">${fields.map(f => `<label>${esc(f.label)}${input(f)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label>`).join('')}<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn ${okClass}">${esc(okLabel)}</button></div></form></div>`;
  $('#modal').classList.remove('hidden');
  $('#mf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
    try { await submit(d); closeModal(); } catch (err) { toast(err.message, true); }
  };
  const first = $('#mf input,#mf select'); if (first) first.focus();
}
