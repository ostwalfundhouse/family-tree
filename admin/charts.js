// Project page: the final chart. Each saved chart has a QR code that never changes (to forward, or to frame):
// scanning it opens the saved PDF view only (chart.html, PDF.js, via chart-open), optionally behind a password.
// "Update PDF" redraws the file from the current family tree under the same QR. The PDF can carry a QR in its bottom-right corner that opens the family's permanent
// private link. QR codes use the qrcode-generator library (global `qrcode`).
import { sb, $, esc, toast, when, ask } from '../js/sb.js';
import { SITE_URL } from '../config.js';

let ctx = null, charts = [];
const PAPER = { full: 'Full size', a0: 'A0', a1: 'A1', a2: 'A2', a3: 'A3' };
const chartUrl = c => SITE_URL + 'chart.html#' + c.token;
const linkUrl = l => SITE_URL + 'upload.html#' + l.token;

export async function init(c){
  ctx = c;
  $('chForm').onsubmit = e => { e.preventDefault(); make(); };
  $('chList').onclick = e => { const b = e.target.closest('[data-ch]'); if (b) action(b.dataset.ch, b.dataset.id, b); };
  $('chList').onfocusin = e => { if (e.target.matches('input[readonly]')) e.target.select(); };
  await load();
}
export async function load(){
  const { data, error } = await sb.from('charts').select('*').eq('project_id', ctx.projectId).order('created_at', { ascending: false });
  if (error){ toast('Could not load saved charts: ' + error.message, 6000); return; }
  charts = data; render();
}

/* ---------- QR helpers ---------- */
function qrOf(text){ const q = qrcode(0, 'M'); q.addData(text); q.make(); return q; }
function qrSvg(text){ return qrOf(text).createSvgTag({ cellSize: 4, margin: 4, scalable: true }); }
// a print-ready PNG: QR with a white border and a caption under it, for framing or WhatsApp
function qrPng(text, caption){
  const q = qrOf(text), n = q.getModuleCount(), cell = Math.max(8, Math.floor(1200 / (n + 8))), side = cell * (n + 8), capH = caption ? Math.round(side * .14) : 0;
  const c = document.createElement('canvas'); c.width = side; c.height = side + capH;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#191D3A';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
  if (caption){ g.font = '600 ' + Math.round(capH * .42) + 'px Mukta, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(caption, side / 2, side + capH * .35); }
  return new Promise(res => c.toBlob(res, 'image/png'));
}
function download(blob, name){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); }
const slug = s => (s || 'family-tree').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family-tree';
const status = t => { $('chStatus').textContent = t; };

/* ---------- the family's permanent private link (for the QR printed in the PDF) ---------- */
async function permanentLink(id){
  const q = sb.from('share_links').select('*').eq('project_id', ctx.projectId);
  const { data: have } = await (id ? q.eq('id', id) : q.eq('permanent', true).order('created_at').limit(1));
  if (have && have.length){
    const l = have[0];
    if (!l.enabled && !await ask({ title: 'Switch the private link back on?', text: 'The private link used by the QR in the PDF is switched off. Switch it on so that QR works?', ok: 'Switch on' })) return null;
    if (!l.enabled){ await sb.from('share_links').update({ enabled: true }).eq('id', l.id); ctx.linksChanged(); }
    return l;
  }
  const far = new Date(); far.setFullYear(far.getFullYear() + 100);
  const { data, error } = await sb.from('share_links').insert({ project_id: ctx.projectId, permanent: true, expires_at: far.toISOString() }).select('*').single();
  if (error) throw error;
  ctx.linksChanged();
  return data;
}

/* ---------- draw the PDF in the preview (with the corner QR when there is a link) ---------- */
async function renderPdf(paper, link){
  const win = $('preview').contentWindow;
  if (!win || !win.__ftree || !win.__ftree.lay) throw new Error('wait for the chart preview to finish loading, then try again');
  if (typeof qrcode !== 'function') throw new Error('the QR code tool did not load; check the internet connection and reload');
  status('Drawing the chart and preparing photos for print…');
  const blob = await new Promise((resolve, reject) => {
    if (link){ const q = qrOf(linkUrl(link)); win.FT_PDF_EXTRA = { qr: { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) }, caption: 'Scan or tap to add photos and details', url: linkUrl(link) }; }
    win.FT_ON_FILE = (name, file) => resolve(file);
    win.__ftree.exportPDF(paper).catch(reject);
  }).finally(() => { delete win.FT_PDF_EXTRA; delete win.FT_ON_FILE; });
  return blob;
}
async function saveFile(blob, id){
  status('Saving the PDF (' + (blob.size / 1048576).toFixed(1) + ' MB)…');
  const path = id + '-' + Date.now() + '.pdf';
  const up = await sb.storage.from('charts').upload(path, blob, { contentType: 'application/pdf' });
  if (up.error) throw up.error;
  return path;
}

