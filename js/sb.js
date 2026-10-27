// GitHub Pages cannot send X-Frame-Options: refuse to run inside another site's frame (same-site frames, like the chart preview, are fine)
try { if (window.top !== window.self && window.top.location.origin !== location.origin) throw 0; } catch (e){ document.documentElement.innerHTML = ''; throw new Error('framed by another site'); }

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
export const configured = !SUPABASE_URL.includes('YOUR-PROJECT-REF');

export const $ = id => document.getElementById(id);
export function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function toast(msg, ms){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 3200); }
export function when(ts){ return ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; }

// In-page replacement for window.confirm / window.prompt, which some browsers and embedded views block.
// ask({ title, text, ok, danger, input: { placeholder, type }, typeWord }) resolves to true (confirmed),
// the typed text (input), or null when cancelled. typeWord makes the person type a word, like DELETE.
export function ask(o){
  return new Promise(resolve => {
    const d = document.createElement('div'); d.className = 'ask-back';
    d.innerHTML = '<form class="ask" role="dialog" aria-modal="true" aria-labelledby="askTitle"><h2 id="askTitle">' + esc(o.title || 'Are you sure?') + '</h2>' +
      (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
      (o.input || o.typeWord ? '<input class="field" name="v" autocomplete="off" type="' + ((o.input && o.input.type) || 'text') + '" placeholder="' + esc(o.typeWord ? 'Type ' + o.typeWord : (o.input.placeholder || '')) + '">' : '') +
      '<p class="err" hidden></p><div class="acts"><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" type="submit">' + esc(o.ok || 'OK') + '</button><button class="btn" type="button" data-x>Cancel</button></div></form>';
    document.body.appendChild(d);
    const f = d.querySelector('form'), inp = f.elements.v, close = v => { d.remove(); resolve(v); };
    (inp || f.querySelector('[type=submit]')).focus();
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) close(null); });
    d.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); });
    f.onsubmit = e => {
      e.preventDefault();
      if (o.typeWord && inp.value.trim() !== o.typeWord){ const er = f.querySelector('.err'); er.textContent = 'Type ' + o.typeWord + ' to confirm.'; er.hidden = false; return; }
      close(o.typeWord ? true : inp ? inp.value : true);
    };
  });
}

export const STATUS = { draft: 'Draft', collecting: 'Collecting photos', review: 'In review', delivered: 'Delivered', archived: 'Archived' };

// The signed-in user if they are the admin, else null. Signs out non-admins.
export async function currentAdmin(){
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('admins').select('user_id').maybeSingle();
  if (error || !data){ await sb.auth.signOut(); return null; }
  return session.user;
}

// Admin pages other than the login page: send strangers back to /admin/.
export async function requireAdmin(){
  const u = await currentAdmin();
  if (!u){ location.replace(new URL('../admin/', import.meta.url).href); throw new Error('not signed in'); }
  return u;
}

// Sheet rows exactly as engine/core.js tableToRows() returns them, in sheet order.
export async function loadRows(projectId){
  const { data, error } = await sb.from('people').select('pid,name,gender,parent_pid,spouse_pid,birth,mobile,photo').eq('project_id', projectId).order('row_no').limit(10000);
  if (error) throw error;
  return data.map(r => ({ id: r.pid, name: r.name, gender: r.gender, parent_id: r.parent_pid, spouse_id: r.spouse_pid, birth: r.birth, mobile: r.mobile, photo: r.photo }));
}
