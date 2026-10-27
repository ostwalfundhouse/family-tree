// Loads one project's people from Supabase, then starts the unchanged chart engine on them.
import { sb, requireAdmin, loadRows } from './sb.js';
import { thumbPath, printPath, cropSquare, PRINT_PX } from './photo.js';

const approved = new Map(); // sheet id -> storage path of the approved photo

// Approved photos as JPEG data URLs keyed by sheet id (the engine matches photos by id; its PDF export needs data URLs).
async function loadPhotos(projectId){
  const { data, error } = await sb.from('photos').select('person_pid,storage_path').eq('project_id', projectId).eq('status', 'approved');
  if (error || !data.length) return {};
  for (const p of data) approved.set(p.person_pid, p.storage_path);
  const { data: signed } = await sb.storage.from('photos').createSignedUrls(data.map(p => thumbPath(p.storage_path)), 600);
  const pidOf = new Map(data.map(p => [thumbPath(p.storage_path), p.person_pid])), out = {};
  await Promise.all((signed || []).filter(s => s.signedUrl).map(async s => {
    try {
      const blob = await (await fetch(s.signedUrl)).blob();
      out[pidOf.get(s.path)] = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    } catch (e){ console.warn('photo skipped', s.path, e); }
  }));
  return out;
}

// PDF export asks for each photo at the size its circle prints at 300 dpi (engine hook FT_EXPORT_PHOTOS).
// The 768 px print copy covers ordinary circles; the large centre couple, and photos stored before
// print copies existed, are cut from the 2400 px original.
function say(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.hidden = !msg; }
window.FT_EXPORT_PHOTOS = async needs => {
  const jobs = needs.filter(n => approved.has(n.id)).map(n => { const main = approved.get(n.id); return { id: n.id, px: n.px, main, first: n.px <= PRINT_PX ? printPath(main) : main }; });
  if (!jobs.length) return {};
  const { data: signed } = await sb.storage.from('photos').createSignedUrls([...new Set(jobs.flatMap(j => [j.first, j.main]))], 600);
  const urls = new Map((signed || []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
  const out = {}, queue = jobs.slice(); let done = 0;
  const one = async j => {
    for (const p of new Set([j.first, j.main])){
      const u = urls.get(p), r = u && await fetch(u); if (!r || !r.ok) continue;
      const bmp = await createImageBitmap(await r.blob());
      out[j.id] = cropSquare(bmp, j.px).toDataURL('image/jpeg', .9); bmp.close(); break;
    }
    say('Preparing photos for print: ' + (++done) + ' of ' + jobs.length);
  };
  // six at a time keeps memory steady on big families
  await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length){ const j = queue.shift(); try { await one(j); } catch (e){ console.warn('print photo skipped', j.id, e); } } }));
  say('');
  return out;
};

function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.body.appendChild(s); }); }

const id = new URLSearchParams(location.search).get('project');
try {
  await requireAdmin();
  if (!id) throw new Error('No project given.');
  const [{ data: project, error }, rows, photos] = await Promise.all([sb.from('projects').select('name,chart_title').eq('id', id).single(), loadRows(id), loadPhotos(id)]);
  if (error) throw error;
  Object.assign(window, { FT_EMBED: true, FT_TITLE: project.chart_title || '', ROWS0: rows, PHOTOS0: photos });
  for (const src of ['engine/widths.js', 'engine/core.js', 'engine/app.js']) await loadScript(src);
} catch (e){
  if (e.message !== 'not signed in'){ const t = document.getElementById('toast'); t.textContent = 'Could not open this chart. ' + (e.message || ''); t.hidden = false; }
}
