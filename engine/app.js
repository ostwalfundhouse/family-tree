/* ============ app state ============ */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const S = { rows: ROWS0, photos: {}, custom: false, opts: { birth: true, mobile: true, sort: 'sheet', title: '' }, focus: null, sel: null, view: { x: 0, y: 0, k: 1 }, panel: null };
let model = null, lay = null, theme = {}, raf = 0, dpr = 1, W = 0, H = 0, fitK = 1;
const TODAY = new Date();
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, ms){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms || 3200); }
function loadOpts(){ try { const o = JSON.parse(localStorage.getItem('ftree.opts') || 'null'); if (o) Object.assign(S.opts, o); } catch (e){} }
function saveOpts(){ try { localStorage.setItem('ftree.opts', JSON.stringify(S.opts)); } catch (e){} }
function defaultTitle(){ const r = model && model.root; if (!r) return 'Family Tree'; const w = r.head.name.split(' '); const sur = w[w.length - 1] || ''; return sur ? sur[0].toUpperCase() + sur.slice(1).toLowerCase() + ' Family' : 'Family Tree'; }
function chartTitle(){ return (S.opts.title || '').trim() || defaultTitle(); }

/* ============ photos: one shared sprite sheet of round thumbnails ============ */
const CELL = 128, PER = 16, atlas = { pages: [], map: new Map(), n: 0 };
function photoKeyFor(p){
  const P = S.photos, tryKeys = [];
  if (p.photo){ const k = p.photo.toLowerCase(); tryKeys.push(k, k.replace(/\.[a-z0-9]+$/, '')); }
  tryKeys.push(String(p.id).toLowerCase(), p.name.toLowerCase());
  for (const k of tryKeys) if (P[k]) return k;
  return null;
}
function normPhotoKeys(obj){ const out = {}; for (const k in obj){ const v = obj[k], url = v.startsWith('data:') ? v : 'data:image/jpeg;base64,' + v, key = k.toLowerCase(); out[key] = url; const bare = key.replace(/\.[a-z0-9]+$/, ''); if (!out[bare]) out[bare] = url; } return out; }
function atlasSlot(key){
  let s = atlas.map.get(key); if (s) return s;
  const i = atlas.n++, pg = Math.floor(i / (PER * PER)), j = i % (PER * PER);
  if (!atlas.pages[pg]){ const c = document.createElement('canvas'); c.width = c.height = CELL * PER; atlas.pages[pg] = c; }
  s = { pg, x: (j % PER) * CELL, y: Math.floor(j / PER) * CELL, ready: false }; atlas.map.set(key, s);
  const im = new Image();
  im.onload = () => { const c = atlas.pages[pg].getContext('2d'); c.save(); c.beginPath(); c.arc(s.x + CELL / 2, s.y + CELL / 2, CELL / 2 - 1, 0, 7); c.clip(); const m = Math.min(im.width, im.height); c.drawImage(im, (im.width - m) / 2, (im.height - m) * .25, m, m, s.x, s.y, CELL, CELL); c.restore(); s.ready = true; requestDraw(); };
  im.src = S.photos[key];
  return s;
}
function resetAtlas(){ atlas.pages = []; atlas.map = new Map(); atlas.n = 0; }

