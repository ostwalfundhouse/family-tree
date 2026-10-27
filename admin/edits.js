// Project page: birth dates and mobile numbers changed by the family through the photo link.
// Those changes go straight onto the list, so this shows each one with the old value and an Undo.
import { sb, $, esc, toast, when } from '../js/sb.js';

let ctx = null, edits = [];
const FIELD = { birth: 'Birth date', mobile: 'Mobile', name: 'Name', added: 'Added to the family', photo: 'Photo' };
const UNDO = { added: 'Remove again', photo: 'Restore previous photo' };

let sugs = [];
const G = { M: 'male', F: 'female' };

export async function init(c){
  ctx = c;
  $('edList').onclick = async e => { const b = e.target.closest('[data-undo]'); if (b) undo(+b.dataset.undo, b); };
  $('sgList').onclick = async e => { const b = e.target.closest('[data-review]'); if (b) review(+b.dataset.id, b.dataset.review === 'yes', b); };
  await load();
}

export async function load(){
  const [ed, sg] = await Promise.all([
    sb.from('person_edits').select('*').eq('project_id', ctx.projectId).order('created_at', { ascending: false }).limit(200),
    sb.from('name_suggestions').select('*').eq('project_id', ctx.projectId).eq('status', 'pending').order('created_at')]);
  if (ed.error || sg.error){ toast('Could not load changes: ' + (ed.error || sg.error).message, 6000); return; }
  edits = ed.data; sugs = sg.data; render(); renderSugs();
}

/* ---- suggestions: what the family proposes, applied only on Approve ---- */
function renderSugs(){
  const names = new Map(ctx.getRows().map(r => [r.id, r.name]));
  $('sgCard').hidden = !sugs.length; $('sgCount').textContent = sugs.length;
  $('sgList').innerHTML = sugs.map(s => {
    const who = esc(names.get(s.person_pid) || 'someone no longer on the list');
    const extra = [G[s.gender], s.birth && 'born ' + esc(showDate(parseDate(s.birth))), s.mobile && 'mobile ' + esc(s.mobile)].filter(Boolean).join(', ');
    const nameBox = s.kind === 'remove' ? '' : '<input class="field" data-name="' + s.id + '" maxlength="120" value="' + esc(s.name) + '" aria-label="Name">';
    const what = s.kind === 'rename' ? 'Change the name of <b>' + who + '</b> to' : s.kind === 'add_child' ? 'Add a child of <b>' + who + '</b>' + (extra ? ' (' + extra + ')' : '')
      : s.kind === 'add_spouse' ? 'Add a husband or wife of <b>' + who + '</b>' + (extra ? ' (' + extra + ')' : '') : 'Remove <b>' + who + '</b> from the list';
    return '<li class="sug"><div class="what"><span>' + what + '</span>' + nameBox + (s.note ? '<span class="muted">“' + esc(s.note) + '”</span>' : '') +
      '<span class="hint">' + esc(when(s.created_at)) + '</span></div>' +
      '<div class="acts"><button class="btn small primary" data-review="yes" data-id="' + s.id + '">Approve</button><button class="btn small" data-review="no" data-id="' + s.id + '">Reject</button></div></li>';
  }).join('');
}

async function review(id, yes, btn){
  btn.disabled = true;
  const box = document.querySelector('[data-name="' + id + '"]');
  const { data, error } = await sb.rpc('review_suggestion', { p_id: id, p_approve: yes, p_name: box ? box.value : null });
  if (error || !data.ok){ toast('Could not ' + (yes ? 'approve' : 'reject') + ': ' + (error ? error.message : data.error), 9000); btn.disabled = false; return; }
  toast(yes ? 'Approved and on the chart' : 'Rejected'); await ctx.onChange();
}

// sheet ids with a family change that is still in force, for the sheet-upload warning
export const familyEdited = () => edits.filter(e => !e.undone_at);

const shown = (f, v) => !v ? '(empty)' : f === 'birth' ? showDate(parseDate(v)) : v;   // showDate/parseDate from engine/core.js

function render(){
  const names = new Map(ctx.getRows().map(r => [r.id, r.name]));
  $('edCard').hidden = !edits.length;
  $('edCount').textContent = edits.filter(e => !e.undone_at).length;
  $('edList').innerHTML = edits.map(e => '<li class="edit-row' + (e.undone_at ? ' undone' : '') + '">' +
    '<div><b>' + esc(names.get(e.person_pid) || (e.field === 'added' ? e.new_value : 'Removed person (' + e.person_pid + ')')) + '</b> · ' + FIELD[e.field] + '<br>' +
    (e.field === 'added' ? '<span class="muted">New person from the family</span>'
      : e.field === 'photo' ? '<span class="muted">New photo from the family' + (e.old_value ? ' (the previous one is kept for 30 days)' : '') + '</span>'
      : '<span class="muted">' + esc(shown(e.field, e.old_value)) + '</span> → <b>' + esc(shown(e.field, e.new_value)) + '</b>') + '</div>' +
    '<div class="acts"><span class="hint">' + esc(when(e.created_at)) + (e.undone_at ? ' · undone' : '') + '</span>' +
    (e.undone_at ? '' : '<button class="btn small" data-undo="' + e.id + '">' + (UNDO[e.field] || 'Undo') + '</button>') + '</div></li>').join('');
}

async function undo(id, btn){
  btn.disabled = true;
  const { data, error } = await sb.rpc('undo_person_edit', { p_edit: id });
  if (error || !data.ok){ toast('Could not undo: ' + (error ? error.message : data.error), 7000); btn.disabled = false; return; }
  toast('Change undone'); await load(); ctx.onChange();
}