// the preview's Options, saved with the chart so the automatic rebuild draws it the same way
function previewOpts(){ const o = $('preview').contentWindow.__ftree.S.opts; return { birth: !!o.birth, mobile: !!o.mobile, sort: o.sort || 'sheet' }; }

async function make(){
  const pw = $('chPw').value.trim();
  if (pw && (pw.length < 4 || pw.length > 64)){ toast('Use a password of 4 to 64 characters, or leave it empty.', 6000); return; }
  $('chMake').disabled = true;
  try {
    let link = null;
    if ($('chQr').checked){ status('Preparing the private link…'); link = await permanentLink(); if (!link){ status(''); return; } }
    const blob = await renderPdf($('chPaper').value, link), p = ctx.getProject(), id = crypto.randomUUID(), path = await saveFile(blob, id);
    const title = p.chart_title || p.name;
    const ins = await sb.from('charts').insert({ id, project_id: ctx.projectId, title, storage_path: path, paper: $('chPaper').value, bytes: blob.size, link_id: link ? link.id : null, opts: previewOpts(), file_kind: 'print' });
    if (ins.error){ await sb.storage.from('charts').remove([path]); throw ins.error; }
    if (pw){ const s = await sb.rpc('set_chart_password', { p_chart: id, p_password: pw }); if (s.error) throw s.error; }
    $('chPw').value = ''; status(''); toast('Saved. The QR code is ready below.');
    await load();
  } catch (e){ console.error(e); status(''); toast('Could not make the PDF: ' + (e.message || e), 8000); }
  finally { $('chMake').disabled = false; }
}

// same QR, fresh PDF from the current family tree; the old file is removed
async function update(c, btn){
  btn.disabled = true;
  try {
    const link = c.link_id ? await permanentLink(c.link_id) : null;
    if (c.link_id && !link){ status(''); btn.disabled = false; return; }
    const blob = await renderPdf(c.paper, link), path = await saveFile(blob, c.id);
    // the file it replaces becomes the "previous" one (Restore); the one before that is removed
    const up = await sb.from('charts').update({ storage_path: path, bytes: blob.size, file_updated_at: new Date().toISOString(), file_kind: 'print',
      prev_path: c.storage_path, prev_kind: c.file_kind, rebuild_error: null, opts: previewOpts() }).eq('id', c.id);
    if (up.error){ await sb.storage.from('charts').remove([path]); throw up.error; }
    if (c.prev_path) await sb.storage.from('charts').remove([c.prev_path]);
    status(''); toast('PDF updated. The QR code stays the same.');
    await load();
  } catch (e){ console.error(e); status(''); toast('Could not update the PDF: ' + (e.message || e), 8000); btn.disabled = false; }
}

/* ---------- list ---------- */
function render(){
  const p = ctx.getProject(), changed = c => p.data_changed_at && new Date(p.data_changed_at) > new Date(c.file_updated_at);
  $('chList').innerHTML = charts.map(c => {
    const url = chartUrl(c), wa = 'https://wa.me/?text=' + encodeURIComponent('Your family tree: ' + url + (c.password_hash ? ' (we will send the password separately)' : ''));
    return '<article class="chart' + (c.enabled ? '' : ' dead') + '"><div class="qr">' + qrSvg(url) + '</div><div class="ci">' +
      '<b>' + esc(c.title) + '</b>' +
      '<span class="hint">Scanning opens this PDF, view only (no download or share). Opened ' + c.views + (c.views === 1 ? ' time' : ' times') + '.</span>' +
      '<span class="hint">PDF for printing: ' + esc(PAPER[c.paper] || c.paper) + (c.bytes ? ', ' + (c.bytes < 1048576 ? Math.max(1, Math.round(c.bytes / 1024)) + ' KB' : (c.bytes / 1048576).toFixed(1) + ' MB') : '') + ', made ' + esc(when(c.file_updated_at)) + (c.link_id ? ', with the private-link QR in the corner' : '') + '.</span>' +
      (c.file_kind === 'light' ? '<span class="warn">Light version, updated automatically after family changes (small photos, quick to open). Press Update PDF for the print-quality version before printing.</span>' : '') +
      (c.rebuild_error ? '<span class="warn">Automatic update skipped: ' + esc(c.rebuild_error) + '</span>' : '') +
      (changed(c) && !c.rebuild_error ? '<span class="warn">' + (c.auto_update && c.enabled ? 'The family tree has changed. This PDF updates itself within about 10 minutes, or press Update PDF now.' : 'The family tree has changed since this PDF was made. Press Update PDF so the QR shows the latest version.') + '</span>' : '') +
      '<div class="acts"><span class="pill ' + (c.enabled ? 'delivered' : 'archived') + '">' + (c.enabled ? 'QR on' : 'QR off') + '</span><span class="pill">' + (c.password_hash ? 'Password on' : 'No password') + '</span></div>' +
      '<input class="field" readonly value="' + esc(url) + '" aria-label="Chart link">' +
      '<div class="acts">' +
        '<button class="btn small" data-ch="png" data-id="' + c.id + '">Download QR image</button>' +
        '<button class="btn small" data-ch="copy" data-id="' + c.id + '">Copy link</button>' +
        '<a class="btn small" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a>' +
        '<button class="btn small" data-ch="pw" data-id="' + c.id + '">' + (c.password_hash ? 'Change password' : 'Add password') + '</button>' +
        (c.password_hash ? '<button class="btn small" data-ch="nopw" data-id="' + c.id + '">Remove password</button>' : '') +
        '<button class="btn small" data-ch="toggle" data-id="' + c.id + '">' + (c.enabled ? 'Switch QR off' : 'Switch QR on') + '</button>' +
      '</div><div class="acts">' +
        '<button class="btn small primary" data-ch="open" data-id="' + c.id + '">Open PDF</button>' +
        '<button class="btn small" data-ch="update" data-id="' + c.id + '">Update PDF</button>' +
        '<button class="btn small" data-ch="auto" data-id="' + c.id + '">' + (c.auto_update ? 'Auto-update: on' : 'Auto-update: off') + '</button>' +
        (c.prev_path ? '<button class="btn small" data-ch="restore" data-id="' + c.id + '">Restore previous PDF</button>' : '') +
        '<button class="btn small danger" data-ch="delete" data-id="' + c.id + '">Delete</button>' +
      '</div></div></article>';
  }).join('') || '<p class="hint">Nothing saved yet.</p>';
}