/* ============ canvas drawing ============ */
function readTheme(){ const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim(); theme = { paper: g('--paper'), ink: g('--ink'), sub: g('--sub'), line: g('--line'), male: g('--male'), female: g('--female'), accent: g('--accent'), blank: g('--blank'), none: g('--line') }; }
const FONT_CHART = '"Arimo","Liberation Sans",Arial,Helvetica,sans-serif', FONT_DISPLAY = '"Rozha One",Georgia,serif';
function drawChart(c, L, T, k, lod, vis){
  // connectors
  c.strokeStyle = T.line; c.lineWidth = Math.max(1.3, .9 / k); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  for (const l of L.lines){
    if (l.k === 'L'){ c.moveTo(l.x1, l.y1); c.lineTo(l.x2, l.y2); }
    else if (l.k === 'Q'){ c.moveTo(l.x0, l.y0); c.quadraticCurveTo(l.cx, l.cy, l.x1, l.y1); }
    else { c.moveTo(l.r * Math.cos(l.a0), l.r * Math.sin(l.a0)); c.arc(0, 0, l.r, l.a0, l.a1); }
  }
  c.stroke();
  const showText = !lod || G.nameSize * k >= 5, bars = lod && !showText && G.nameSize * k >= 1.6;
  for (const q of L.people){
    const reach = q.r + G.labGap + (q.len || 0) + 30;
    if (vis && (q.x + reach < vis.x0 || q.x - reach > vis.x1 || q.y + reach < vis.y0 || q.y - reach > vis.y1)) continue;
    const ring = q.p.gender === 'M' ? T.male : q.p.gender === 'F' ? T.female : T.none, r = q.r;
    if (lod && r * k < 2.2){ c.fillStyle = ring; c.beginPath(); c.arc(q.x, q.y, Math.max(r, 1.4 / k), 0, 7); c.fill(); }
    else {
      const key = photoKeyFor(q.p), s = key && atlasSlot(key);
      if (s && s.ready) c.drawImage(atlas.pages[s.pg], s.x, s.y, CELL, CELL, q.x - r, q.y - r, 2 * r, 2 * r);
      else { c.fillStyle = T.blank; c.beginPath(); c.arc(q.x, q.y, r - 1, 0, 7); c.fill(); if (!key && r * k > 7){ c.fillStyle = ring; c.font = '700 ' + (r * .62) + 'px ' + FONT_CHART; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(initials(q.p.name), q.x, q.y + r * .03); } }
      c.strokeStyle = ring; c.lineWidth = Math.max(r * .058, 1.2 / k); if (q.p.isRef) c.setLineDash([r * .2, r * .13]); c.beginPath(); c.arc(q.x, q.y, r - 1, 0, 7); c.stroke(); c.setLineDash([]);
    }
    if (S.sel === q.p.id && lod){ c.strokeStyle = T.accent; c.lineWidth = Math.max(5, 3 / k); c.beginPath(); c.arc(q.x, q.y, r + Math.max(5, 4 / k), 0, 7); c.stroke(); }
    if (q.root || !(showText || bars)) continue;
    const rot = q.flip ? q.th + Math.PI : q.th, dir = q.flip ? -1 : 1, Ht = q.lines.reduce((s, l) => s + l.lh, 0);
    c.save(); c.translate(q.x, q.y); c.rotate(rot); c.textAlign = q.flip ? 'right' : 'left'; c.textBaseline = 'alphabetic';
    let yy = -Ht / 2;
    for (const l of q.lines){
      const y = yy + l.lh / 2, x = dir * (r + G.labGap);
      if (showText){ c.fillStyle = l.sub ? T.sub : T.ink; c.font = (l.bold ? '700 ' : '400 ') + l.size + 'px ' + FONT_CHART; c.fillText(l.s, x, y + l.size * .35); }
      else { c.fillStyle = l.sub ? T.line : T.sub; c.globalAlpha = .55; c.fillRect(dir > 0 ? x : x - l.w, y - l.size * .22, l.w, l.size * .44); c.globalAlpha = 1; }
      yy += l.lh;
    }
    c.restore();
  }
  for (const t of L.texts){
    let size = t.size; c.font = (t.display ? '400 ' : t.bold ? '700 ' : '400 ') + size + 'px ' + (t.display ? FONT_DISPLAY : FONT_CHART);
    if (t.maxW){ const w = c.measureText(t.s).width; if (w > t.maxW){ size *= t.maxW / w; c.font = '400 ' + size + 'px ' + FONT_DISPLAY; } }
    if (lod && size * k < 3) continue;
    c.fillStyle = t.sub ? T.sub : T.ink; c.textAlign = t.al === 'r' ? 'right' : t.al === 'c' ? 'center' : 'left'; c.textBaseline = 'alphabetic'; c.fillText(t.s, t.x, t.y + size * .35);
  }
}
function draw(){
  raf = 0; if (!W || !H) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = theme.paper; ctx.fillRect(0, 0, W, H);
  if (!lay){ ctx.fillStyle = theme.sub; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('No people to show yet. Open Data to upload a sheet.', W / 2, H / 2); return; }
  const v = S.view; ctx.translate(W / 2 + v.x, H / 2 + v.y); ctx.scale(v.k, v.k);
  const vis = { x0: (-W / 2 - v.x) / v.k, x1: (W / 2 - v.x) / v.k, y0: (-H / 2 - v.y) / v.k, y1: (H / 2 - v.y) / v.k };
  drawChart(ctx, lay, theme, v.k, true, vis);
}
function requestDraw(){ if (!raf) raf = requestAnimationFrame(draw); }
function resize(){ const r = $('stage').getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(window.devicePixelRatio || 1, 2.5); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); if (lay) fitK = calcFit(); requestDraw(); }
function calcFit(){ return Math.min(W / lay.box.w, H / lay.box.h); }
function home(){ return { x: -lay.box.cx * fitK, y: -lay.box.cy * fitK, k: fitK }; }
function clampView(){ const v = S.view; v.k = Math.max(fitK * .5, Math.min(3.2, v.k)); if (!lay) return; const lx = lay.box.w / 2 * v.k, ly = lay.box.h / 2 * v.k, ox = -lay.box.cx * v.k, oy = -lay.box.cy * v.k; v.x = Math.max(ox - lx, Math.min(ox + lx, v.x)); v.y = Math.max(oy - ly, Math.min(oy + ly, v.y)); }
let anim = 0;
function flyTo(x, y, k, ms){
  cancelAnimationFrame(anim); const v = S.view, a = { x: v.x, y: v.y, k: v.k }, b = { x, y, k }, t0 = performance.now();
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; ms = still ? 0 : (ms == null ? 520 : ms);
  const step = now => { const t = ms ? Math.min(1, (now - t0) / ms) : 1, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; const lk = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e);
    v.k = lk; v.x = a.x + (b.x - a.x) * e; v.y = a.y + (b.y - a.y) * e; requestDraw(); if (t < 1) anim = requestAnimationFrame(step); };
  anim = requestAnimationFrame(step);
}
function fit(ms){ if (!lay) return; fitK = calcFit(); const h = home(); flyTo(h.x, h.y, h.k, ms); }
function zoomAt(px, py, f){ const v = S.view, k0 = v.k; v.k = Math.max(fitK * .5, Math.min(3.2, v.k * f)); const r = v.k / k0; v.x = px - (px - v.x) * r; v.y = py - (py - v.y) * r; clampView(); requestDraw(); }
function panelInset(){ const p = $('panel'); if (p.hidden) return { r: 0, b: 0 }; const pr = p.getBoundingClientRect(), sr = $('stage').getBoundingClientRect(); return pr.width >= sr.width - 2 ? { r: 0, b: pr.height } : { r: pr.width, b: 0 }; }
function showPerson(id, zoom){
  const q = lay && (lay.people.find(q => q.p.id === id && !q.p.isRef) || lay.people.find(q => q.p.id === id)); if (!q) return;
  const ins = panelInset(), k = zoom ? Math.max(S.view.k, Math.min(1.1, Math.max(.75, fitK * 6))) : S.view.k;
  const mx = q.root ? q.x : q.x + Math.cos(q.th) * (q.len || 0) * .35, my = q.root ? q.y : q.y + Math.sin(q.th) * (q.len || 0) * .35;
  flyTo(-mx * k - ins.r / 2, -my * k - ins.b / 2, k);
}

