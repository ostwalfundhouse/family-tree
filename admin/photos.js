// Project page: the customer's photo link, the people list with photos, and photo review.
import { sb, $, esc, toast, when, ask } from '../js/sb.js';
import { SITE_URL } from '../config.js';
import { makeJpegs, thumbPath, printPath, allPaths } from '../js/photo.js';
import { typedBirth, readBirth, readMobile, BIRTH_HELP, MOBILE_HELP } from '../js/details.js';

let ctx = null, photos = [], links = [], oneFor = null, form = null; // form: { mode: 'edit' | 'child' | 'spouse', pid } of the open person editor
const urls = new Map(); // thumb path -> signed URL (or a local preview right after an upload)

export async function init(c){
  ctx = c; bind();
  await Promise.all([loadLinks(), loadPhotos()]);
}
export function render(){ renderPeople(); }

/* ================= photo link ================= */
// customer links always use the public address (config SITE_URL), even when this page runs on a local copy
const linkUrl = l => SITE_URL + 'upload.html#' + l.token;
const dateOnly = ts => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const farFuture = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 100); return d.toISOString(); };
const isLive = l => l.enabled && (l.permanent || new Date(l.expires_at).getTime() > Date.now());

export async function loadLinks(){
  const { data, error } = await sb.from('share_links').select('id,token,enabled,expires_at,permanent,last_used_at,created_at,password_hash').eq('project_id', ctx.projectId).order('created_at', { ascending: false });
  if (error){ toast('Could not load the photo link: ' + error.message, 6000); return; }
  links = data; renderLinks();
}
function whatsApp(l){
  let d = String(ctx.getProject().customer_phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  const msg = 'Namaste! Please add family photos for your family tree here: ' + linkUrl(l) + (l.permanent ? '' : ' (the link works until ' + dateOnly(l.expires_at) + ')') + (l.password_hash ? '. We will send you the password separately.' : '.');
  return 'https://wa.me/' + (d.length >= 11 ? d : '') + '?text=' + encodeURIComponent(msg);
}
function renderLinks(){
  $('links').innerHTML = links.map(l => {
    const live = isLive(l), expired = !l.permanent && new Date(l.expires_at).getTime() < Date.now();
    const state = !l.enabled ? 'Switched off' : l.permanent ? 'Never expires' : expired ? 'Expired on ' + dateOnly(l.expires_at) : 'Works until ' + dateOnly(l.expires_at);
    return '<div class="link' + (live ? '' : ' dead') + '">' +
      '<input class="field" readonly value="' + esc(linkUrl(l)) + '" aria-label="Photo link">' +
      '<div class="acts"><span class="pill ' + (live ? 'collecting' : 'archived') + '">' + state + '</span>' + (l.permanent ? '<span class="pill">Permanent · used in chart QR codes</span>' : '') +
      '<span class="pill">' + (l.password_hash ? 'Password on' : 'No password') + '</span>' +
      '<span class="hint">' + (l.last_used_at ? 'Last opened ' + when(l.last_used_at) : 'Not opened yet') + '</span></div>' +
      '<div class="acts">' +
        (live ? '<button class="btn" data-link="copy" data-id="' + l.id + '">Copy link</button><a class="btn" target="_blank" rel="noopener" href="' + esc(whatsApp(l)) + '">Send on WhatsApp</a>' : '') +
        (l.permanent ? (l.enabled ? '' : '<button class="btn" data-link="on" data-id="' + l.id + '">Switch on</button>')
          : '<button class="btn" data-link="extend" data-id="' + l.id + '">' + (live ? 'Extend' : 'Turn on again') + '</button>' + (live ? '<button class="btn" data-link="permanent" data-id="' + l.id + '">Make permanent</button>' : '')) +
        '<button class="btn" data-link="pw" data-id="' + l.id + '">' + (l.password_hash ? 'Change password' : 'Add password') + '</button>' +
        (l.password_hash ? '<button class="btn" data-link="nopw" data-id="' + l.id + '">Remove password</button>' : '') +
        (l.enabled ? '<button class="btn danger" data-link="off" data-id="' + l.id + '">Switch off</button>' : '') +
      '</div></div>';
  }).join('');
  $('linkNew').textContent = links.some(isLive) ? 'Create another link' : 'Create photo link';
}
async function createLink(){
  const v = $('linkDays').value, p = ctx.getProject(), permanent = v === 'permanent';
  const { error } = await sb.from('share_links').insert({ project_id: ctx.projectId, permanent, expires_at: permanent ? farFuture() : new Date(Date.now() + +v * 864e5).toISOString() });
  if (error){ toast('Could not create the link: ' + error.message, 6000); return; }
  if (p.status === 'draft'){ const r = await sb.from('projects').update({ status: 'collecting' }).eq('id', ctx.projectId).select('*').single(); if (!r.error) ctx.setProject(r.data); }
  await loadLinks(); toast('Photo link ready. Copy it or send it on WhatsApp.');
}
async function linkAction(act, lid){
  const l = links.find(x => x.id === lid); if (!l) return;
  if (act === 'copy'){ try { await navigator.clipboard.writeText(linkUrl(l)); toast('Link copied'); } catch (e){ toast('Select the link and copy it'); } return; }
  if (act === 'pw' || act === 'nopw'){
    const pw = act === 'nopw' ? '' : await ask({ title: 'Password for this link', text: '4 to 64 characters. Anyone opening the link, or scanning the QR in the PDF, will need it.', input: { placeholder: 'Password' }, ok: 'Save password' });
    if (pw === null) return;
    const { error } = await sb.rpc('set_link_password', { p_link: lid, p_password: pw.trim() });
    if (error){ toast(error.message, 6000); return; }
    await loadLinks(); toast(pw ? 'Password set' : 'Password removed'); return;
  }
  if (act === 'off' && l.permanent && !await ask({ title: 'Switch off the permanent link?', text: 'The QR printed in the PDF will show "switched off" until you switch the link on again.', ok: 'Switch off', danger: true })) return;
  const days = $('linkDays').value === 'permanent' ? 30 : +$('linkDays').value;
  const patch = act === 'off' ? { enabled: false } : act === 'on' ? { enabled: true } : act === 'permanent' ? { permanent: true, expires_at: farFuture() }
    : { enabled: true, expires_at: new Date(Date.now() + days * 864e5).toISOString() };
  const { error } = await sb.from('share_links').update(patch).eq('id', lid);
  if (error){ toast('Could not change the link: ' + error.message, 6000); return; }
  await loadLinks();
  toast(act === 'off' ? 'Link switched off. It stops working at once.' : act === 'on' ? 'Link switched on' : act === 'permanent' ? 'This link now never expires' : 'Link works until ' + dateOnly(patch.expires_at));
}

/* ================= people and photos ================= */
async function loadPhotos(){
  const { data, error } = await sb.from('photos').select('id,person_pid,storage_path,status,source,created_at').eq('project_id', ctx.projectId).in('status', ['pending', 'approved']).order('created_at');
  if (error){ toast('Could not load photos: ' + error.message, 6000); return; }
  photos = data;
  const need = data.map(p => thumbPath(p.storage_path)).filter(t => !urls.has(t));
  if (need.length){
    const { data: signed } = await sb.storage.from('photos').createSignedUrls(need, 3600);
    for (const s of signed || []) if (s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  renderPeople();
}

function relation(r, byId){
  const g = r.gender.toUpperCase()[0];
  if (r.parent_id && byId.has(r.parent_id)) return (g === 'M' ? 'Son of ' : g === 'F' ? 'Daughter of ' : 'Child of ') + byId.get(r.parent_id).name;
  if (r.spouse_id && byId.has(r.spouse_id)) return (g === 'F' ? 'Wife of ' : g === 'M' ? 'Husband of ' : 'Spouse of ') + byId.get(r.spouse_id).name;
  return '';
}
function initials(name){ const w = name.split(' ').filter(Boolean); return ((w[0] || '')[0] || '') + (w.length > 1 ? w[w.length - 1][0] : ''); }

function renderPeople(){
  const rows = ctx.getRows(), byId = new Map(rows.map(r => [r.id, r]));
  const by = new Map(); for (const p of photos){ const e = by.get(p.person_pid) || { approved: null, pending: [] }; if (p.status === 'approved') e.approved = p; else e.pending.push(p); by.set(p.person_pid, e); }
  const withPhoto = rows.filter(r => by.get(r.id) && by.get(r.id).approved).length;
  const pending = photos.filter(p => p.status === 'pending' && byId.has(p.person_pid)).length;
  $('phStats').innerHTML = '<div><b>' + withPhoto + '</b><span>of ' + rows.length + ' have a photo</span></div><div><b>' + pending + '</b><span>waiting for review</span></div>';
  $('photosCard').hidden = !rows.length;

  const q = $('phSearch').value.trim().toLowerCase(), f = $('phFilter').value;
  const shown = rows.filter(r => {
    const e = by.get(r.id), st = e && e.pending.length ? 'pending' : e && e.approved ? 'approved' : 'none';
    return (f === 'all' || f === st || (f === 'none' && !(e && e.approved))) && (!q || r.name.toLowerCase().includes(q));
  });
  $('phEmpty').hidden = shown.length > 0;
  $('phList').innerHTML = shown.map(r => {
    const e = by.get(r.id) || { approved: null, pending: [] }, g = r.gender.toUpperCase()[0] || '', a = e.approved;
    const av = a ? '<img loading="lazy" alt="" src="' + esc(urls.get(thumbPath(a.storage_path)) || '') + '">' : '<span>' + esc(initials(r.name)) + '</span>';
    return '<div class="person">' +
      '<div class="av ' + g + '">' + av + '</div>' +
      '<div class="pi"><b>' + esc(r.name) + '</b><span class="muted">' + esc(relation(r, byId)) + '</span>' +
        (a ? '<span class="muted small">Photo ' + (a.source === 'customer' ? 'from customer' : 'added by you') + '</span>' : '') + '</div>' +
      '<div class="pa">' +
        e.pending.map(p => '<figure class="pend"><img loading="lazy" alt="Photo waiting for review" src="' + esc(urls.get(thumbPath(p.storage_path)) || '') + '"><figcaption>' + (p.source === 'customer' ? 'From customer' : 'Added') + '<br>' + esc(when(p.created_at)) + '</figcaption>' +
          '<span class="acts"><button class="btn small primary" data-ph="approve" data-id="' + p.id + '">Use this</button><button class="btn small" data-ph="reject" data-id="' + p.id + '">Reject</button><button class="btn small" data-ph="full" data-id="' + p.id + '">Full size</button></span></figure>').join('') +
        '<span class="acts"><button class="btn small" data-ph="upload" data-pid="' + esc(r.id) + '">' + (a ? 'Replace photo' : 'Add photo') + '</button>' +
        (a ? '<button class="btn small" data-ph="full" data-id="' + a.id + '">Full size</button><button class="btn small danger" data-ph="remove" data-id="' + a.id + '">Remove photo</button>' : '') + '</span>' +
        '<span class="acts"><button class="btn small" data-ed="edit" data-pid="' + esc(r.id) + '">Edit</button><button class="btn small" data-ed="child" data-pid="' + esc(r.id) + '">Add child</button>' +
        '<button class="btn small" data-ed="spouse" data-pid="' + esc(r.id) + '">Add husband/wife</button><button class="btn small danger" data-ed="delete" data-pid="' + esc(r.id) + '">Delete</button></span>' +
      '</div>' + (form && form.pid === r.id ? personForm(r) : '') + '</div>';
  }).join('');
}

/* ================= people editor: edit, add child or spouse, delete ================= */
function personForm(r){
  const edit = form.mode === 'edit', g = r.gender.toUpperCase()[0];
  const v = edit ? r : { name: '', gender: form.mode === 'spouse' ? (g === 'M' ? 'F' : g === 'F' ? 'M' : '') : '', birth: '', mobile: '' };
  const title = edit ? 'Edit ' + r.name : form.mode === 'child' ? 'New child of ' + r.name : 'New husband or wife of ' + r.name;
  const opt = (val, txt) => '<option value="' + val + '"' + ((v.gender || '').toUpperCase()[0] === val || (!val && !v.gender) ? ' selected' : '') + '>' + txt + '</option>';
  return '<form class="pform fields" data-pid="' + esc(r.id) + '"><h2 class="wide">' + esc(title) + '</h2>' +
    '<label class="f wide">Full name<input class="field" name="name" maxlength="120" required value="' + esc(v.name) + '"></label>' +
    '<label class="f">Gender<select class="field" name="gender">' + opt('M', 'Male') + opt('F', 'Female') + opt('', 'Not set') + '</select></label>' +
    '<label class="f">Birth date<input class="field" name="birth" placeholder="27/05/1970 or 1970" value="' + esc(typedBirth(v.birth)) + '"></label>' +
    '<label class="f">Mobile<input class="field" name="mobile" type="tel" value="' + esc(v.mobile) + '"></label>' +
    '<p class="err wide" hidden></p>' +
    '<div class="acts wide"><button class="btn primary" type="submit">' + (edit ? 'Save' : 'Add to the family') + '</button><button class="btn" type="button" data-ed="cancel">Cancel</button></div></form>';
}

async function savePerson(f){
  const err = f.querySelector('.err'), say = t => { err.textContent = t; err.hidden = false; };
  const name = f.name.value.trim(), birth = readBirth(f.birth.value), mobile = readMobile(f.mobile.value);
  if (!name) return say('Write the full name.');
  if (birth === null) return say(BIRTH_HELP);
  if (mobile === null) return say(MOBILE_HELP);
  f.querySelector('[type=submit]').disabled = true;
  const args = { p_project: ctx.projectId, p_name: name, p_gender: f.gender.value, p_birth: birth, p_mobile: mobile };
  const { error } = form.mode === 'edit' ? await sb.rpc('admin_update_person', { ...args, p_pid: f.dataset.pid })
    : await sb.rpc('admin_add_person', { ...args, p_kind: form.mode, p_target: f.dataset.pid });
  if (error){ say(error.message); f.querySelector('[type=submit]').disabled = false; return; }
  toast(form.mode === 'edit' ? 'Saved' : name + ' added to the family'); form = null; await ctx.reload();
}

async function personAction(act, pid){
  if (act === 'cancel'){ form = null; renderPeople(); return; }
  if (act !== 'delete'){ form = { mode: act, pid }; renderPeople(); const i = document.querySelector('.pform input'); if (i) i.focus(); return; }
  const r = ctx.getRows().find(x => x.id === pid); if (!r || !await ask({ title: 'Delete ' + r.name + '?', text: 'They are removed from the family list, and their photos come off the chart.', ok: 'Delete', danger: true })) return;
  const { data, error } = await sb.rpc('admin_delete_person', { p_project: ctx.projectId, p_pid: pid });
  if (error || !data.ok){ toast(error ? error.message : data.error, 9000); return; }
  toast(r.name + ' deleted'); await loadPhotos(); await ctx.reload();
}

async function photoAction(act, pidOrId){
  if (act === 'upload'){ oneFor = pidOrId; $('fOne').click(); return; }
  const p = photos.find(x => x.id === pidOrId); if (!p) return;
  if (act === 'full'){
    const w = window.open('', '_blank');
    const { data, error } = await sb.storage.from('photos').createSignedUrl(p.storage_path, 600);
    if (error || !w){ if (w) w.close(); toast('Could not open the photo', 5000); return; }
    w.location = data.signedUrl; return;
  }
  // rejected and removed photos stay in storage for now; the retention job deletes them after 30 days
  const { error } = act === 'approve' ? await sb.rpc('approve_photo', { p_photo: p.id })
    : await sb.from('photos').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', p.id);
  if (error){ toast('That did not work: ' + error.message, 6000); return; }
  toast(act === 'approve' ? 'Photo approved' : act === 'remove' ? 'Photo removed from the chart' : 'Photo rejected');
  await loadPhotos(); ctx.onChange();
}

// Admin uploads go straight to storage (admin policy) and are approved at once.
async function uploadFor(pid, file){
  const j = await makeJpegs(file), pidRow = ctx.getRows().find(r => r.id === pid);
  const uuid = crypto.randomUUID(), path = ctx.projectId + '/' + uuid + '.jpg', tp = thumbPath(path), bucket = sb.storage.from('photos');
  for (const [p, blob] of [[path, j.main], [printPath(path), j.print], [tp, j.thumb]]){
    const up = await bucket.upload(p, blob, { contentType: 'image/jpeg' });
    if (up.error){ await bucket.remove(allPaths(path)); throw up.error; }
  }
  const ins = await sb.from('photos').insert({ id: uuid, project_id: ctx.projectId, person_pid: pid, storage_path: path, status: 'pending', source: 'admin' });
  if (ins.error){ await bucket.remove(allPaths(path)); throw ins.error; }
  const ap = await sb.rpc('approve_photo', { p_photo: uuid }); if (ap.error) throw ap.error;
  urls.set(tp, j.preview);
  return pidRow ? pidRow.name : pid;
}

function matcher(){
  const rows = ctx.getRows(), byPhoto = new Map(), byId = new Map(), byName = new Map();
  const bare = s => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').trim();
  for (const r of rows){
    if (r.photo && !byPhoto.has(bare(r.photo))) byPhoto.set(bare(r.photo), r.id);
    byId.set(r.id.toLowerCase(), r.id);
    if (!byName.has(r.name.toLowerCase())) byName.set(r.name.toLowerCase(), r.id);
  }
  return f => { const k = bare(f.name); return byPhoto.get(k) || byId.get(k) || byName.get(k) || null; };
}
async function bulk(files){
  const match = matcher(), plan = files.map(f => [f, match(f)]), miss = plan.filter(x => !x[1]).map(x => x[0].name);
  let ok = 0, fail = 0;
  for (const [f, pid] of plan.filter(x => x[1])){
    toast('Uploading ' + (ok + fail + 1) + ' of ' + (plan.length - miss.length) + '…', 60000);
    try { await uploadFor(pid, f); ok++; } catch (e){ console.error(f.name, e); fail++; }
  }
  await loadPhotos(); ctx.onChange();
  toast(ok + ' photo' + (ok === 1 ? '' : 's') + ' added' + (fail ? ', ' + fail + ' failed' : '') + (miss.length ? '. No match for: ' + miss.slice(0, 6).join(', ') + (miss.length > 6 ? ' and ' + (miss.length - 6) + ' more' : '') : ''), 9000);
}

function bind(){
  $('linkNew').onclick = createLink;
  $('links').onclick = e => { const b = e.target.closest('[data-link]'); if (b) linkAction(b.dataset.link, b.dataset.id); };
  $('links').onfocusin = e => { if (e.target.matches('input')) e.target.select(); };
  $('phSearch').oninput = renderPeople; $('phFilter').onchange = renderPeople;
  $('phList').onclick = e => { const b = e.target.closest('[data-ph]'); if (b) photoAction(b.dataset.ph, b.dataset.pid || b.dataset.id); const d = e.target.closest('[data-ed]'); if (d) personAction(d.dataset.ed, d.dataset.pid); };
  $('phList').onsubmit = e => { e.preventDefault(); savePerson(e.target); };
  $('phBulk').onclick = () => $('fBulk').click();
  $('fBulk').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) bulk(fs); };
  $('fOne').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !oneFor) return;
    try { const name = await uploadFor(oneFor, f); await loadPhotos(); ctx.onChange(); toast('Photo added for ' + name); }
    catch (err){ console.error(err); toast('Could not add the photo: ' + (err.message || err), 7000); }
  };
}