async function action(act, id, btn){
  const c = charts.find(x => x.id === id); if (!c) return;
  const done = async msg => { toast(msg); await load(); };
  if (act === 'open'){
    const w = window.open('', '_blank'), { data, error } = await sb.storage.from('charts').createSignedUrl(c.storage_path, 600);
    if (error || !w){ if (w) w.close(); toast('Could not open the PDF', 5000); return; } w.location = data.signedUrl; return;
  }
  if (act === 'update') return update(c, btn);
  if (act === 'png'){ download(await qrPng(chartUrl(c), 'Scan to see our family tree'), slug(c.title) + '-qr.png'); return; }
  if (act === 'copy'){ try { await navigator.clipboard.writeText(chartUrl(c)); toast('Link copied'); } catch (e){ toast('Select the link and copy it'); } return; }
  if (act === 'pw' || act === 'nopw'){
    const pw = act === 'nopw' ? '' : await ask({ title: 'Password for this QR code', text: '4 to 64 characters. Anyone scanning the QR will need it, so send it to the family separately.', input: { placeholder: 'Password' }, ok: 'Save password' });
    if (pw === null) return;
    const { error } = await sb.rpc('set_chart_password', { p_chart: id, p_password: pw.trim() });
    if (error){ toast(error.message, 6000); return; }
    return done(pw ? 'Password set. Anyone scanning the QR now needs it.' : 'Password removed');
  }
  if (act === 'toggle'){
    const { error } = await sb.from('charts').update({ enabled: !c.enabled }).eq('id', id);
    if (error){ toast(error.message, 6000); return; }
    return done(c.enabled ? 'QR switched off. Scanning it now shows a message instead of the family tree.' : 'QR switched on');
  }
  if (act === 'auto'){
    const { error } = await sb.from('charts').update({ auto_update: !c.auto_update }).eq('id', id);
    if (error){ toast(error.message, 6000); return; }
    return done(c.auto_update ? 'Auto-update off: this PDF stays as it is until you press Update PDF.' : 'Auto-update on: this PDF updates itself after family changes.');
  }
  if (act === 'restore'){
    if (!await ask({ title: 'Restore the previous PDF?', text: 'The QR goes back to showing the previous version. Turn Auto-update off if it should stay that way after the next family change.', ok: 'Restore' })) return;
    const { error } = await sb.from('charts').update({ storage_path: c.prev_path, file_kind: c.prev_kind || 'print', prev_path: c.storage_path, prev_kind: c.file_kind,
      file_updated_at: new Date().toISOString(), rebuild_error: null }).eq('id', id);
    if (error){ toast(error.message, 6000); return; }
    return done('Previous PDF restored');
  }
  if (act === 'delete'){
    if (!await ask({ title: 'Delete this PDF and its QR code?', text: 'The PDF is deleted for good, and its QR code (including any framed copy) stops working.', typeWord: 'DELETE', ok: 'Delete for good', danger: true })) return;
    const rm = await sb.storage.from('charts').remove([c.storage_path, c.prev_path].filter(Boolean));
    if (rm.error){ toast(rm.error.message, 6000); return; }
    await sb.from('charts').delete().eq('id', id);
    return done('Deleted');
  }
}