/* ============ pointer, wheel, keyboard ============ */
const ptrs = new Map(); let gesture = null;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); cancelAnimationFrame(anim);
  if (ptrs.size === 1) gesture = { t: 'pan', sx: e.offsetX, sy: e.offsetY, vx: S.view.x, vy: S.view.y, moved: 0, time: performance.now() };
  else if (ptrs.size === 2){ const [a, b] = [...ptrs.values()]; gesture = { t: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), moved: 99 }; }
  cv.classList.add('drag'); });
cv.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p || !gesture) return; const px = p.x, py = p.y; p.x = e.offsetX; p.y = e.offsetY;
  if (gesture.t === 'pan' && ptrs.size === 1){ gesture.moved = Math.max(gesture.moved, Math.hypot(e.offsetX - gesture.sx, e.offsetY - gesture.sy)); S.view.x = gesture.vx + e.offsetX - gesture.sx; S.view.y = gesture.vy + e.offsetY - gesture.sy; clampView(); requestDraw(); }
  else if (ptrs.size === 2){ const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - W / 2, my = (a.y + b.y) / 2 - H / 2; S.view.x += (p.x - px) / 2; S.view.y += (p.y - py) / 2; if (gesture.d > 0) zoomAt(mx, my, d / gesture.d); gesture.d = d; } });
const endPtr = e => { const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (!had) return;
  if (gesture && gesture.t === 'pan' && gesture.moved < 7 && performance.now() - gesture.time < 600 && e.type === 'pointerup') tap(e.offsetX, e.offsetY);
  if (ptrs.size === 1){ const p = [...ptrs.values()][0]; gesture = { t: 'pan', sx: p.x, sy: p.y, vx: S.view.x, vy: S.view.y, moved: 99, time: 0 }; }
  else if (!ptrs.size){ gesture = null; cv.classList.remove('drag'); } };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY; zoomAt(e.offsetX - W / 2, e.offsetY - H / 2, Math.exp(-dy * (e.ctrlKey ? .012 : .0022))); }, { passive: false });
cv.addEventListener('dblclick', e => zoomAt(e.offsetX - W / 2, e.offsetY - H / 2, 1.8));
cv.addEventListener('keydown', e => { const st = 70; if (e.key === '+' || e.key === '=') zoomAt(0, 0, 1.3); else if (e.key === '-') zoomAt(0, 0, 1 / 1.3); else if (e.key === '0') fit(); else if (e.key === 'ArrowLeft'){ S.view.x += st; } else if (e.key === 'ArrowRight'){ S.view.x -= st; } else if (e.key === 'ArrowUp'){ S.view.y += st; } else if (e.key === 'ArrowDown'){ S.view.y -= st; } else return; e.preventDefault(); clampView(); requestDraw(); });
function hit(px, py){
  if (!lay) return null; const v = S.view, wx = (px - W / 2 - v.x) / v.k, wy = (py - H / 2 - v.y) / v.k, slack = Math.max(0, 14 / v.k - 10); let best = null, bd = 1e9;
  for (const q of lay.people){
    const dx = wx - q.x, dy = wy - q.y, d = Math.hypot(dx, dy);
    if (d < q.r + slack + 4){ if (d < bd){ bd = d; best = q; } continue; }
    if (q.root) continue;
    const c = Math.cos(q.th), s = Math.sin(q.th), lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (lx > 0 && lx < q.r + G.labGap + q.len + 6 && Math.abs(ly) < G.slot / 2 - 4 && d < bd + 1e6 && !best){ best = q; bd = d + 1e5; }
  }
  return best;
}
function tap(px, py){ const q = hit(px, py); if (q){ S.sel = q.p.id; openPanel('person'); requestDraw(); } else if (S.panel === 'person'){ closePanel(); } }
$('zIn').onclick = () => zoomAt(0, 0, 1.5); $('zOut').onclick = () => zoomAt(0, 0, 1 / 1.5); $('zFit').onclick = () => fit();

/* ============ rebuild ============ */
function rebuild(keepView){
  model = buildModel(S.rows, TODAY);
  if (S.focus && !model.P.has(S.focus)) S.focus = null;
  if (S.sel && !model.P.has(S.sel)) S.sel = null;
  relayout(keepView);
}
function relayout(keepView){
  lay = model.root ? layoutTree(model, Object.assign({}, S.opts, { title: S.focus ? 'Family of ' + titleCase(model.P.get(S.focus).unit.head.name) : chartTitle() }), S.focus) : null;
  $('brandName').textContent = chartTitle(); document.title = chartTitle() + ' Tree';
  $('brandMeta').textContent = model.list.length + ' people' + (lay ? ' · ' + (S.focus ? lay.count + ' in this branch' : lay.gens + ' generations') : '');
  const n = model.issues.length, dot = $('issueDot'); dot.hidden = !n; dot.textContent = n;
  $('crumb').hidden = !S.focus; if (S.focus) $('crumbText').textContent = 'Branch of ' + titleCase(model.P.get(S.focus).unit.head.name);
  if (lay){ fitK = calcFit(); if (!keepView){ S.view = home(); } clampView(); }
  if (S.panel) renderPanel();
  requestDraw();
}
function titleCase(s){ return s.toLowerCase().replace(/(^|[\s,.-])([a-z])/g, (m, a, b) => a + b.toUpperCase()); }
$('crumbBack').onclick = () => { S.focus = null; relayout(); };

/* ============ search ============ */
const q = $('q'), qres = $('qres'); let qsel = 0, qlist = [];
function runSearch(){
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !model){ qres.hidden = true; return; }
  qlist = model.list.filter(p => { const n = p.name.toLowerCase(); return words.every(w => n.includes(w) || p.mobile.includes(w)); }).slice(0, 12); qsel = 0;
  qres.innerHTML = qlist.length ? qlist.map((p, i) => '<li role="option" data-i="' + i + '" aria-selected="' + (i === 0) + '"><span>' + esc(titleCase(p.name)) + '</span><small>' + (p.birth && p.birth[0] !== '?' ? esc(p.birth.slice(0, 4)) : '') + '</small></li>').join('') : '<li aria-disabled="true"><span>No one by that name</span></li>';
  qres.hidden = false;
}
function pickSearch(i){ const p = qlist[i]; if (!p) return; qres.hidden = true; q.blur(); gotoPerson(p.id); }
function gotoPerson(id){
  if (!lay.people.some(x => x.p.id === id)){ S.focus = null; relayout(true); }
  if (!lay.people.some(x => x.p.id === id)){ toast('This person is not linked to the tree yet. See Data for what to fix.'); return; }
  S.sel = id; openPanel('person'); requestAnimationFrame(() => showPerson(id, true));
}
q.addEventListener('input', runSearch); q.addEventListener('focus', runSearch);
q.addEventListener('keydown', e => { if (qres.hidden) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); qsel = (qsel + (e.key === 'ArrowDown' ? 1 : -1) + qlist.length) % Math.max(1, qlist.length); [...qres.children].forEach((li, i) => li.setAttribute('aria-selected', i === qsel)); } else if (e.key === 'Enter'){ e.preventDefault(); pickSearch(qsel); } else if (e.key === 'Escape'){ qres.hidden = true; } });
qres.addEventListener('pointerdown', e => { const li = e.target.closest('li[data-i]'); if (li){ e.preventDefault(); pickSearch(+li.dataset.i); } });
document.addEventListener('pointerdown', e => { if (!e.target.closest('.search')) qres.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); q.focus(); } else if (e.key === 'Escape' && S.panel) closePanel(); });

/* ============ panels ============ */
const panel = $('panel'), body = $('panelBody');
function openPanel(name){ S.panel = name; panel.hidden = false; renderPanel(); for (const [b, n] of [['bOptions', 'options'], ['bData', 'data'], ['bExport', 'export']]) $(b).setAttribute('aria-pressed', n === name); }
function closePanel(){ S.panel = null; panel.hidden = true; for (const b of ['bOptions', 'bData', 'bExport']) $(b).setAttribute('aria-pressed', false); }
$('panelClose').onclick = closePanel;
for (const [b, n] of [['bOptions', 'options'], ['bData', 'data'], ['bExport', 'export']]) $(b).onclick = () => S.panel === n ? closePanel() : openPanel(n);
function chip(p){ return '<button class="chip" data-go="' + esc(p.id) + '"><i class="' + p.gender + '"></i>' + esc(titleCase(p.name)) + '</button>'; }
function renderPanel(){
  const t = $('panelTitle');
  if (S.panel === 'person'){
    const p = model.P.get(S.sel); if (!p){ closePanel(); return; }
    t.textContent = 'Person';
    // reference copies (marriages within the family) stand in for the real person, so map them back
    const real = m => m.ref || m, uniq = a => [...new Set(a)];
    const u = p.unit, par = u && u.parentUnit && u.head === p ? u.parentUnit.members.map(real) : [];
    const sp = uniq((u ? u.members.map(real) : []).concat(p.partners)).filter(m => m !== p);
    // a wife shown beside her husband by reference: his children are hers when she is his only spouse
    const hostKids = model.units.filter(h => h !== u && h.members.length === 2 && h.members[1].isRef && h.members[1].ref === p).flatMap(h => h.kids.map(k => k.head));
    const kids = uniq((u ? u.kids.map(k => k.head) : []).concat(hostKids));
    const sibs = u && u.parentUnit && u.head === p ? u.parentUnit.kids.map(k => k.head).filter(x => x !== p) : [];
    const age = ageOf(p.birth, TODAY), gen = u && u.d != null && lay && lay.people.some(x => x.p === p) ? u.d + 1 : null;
    const myIssues = model.issues.filter(i => i.id === p.id);
    body.innerHTML = '<div class="who"><canvas id="whoPic" width="168" height="168"></canvas><div><div class="nm">' + esc(titleCase(p.name)) + '</div><div class="hint">' + (p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : '') + (gen ? (p.gender ? ' · ' : '') + 'generation ' + gen + (S.focus ? ' of this branch' : '') : '') + '</div></div></div>' +
      '<dl class="kv">' + (p.birth ? '<dt>Born</dt><dd>' + esc(showDate(p.birth)) + (age != null && age >= 0 && age <= 130 ? ' (age ' + age + ')' : '') + '</dd>' : '') + (p.mobile ? '<dt>Mobile</dt><dd><span id="mob">' + esc(p.mobile) + '</span> <button class="btn small" id="copyMob">Copy</button></dd>' : '') + '<dt>Sheet id</dt><dd>' + esc(p.id) + '</dd></dl>' +
      (myIssues.length ? '<ul class="issues">' + myIssues.map(i => '<li>' + esc(i.t) + '</li>').join('') + '</ul>' : '') +
      (par.length ? '<div class="sec"><h3>Parents</h3><div class="chips">' + par.map(chip).join('') + '</div></div>' : '') +
      (sp.length ? '<div class="sec"><h3>' + (sp.length > 1 ? 'Spouses' : 'Spouse') + '</h3><div class="chips">' + sp.map(chip).join('') + '</div></div>' : '') +
      (kids.length ? '<div class="sec"><h3>Children (' + kids.length + ')</h3><div class="chips">' + kids.map(chip).join('') + '</div></div>' : '') +
      (sibs.length ? '<div class="sec"><h3>Brothers and sisters (' + sibs.length + ')</h3><div class="chips">' + sibs.map(chip).join('') + '</div></div>' : '') +
      '<div class="acts"><button class="btn" id="actZoom">Show on chart</button>' + (u && u.kids.length && u !== (lay && lay.root) ? '<button class="btn" id="actBranch">Chart this branch only</button>' : '') + '</div>';
    const pc = $('whoPic').getContext('2d'), key = photoKeyFor(p), ring = p.gender === 'M' ? theme.male : p.gender === 'F' ? theme.female : theme.none;
    const paint = () => { pc.clearRect(0, 0, 168, 168); const s = key && atlasSlot(key); if (s && s.ready) pc.drawImage(atlas.pages[s.pg], s.x, s.y, CELL, CELL, 6, 6, 156, 156); else { pc.fillStyle = theme.blank; pc.beginPath(); pc.arc(84, 84, 77, 0, 7); pc.fill(); pc.fillStyle = ring; pc.font = '700 52px ' + FONT_CHART; pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.fillText(initials(p.name), 84, 87); if (s) setTimeout(paint, 200); } pc.strokeStyle = ring; pc.lineWidth = 6; pc.beginPath(); pc.arc(84, 84, 78, 0, 7); pc.stroke(); };
    paint();
    $('actZoom').onclick = () => showPerson(p.id, true);
    if ($('actBranch')) $('actBranch').onclick = () => { S.focus = p.unit.head.id; relayout(); toast('Showing only this branch. Use "Whole family" to go back.'); };
    if ($('copyMob')) $('copyMob').onclick = async () => { try { await navigator.clipboard.writeText(p.mobile); toast('Number copied'); } catch (e){ const r = document.createRange(); r.selectNodeContents($('mob')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Number selected. Copy it from here.'); } };
  } else if (S.panel === 'options'){
    t.textContent = 'Options';
    body.innerHTML = '<div class="sec"><h3>On each label</h3><div class="row"><label for="oBirth">Birth dates</label><input type="checkbox" class="sw" id="oBirth"' + (S.opts.birth ? ' checked' : '') + '></div><div class="row"><label for="oMobile">Mobile numbers</label><input type="checkbox" class="sw" id="oMobile"' + (S.opts.mobile ? ' checked' : '') + '></div><p class="hint">Turn mobile numbers off before sharing a print outside the family. The rings pull in when labels get shorter.</p></div>' +
      '<div class="sec"><h3>Order of children</h3><select class="field" id="oSort"><option value="sheet">As listed in the sheet</option><option value="birth">Oldest first, by birth date</option></select></div>' +
      '<div class="sec"><h3>Title in the centre</h3><input class="field" id="oTitle" type="text" maxlength="60" placeholder="' + esc(defaultTitle()) + '" value="' + esc(S.opts.title) + '"></div>' +
      '<div class="sec"><h3>How the chart sizes itself</h3><p class="hint">Each generation is one ring. Every branch gets a slice of the circle as wide as its widest generation needs, and the rings move outward until all slices fit. Add people to the sheet and the chart regrows by itself.</p></div>';
    $('oSort').value = S.opts.sort;
    $('oBirth').onchange = e => { S.opts.birth = e.target.checked; saveOpts(); relayout(); };
    $('oMobile').onchange = e => { S.opts.mobile = e.target.checked; saveOpts(); relayout(); };
    $('oSort').onchange = e => { S.opts.sort = e.target.value; saveOpts(); relayout(); };
    $('oTitle').oninput = e => { S.opts.title = e.target.value; saveOpts(); clearTimeout(renderPanel.t); renderPanel.t = setTimeout(() => { const keep = S.panel; S.panel = null; relayout(true); S.panel = keep; }, 250); };
  } else if (S.panel === 'data'){
    t.textContent = 'Family data';
    const withPhoto = model.list.filter(p => photoKeyFor(p)).length;
    body.innerHTML = '<div class="sec"><p class="hint">' + (window.FT_EMBED ? 'Showing the sheet saved for this project' : S.custom ? 'Showing the sheet you uploaded on this device' : 'Showing the built-in family, read from the original chart') + ': ' + model.list.length + ' people, ' + withPhoto + ' with a photo.</p>' +
      (window.FT_EMBED ? '<div class="acts"><button class="btn" id="dDown">Download sheet</button></div><p class="hint">To change the people, upload a corrected sheet on the project page.</p></div>' :
      '<div class="acts"><button class="btn primary" id="dUp">Upload sheet</button><button class="btn" id="dPh">Add photos</button><button class="btn" id="dDown">Download sheet</button>' + (S.custom ? '<button class="btn" id="dReset">Back to built-in family</button>' : '') + '</div>' +
      '<p class="hint">Download the sheet, edit it in Excel or Google Sheets, then upload it again as .xlsx or .csv. Uploads stay on this device.</p></div>') +
      '<div class="sec"><h3>Things to check (' + model.issues.length + ')</h3>' + (model.issues.length ? '<ul class="issues">' + model.issues.slice(0, 60).map(i => '<li>' + esc(i.t) + ' <button data-go="' + esc(i.id) + '">Show</button></li>').join('') + '</ul>' + (model.issues.length > 60 ? '<p class="hint">and ' + (model.issues.length - 60) + ' more.</p>' : '') : '<p class="hint">Nothing to fix. Every person is linked and every date reads cleanly.</p>') + '</div>' +
      '<div class="sec"><h3>Columns in the sheet</h3><table class="cols"><tr><td>id</td><td>Any unique number or code for the person.</td></tr><tr><td>name</td><td>Full name as it should print.</td></tr><tr><td>gender</td><td>M or F. Sets the ring colour.</td></tr><tr><td>parent_id</td><td>The id of the father or mother, for people born into the family.</td></tr><tr><td>spouse_id</td><td>For someone who married in: the id of their husband or wife.</td></tr><tr><td>birth</td><td>1970-05-27 or 27/05/1970. A year alone also works.</td></tr><tr><td>mobile</td><td>Optional.</td></tr><tr><td>photo</td><td>The photo file name, such as satish.jpg. Then use Add photos to pick the files.</td></tr></table></div>';
    if ($('dUp')) $('dUp').onclick = () => $('fSheet').click(); if ($('dPh')) $('dPh').onclick = () => $('fPhotos').click(); $('dDown').onclick = downloadSheet;
    if ($('dReset')) $('dReset').onclick = async () => { S.rows = ROWS0; S.photos = normPhotoKeys(PHOTOS0); S.custom = false; resetAtlas(); S.focus = S.sel = null; await idbDel(); rebuild(); toast('Back to the built-in family'); };
  } else if (S.panel === 'export'){
    t.textContent = 'Export';
    const pt2cm = 2.54 / 72;
    const papers = [['full', 'Full size'], ['a0', 'A0'], ['a1', 'A1'], ['a2', 'A2'], ['a3', 'A3']];
    const info = k => { const s = paperScale(k); return (lay.box.w * s * pt2cm).toFixed(0) + ' \u00D7 ' + (lay.box.h * s * pt2cm).toFixed(0) + ' cm, names ' + (G.nameSize * s).toFixed(1) + ' pt'; };
    body.innerHTML = (lay ? '<div class="sec"><h3>PDF for printing</h3><select class="field" id="xPaper">' + papers.map(([k, n]) => '<option value="' + k + '">' + n + ' – ' + info(k) + '</option>').join('') + '</select><p class="hint">The PDF is vector, so one file prints sharp at any size. Names below about 5 pt are hard to read on paper; choose a bigger sheet or chart one branch at a time.</p><div class="acts"><button class="btn primary" id="xPdf">Save PDF</button></div></div>' +
      '<div class="sec"><h3>Image for WhatsApp</h3><select class="field" id="xPx"><option value="4000">4,000 px, quick to send</option><option value="8000">8,000 px, readable when zoomed</option><option value="12000">12,000 px, largest</option></select><div class="acts"><button class="btn" id="xPng">Save PNG</button></div></div>' +
      '<p class="hint">Exports follow the current options' + (S.focus ? ' and include only the branch on screen' : '') + (S.opts.mobile ? '. Mobile numbers are included; switch them off in Options to leave them out.' : '. Mobile numbers are left out.') + '</p>' : '<p class="hint">Nothing to export yet.</p>');
    if (lay){ $('xPaper').value = renderPanel.paper || 'full'; $('xPaper').onchange = e => { renderPanel.paper = e.target.value; }; $('xPx').value = renderPanel.px || '8000'; $('xPx').onchange = e => { renderPanel.px = e.target.value; };
      $('xPdf').onclick = () => busy($('xPdf'), 'Building PDF', () => exportPDF($('xPaper').value)); $('xPng').onclick = () => busy($('xPng'), 'Rendering', () => exportPNG(+$('xPx').value)); }
  }
}
body.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) gotoPerson(b.dataset.go); });
async function busy(btn, label, fn){ const old = btn.textContent; btn.disabled = true; btn.textContent = label + '…'; try { await new Promise(r => setTimeout(r, 30)); await fn(); } catch (e){ console.error(e); toast('That did not work: ' + (e.message || e), 6000); } btn.disabled = false; btn.textContent = old; }

/* ============ import ============ */
$('fSheet').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const table = /\.csv$/i.test(f.name) || f.type === 'text/csv' ? parseCSV(await f.text()) : await readXLSX(await f.arrayBuffer());
    const rows = tableToRows(table); if (!rows.length) throw new Error('No people found below the header row.');
    S.rows = rows; S.custom = true; S.focus = S.sel = null; rebuild(); idbSave();
    toast(rows.length + ' people loaded from ' + f.name + (model.issues.length ? '. ' + model.issues.length + ' thing' + (model.issues.length > 1 ? 's' : '') + ' to check.' : ''), 5000); openPanel('data');
  } catch (err){ console.error(err); toast('Could not read ' + f.name + '. ' + (err.message || ''), 7000); }
});
$('fPhotos').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return; let n = 0;
  for (const f of files){
    try { const bmp = await createImageBitmap(f), c = document.createElement('canvas'); c.width = c.height = 192; const m = Math.min(bmp.width, bmp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 192, 192); g.drawImage(bmp, (bmp.width - m) / 2, (bmp.height - m) * .25, m, m, 0, 0, 192, 192);
      const url = c.toDataURL('image/jpeg', .82), key = f.name.toLowerCase(); S.photos[key] = url; S.photos[key.replace(/\.[a-z0-9]+$/, '')] = url; atlas.map.delete(key); atlas.map.delete(key.replace(/\.[a-z0-9]+$/, '')); n++; } catch (err){ console.warn('photo skipped', f.name, err); }
  }
  const matched = model.list.filter(p => photoKeyFor(p)).length; idbSave(); requestDraw(); if (S.panel) renderPanel();
  toast(n + ' photo' + (n === 1 ? '' : 's') + ' added. ' + matched + ' of ' + model.list.length + ' people now have one.', 5000);
});
function downloadSheet(){
  const rows = model.list.map(p => [p.id, p.name, p.gender, p.parent, p.spouseRef, p.birth[0] === '?' ? p.birth.slice(1) : p.birth, p.mobile, p.photo]);
  saveFile(slug() + '-family-sheet.xlsx', writeXLSX(['id', 'name', 'gender', 'parent_id', 'spouse_id', 'birth', 'mobile', 'photo'], rows));
}
function slug(){ return (chartTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family') + (S.focus ? '-branch-' + S.focus : ''); }

/* ============ export ============ */
function paperScale(k){ const b = lay.box, lo = Math.min(b.w, b.h), hi = Math.max(b.w, b.h), mm = { a0: 841, a1: 594, a2: 420, a3: 297 }[k]; if (!mm) return Math.min(1, 14400 / hi); const pt = mm / 25.4 * 72; return Math.min(pt / lo, pt * Math.SQRT2 / hi); }
async function saveFile(filename, blob){
  if (window.FT_ON_FILE){ window.FT_ON_FILE(filename, blob); return; }   // a host page (admin) takes the file instead of a download
  if (window.claude && window.claude.use){
    let dl = null; try { dl = await window.claude.use('downloads'); } catch (e){}
    if (!dl){ toast('Saving files is not available in this view. Open the page in Claude on a computer or phone app.', 6000); return; }
    try { await dl.save({ filename, data: blob }); toast('Saved ' + filename); }
    catch (e){ toast(e && e.code === 'declined' ? 'Save cancelled' : e && e.code === 'rate_limited' ? 'A save prompt is already open. Answer it, then try again.' : 'Could not save the file' + (e && e.message ? ': ' + e.message : ''), 6000); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); toast('Saved ' + filename);
}
async function waitPhotos(){ for (const qp of lay.people){ const k = photoKeyFor(qp.p); if (k) atlasSlot(k); } for (let i = 0; i < 100; i++){ if ([...atlas.map.values()].every(s => s.ready)) break; await new Promise(r => setTimeout(r, 80)); } }
function renderToCanvas(px){
  const b = lay.box, k = px / Math.max(b.w, b.h), c = document.createElement('canvas'); c.width = Math.round(b.w * k); c.height = Math.round(b.h * k); const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = PRINT.paper; g.fillRect(0, 0, c.width, c.height); g.scale(k, k); g.translate(-b.x0, -b.y0);
  const keep = S.sel; S.sel = null; drawChart(g, lay, PRINT, k, false, null); S.sel = keep;
  try { const d = g.getImageData(2, 2, 1, 1).data; if (d[3] === 0) return null; } catch (e){ return null; }
  return c;
}
async function exportPNG(px){
  await waitPhotos(); let c = null, used = px;
  for (const s of [px, 8000, 6000, 4000, 3000, 2000]){ if (s > px) continue; c = renderToCanvas(s); if (c){ used = s; break; } }
  if (!c) throw new Error('this device could not draw an image that large');
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('the image could not be encoded');
  if (used < px) toast('This device can draw up to ' + used.toLocaleString() + ' px, so that size was used.', 5000);
  await saveFile(slug() + '.png', blob);
}
async function exportPDF(paper){
  const sc = paperScale(paper), pw = lay.box.w * sc, ph = lay.box.h * sc, title = chartTitle();
  const allText = [...lay.texts.map(t => t.s), ...lay.people.flatMap(qp => qp.lines.map(l => l.s).concat(qp.p.name))];
  if (!allText.every(isLatin)){
    // names in other scripts: place a high-resolution picture of the chart on the page instead
    await waitPhotos(); let c = null; for (const s of [9000, 6000, 4000]){ c = renderToCanvas(s); if (c) break; } if (!c) throw new Error('this device could not draw the chart');
    const bytes = b64bytes(c.toDataURL('image/jpeg', .9).split(',')[1]);
    const content = 'q ' + pw.toFixed(2) + ' 0 0 ' + ph.toFixed(2) + ' 0 0 cm /I0 Do Q\n' + pdfQR(window.FT_PDF_EXTRA, pw, ph);
    await saveFile(slug() + '.pdf', await makePDF({ wPt: pw, hPt: ph, content, images: [{ w: c.width, h: c.height, n: 3, bytes }], title, links: pdfQRLinks(window.FT_PDF_EXTRA, pw, ph) })); return;
  }
  // a host page can supply sharper photos for print: FT_EXPORT_PHOTOS([{ id, px }]) -> { id: jpeg data URL }, px = circle size at 300 dpi
  const hi = window.FT_EXPORT_PHOTOS ? await window.FT_EXPORT_PHOTOS(lay.people.map(qp => ({ id: qp.p.id, px: Math.ceil(2 * qp.r * sc / 72 * 300) }))) : {};
  const images = [], index = new Map(), seen = new Map();
  for (const qp of lay.people){ const k = photoKeyFor(qp.p), url = hi[qp.p.id] || (k && S.photos[k]); if (!url) continue; let i = seen.get(url); if (i == null){ if (!/^data:image\/jpeg/.test(url)) continue; const bytes = b64bytes(url.split(',')[1]), inf = jpegInfo(bytes); if (!inf) continue; i = images.length; images.push({ w: inf.w, h: inf.h, n: inf.n, bytes }); seen.set(url, i); } index.set(qp.p.id, i); }
  const content = chartToPDFContent(lay, index, sc, pw, ph) + '\n' + pdfQR(window.FT_PDF_EXTRA, pw, ph);   // host page may add a QR (FT_PDF_EXTRA)
  await saveFile(slug() + '.pdf', await makePDF({ wPt: pw, hPt: ph, content, images, title, links: pdfQRLinks(window.FT_PDF_EXTRA, pw, ph) }));
}

/* ============ remember uploads on this device ============ */
function idb(){ return new Promise((res, rej) => { try { const r = indexedDB.open('ftree', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e){ rej(e); } }); }
async function idbSave(){ if (window.FT_EMBED) return; try { const db = await idb(); const custom = {}; for (const k in S.photos) if (!BUILTIN.has(k)) custom[k] = S.photos[k]; db.transaction('kv', 'readwrite').objectStore('kv').put({ rows: S.custom ? S.rows : null, photos: custom }, 'data'); } catch (e){} }
async function idbLoad(){ if (window.FT_EMBED) return null; try { const db = await idb(); return await new Promise(res => { const r = db.transaction('kv').objectStore('kv').get('data'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e){ return null; } }
async function idbDel(){ try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete('data'); } catch (e){} }

/* ============ boot ============ */
let BUILTIN = new Set();
function start(){
  // view only (the public chart behind a QR): no options, data or export, and no right-click "save image"
  if (window.FT_VIEWONLY){ for (const b of ['bOptions', 'bData', 'bExport']) $(b).hidden = true; cv.addEventListener('contextmenu', e => e.preventDefault()); }
  loadOpts(); if (window.FT_TITLE != null) S.opts.title = window.FT_TITLE; if (window.FT_VIEWONLY) Object.assign(S.opts, { birth: true, mobile: true }); /* the server already removed what may not show */ S.photos = normPhotoKeys(PHOTOS0); BUILTIN = new Set(Object.keys(S.photos)); readTheme(); resize(); rebuild();
  new ResizeObserver(() => { const was = S.view.k <= fitK * 1.02; resize(); if (was && lay){ S.view = home(); } clampView(); requestDraw(); }).observe($('stage'));
  const retheme = () => { readTheme(); requestDraw(); if (S.panel === 'person') renderPanel(); };
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestDraw);
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 18px Arimo'), document.fonts.load('400 18px Arimo'), document.fonts.load('400 40px "Rozha One"')]).then(requestDraw, () => {});
  idbLoad().then(d => { if (!d) return; let ch = false; if (d.photos && Object.keys(d.photos).length){ Object.assign(S.photos, d.photos); ch = true; } if (d.rows && d.rows.length){ S.rows = d.rows; S.custom = true; ch = true; } if (ch){ resetAtlas(); rebuild(); } });
}
window.__ftree = { S, get lay(){ return lay; }, get model(){ return model; }, exportPDF, exportPNG, renderToCanvas, writeXLSX, readXLSX, tableToRows, parseCSV, makePDF, chartToPDFContent, fit };
start();
