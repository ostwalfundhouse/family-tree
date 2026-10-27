'use strict';
/* ============ text metrics (Helvetica / Times-Bold tables, shared by screen layout and PDF) ============ */
const CP_EXT = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';
function cpByte(ch){ const c = ch.charCodeAt(0); if (c < 128 || (c >= 160 && c < 256)) return c; const i = CP_EXT.indexOf(ch); return i < 0 ? -1 : 128 + i; }
function isLatin(s){ for (const ch of s) if (cpByte(ch) < 0) return false; return true; }
function tw(s, size, f){ let w = 0; const T = WID[f]; for (const ch of s){ const b = cpByte(ch); w += (b >= 32 && T[b - 32]) || 620; } return w * size / 1000; }

/* ============ dates ============ */
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function isoOK(y, m, d){ const t = new Date(Date.UTC(y, m - 1, d)); return y > 0 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
function pad2(n){ return String(n).padStart(2, '0'); }
function parseDate(v){
  if (v == null) return '';
  let s = String(v).trim(); if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s)){
    const n = Number(s);
    if (n >= 1000 && n <= 2200 && Number.isInteger(n)) return String(n);            // a bare year
    if (n > 2200 && n < 110000){ const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5); return t.getUTCFullYear() + '-' + pad2(t.getUTCMonth() + 1) + '-' + pad2(t.getUTCDate()); } // Excel serial
    return '?' + s;
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m && isoOK(+m[1], +m[2], +m[3])) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);                           // day first, as written in India
  if (m && isoOK(+m[3], +m[2], +m[1])) return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  const mi = t => MON.findIndex(x => t.toLowerCase().startsWith(x.toLowerCase())) + 1;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (m && mi(m[2]) && isoOK(+m[3], mi(m[2]), +m[1])) return m[3] + '-' + pad2(mi(m[2])) + '-' + pad2(m[1]);
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && mi(m[1]) && isoOK(+m[3], mi(m[1]), +m[2])) return m[3] + '-' + pad2(mi(m[1])) + '-' + pad2(m[2]);
  return '?' + s;
}
function showDate(iso){
  if (!iso) return ''; if (iso[0] === '?') return iso.slice(1);
  const m = iso.match(/^(\d{4})-(\d\d)-(\d\d)$/); if (!m) return iso;
  return (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1];
}
function ageOf(iso, today){
  const m = iso && iso.match(/^(\d{4})-(\d\d)-(\d\d)$/); if (!m) return null;
  let a = today.getFullYear() - +m[1]; const md = (today.getMonth() + 1) * 100 + today.getDate();
  if (md < +m[2] * 100 + +m[3]) a--; return a;
}

/* ============ model: rows -> people, couples, generations ============ */
const HEAD = {
  id:['id','personid','no','sno','srno'], name:['name','fullname','person'], gender:['gender','sex'],
  parent:['parentid','parent','fatherid','father','motherid','mother','childof'], spouse:['spouseid','spouse','partnerid','partner','husbandid','wifeid','husband','wife','marriedto'],
  birth:['birth','dob','birthdate','dateofbirth','born'], mobile:['mobile','phone','mobileno','mobilenumber','contact','phoneno'], photo:['photo','image','picture','photofile','pic']
};
function mapHeaders(hdr){
  const norm = hdr.map(h => String(h == null ? '' : h).toLowerCase().replace(/[^a-z]/g, ''));
  const map = {};
  for (const k in HEAD) for (const alias of HEAD[k]){ const i = norm.indexOf(alias); if (i >= 0 && map[k] == null){ map[k] = i; break; } }
  return map;
}
function tableToRows(table){
  const t = table.filter(r => r && r.some(c => String(c == null ? '' : c).trim() !== ''));
  if (!t.length) throw new Error('The sheet is empty.');
  const map = mapHeaders(t[0]);
  if (map.name == null) throw new Error('No "name" column found. The first row must hold the column names: id, name, gender, parent_id, spouse_id, birth, mobile, photo.');
  const get = (r, k) => map[k] == null ? '' : String(r[map[k]] == null ? '' : r[map[k]]).trim();
  const fixNum = s => /^\d+(\.0+)?$/.test(s) ? s.replace(/\.0+$/, '') : (/^\d(\.\d+)?E\+?\d+$/i.test(s) ? Number(s).toFixed(0) : s);
  return t.slice(1).map((r, i) => ({
    id: fixNum(get(r, 'id')) || String(i + 1), name: get(r, 'name'), gender: get(r, 'gender'),
    parent_id: fixNum(get(r, 'parent')), spouse_id: fixNum(get(r, 'spouse')), birth: get(r, 'birth'), mobile: fixNum(get(r, 'mobile')), photo: get(r, 'photo')
  })).filter(r => r.name);
}
function buildModel(rows, today){
  const P = new Map(), issues = [], list = [];
  rows.forEach((r, idx) => {
    const id = String(r.id == null ? '' : r.id).trim();
    const g = String(r.gender || '').trim().toUpperCase()[0];
    const p = { id, idx, name: String(r.name || '').replace(/\s+/g, ' ').trim(), gender: g === 'M' || g === 'F' ? g : '', parent: String(r.parent_id == null ? '' : r.parent_id).trim(),
      spouseRef: String(r.spouse_id == null ? '' : r.spouse_id).trim(), birth: parseDate(r.birth), mobile: String(r.mobile == null ? '' : r.mobile).trim(), photo: String(r.photo || '').trim(), partners: [], kids: [] };
    if (P.has(id)){ issues.push({ t: 'Two rows share the id ' + id + '. The second one (' + p.name + ') was left out.', id: P.get(id).id }); return; }
    P.set(id, p); list.push(p);
  });
  for (const p of list){
    if (p.parent && !P.has(p.parent)){ issues.push({ t: p.name + ': parent_id ' + p.parent + ' is not in the sheet.', id: p.id }); p.parent = ''; }
    if (p.parent === p.id){ issues.push({ t: p.name + ' is listed as their own parent.', id: p.id }); p.parent = ''; }
    if (p.spouseRef){
      const s = P.get(p.spouseRef);
      if (!s || s === p) issues.push({ t: p.name + ': spouse_id ' + p.spouseRef + ' is not in the sheet.', id: p.id });
      else { if (!p.partners.includes(s)) p.partners.push(s); if (!s.partners.includes(p)) s.partners.push(p); }
    }
    if (p.birth[0] === '?') issues.push({ t: p.name + ': the birth date "' + p.birth.slice(1) + '" could not be read. Use 1970-05-27 or 27/05/1970.', id: p.id });
    else { const a = ageOf(p.birth, today); if (a != null && a < 0) issues.push({ t: p.name + ': the birth date ' + showDate(p.birth) + ' is in the future.', id: p.id }); else if (a != null && a > 130) issues.push({ t: p.name + ': born ' + showDate(p.birth) + ', which is over 130 years ago. Check the year.', id: p.id }); }
  }
  // units: one bloodline person (the head) plus whoever married in
  const units = [];
  const mk = head => { const u = { head, members: [head], kids: [], parentUnit: null, depth: 0 }; head.unit = u; units.push(u); return u; };
  for (const p of list) if (p.parent) mk(p);
  for (const p of list){
    if (p.unit) continue;
    const host = p.partners.find(s => s.unit && s.unit.head === s);
    if (host){ p.unit = host.unit; host.unit.members.push(p); continue; }
    if (p.partners.some(s => s.unit)) { const s = p.partners.find(s => s.unit); p.unit = s.unit; s.unit.members.push(p); continue; }
    // parentless and not married to a placed person: a root (take the row that the partner rows point at, else this row)
    mk(p);
    for (const s of p.partners) if (!s.unit && !s.parent){ s.unit = p.unit; p.unit.members.push(s); }
  }
  for (const u of units) u.members.sort((a, b) => (a === u.head ? -1 : b === u.head ? 1 : a.idx - b.idx));
  for (const u of units) if (u.head.parent){ const pu = P.get(u.head.parent).unit; u.parentUnit = pu; pu.kids.push(u); }
  // marriages within the family: both partners already sit in their own branches, so the wife (or, failing
  // that, the person the spouse_id points at) is drawn a second time beside her husband as a dashed reference copy
  const first = n => n.split(' ')[0] || n, firsts = new Map();
  for (const p of list){ const f = first(p.name).toLowerCase(); firsts.set(f, (firsts.get(f) || 0) + 1); }
  const short = n => firsts.get(first(n).toLowerCase()) > 1 ? n.split(' ').slice(0, 2).join(' ') : first(n);
  const branchOf = p => { const h = p.unit.head !== p ? p.unit.head : p.unit.parentUnit && p.unit.parentUnit.head; return h ? short(h.name) : ''; };
  for (const p of list) for (const s of p.partners){
    if (p.idx > s.idx || p.unit === s.unit) continue;
    const host = p.gender === 'M' && s.gender === 'F' ? p : s.gender === 'M' && p.gender === 'F' ? s : p.spouseRef === s.id ? p : s.spouseRef === p.id ? s : p;
    const guest = host === p ? s : p, where = branchOf(guest);
    const copy = { id: guest.id, idx: guest.idx, name: guest.name, gender: guest.gender, birth: guest.birth, mobile: guest.mobile, photo: guest.photo,
      parent: '', spouseRef: '', partners: [], kids: [], unit: host.unit, ref: guest, isRef: true, note: where ? 'See ' + where + "'s branch" : 'Also shown elsewhere' };
    host.unit.members.push(copy);
    issues.push({ t: 'Married within the family: ' + guest.name + (where ? ' (' + where + "'s branch)" : '') + ' and ' + host.name + (branchOf(host) ? ' (' + branchOf(host) + "'s branch)" : '') + '. ' + first(guest.name) + ' is also shown, with a dashed ring, beside ' + first(host.name) + '.', id: guest.id });
  }
  // break loops (a person who is their own ancestor)
  for (const u of units){ let a = u.parentUnit, n = 0; while (a && a !== u && n++ < 500) a = a.parentUnit; if (a === u || n >= 500){ issues.push({ t: u.head.name + ' ends up as their own ancestor. The parent link was dropped.', id: u.head.id }); u.parentUnit.kids = u.parentUnit.kids.filter(k => k !== u); u.parentUnit = null; } }
  const size = u => { let n = u.members.length; for (const k of u.kids) n += size(k); return u.size = n; };
  const roots = units.filter(u => !u.parentUnit); roots.forEach(size); roots.sort((a, b) => b.size - a.size);
  const root = roots[0] || null;
  for (const r of roots.slice(1)) issues.push({ t: r.head.name + (r.size > 1 ? ' and ' + (r.size - 1) + ' relative' + (r.size > 2 ? 's' : '') : '') + ' could not be linked to the main tree. Give them a parent_id or spouse_id.', id: r.head.id });
  for (const p of list){
    const par = p.parent ? P.get(p.parent) : null, a = ageOf(p.birth, today), b = par ? ageOf(par.birth, today) : null;
    if (a != null && b != null && b - a < 12 && a >= 0) issues.push({ t: p.name + ' is recorded as born ' + (b - a < 0 ? 'before' : 'only ' + (b - a) + ' years after') + ' the parent ' + par.name + '.', id: p.id });
  }
  return { P, list, units, root, roots, issues };
}

/* ============ layout: the circular, auto-adjusting part ============ */
const G = { pr: 58, slot: 132, unitGap: 20, famPad: 34, labGap: 12, nameSize: 18.5, subSize: 14.5, nameLH: 22, subLH: 18, maxName: 226, corner: 26, arcIn: 34, r1min: 560 };
function wrapName(name){
  const w = tw(name, G.nameSize, 'b');
  const words = name.split(' ');
  if (w <= G.maxName || words.length < 2) return [name];
  let best = null;
  for (let i = 1; i < words.length; i++){
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const m = Math.max(tw(a, G.nameSize, 'b'), tw(b, G.nameSize, 'b'));
    if (!best || m < best.m) best = { m, v: [a, b] };
  }
  return best.v;
}
function labelLines(p, o){
  const out = [];
  for (const s of wrapName(p.name)){ const w = tw(s, G.nameSize, 'b'); const k = w > G.maxName * 1.12 ? Math.max(.62, G.maxName * 1.12 / w) : 1; out.push({ s, size: G.nameSize * k, bold: true, lh: G.nameLH, w: w * k }); }
  if (p.isRef){ out.push({ s: p.note, size: G.subSize, lh: G.subLH, sub: true, w: tw(p.note, G.subSize, 'r') }); return out; } // dates and numbers stay on the original
  if (o.birth && p.birth){ const s = 'Born ' + showDate(p.birth); out.push({ s, size: G.subSize, lh: G.subLH, sub: true, w: tw(s, G.subSize, 'r') }); }
  if (o.mobile && p.mobile){ const s = 'Mob. ' + p.mobile; out.push({ s, size: G.subSize, lh: G.subLH, sub: true, w: tw(s, G.subSize, 'r') }); }
  return out;
}
function layoutTree(model, o, focusId){
  const TAU = Math.PI * 2;
  let root = model.root;
  if (focusId && model.P.has(focusId)) root = model.P.get(focusId).unit;
  if (!root) return null;
  const byBirth = (a, b) => { const x = /^\d{4}/.test(a.head.birth) ? a.head.birth : '9999', y = /^\d{4}/.test(b.head.birth) ? b.head.birth : '9999'; return x < y ? -1 : x > y ? 1 : a.head.idx - b.head.idx; };
  const kidsOf = u => o.sort === 'birth' ? u.kids.slice().sort(byBirth) : u.kids.slice().sort((a, b) => a.head.idx - b.head.idx);
  // 1. generations and label lengths
  const gens = []; let count = 0;
  (function walk(u, d){ u.d = d; u.ch = kidsOf(u); (gens[d] = gens[d] || []).push(u); count += u.members.filter(p => !p.isRef).length;
    for (const p of u.members){ p.lines = labelLines(p, o); p.len = Math.max(0, ...p.lines.map(l => l.w)); }
    for (const c of u.ch) walk(c, d + 1); })(root, 0);
  const D = gens.length - 1;
  const L = gens.map(g => Math.max(0, ...g.flatMap(u => u.members.map(p => p.len))));
  // 2. ring radii from R1; each ring sits just far enough out to clear the labels of the ring inside it
  const radii = r1 => { const R = [0, r1]; for (let d = 2; d <= D; d++) R[d] = R[d - 1] + G.pr + G.labGap + L[d - 1] + 18 + G.arcIn + G.pr; return R; };
  // 3. angle each branch needs: the wider of its own couple and all of its descendants
  const need = (u, R) => { const own = (u.members.length * G.slot + G.unitGap) / R[u.d]; let k = 0; for (const c of u.ch) k += need(c, R); if (u.ch.length) k += G.famPad / R[u.d + 1]; return u.need = Math.max(own, k); };
  const total = r1 => { const R = radii(r1); let t = 0; for (const c of root.ch) t += need(c, R); return t; };
  // 4. smallest first ring that lets every branch fit in the circle
  let lo = G.r1min, hi = G.r1min;
  if (D >= 1 && total(lo) > TAU){ while (total(hi) > TAU) hi *= 2; for (let i = 0; i < 46; i++){ const mid = (lo + hi) / 2; if (total(mid) > TAU) lo = mid; else hi = mid; } }
  const R1 = hi, R = radii(R1), tot = D >= 1 ? total(R1) : 0;
  const spread = tot > 0 ? Math.min(TAU / tot, root.ch.length < 3 ? 1.6 : 99) : 1;   // slack is shared out evenly
  // 5. hand each branch its slice
  const place = (u, a0, a1) => { u.th = (a0 + a1) / 2; let s = 0; for (const c of u.ch) s += c.need; let a = u.th - s * spread / 2; for (const c of u.ch){ place(c, a, a + c.need * spread); a += c.need * spread; } };
  { const span = tot * spread; let a = span >= TAU - 1e-6 ? -Math.PI / 2 : Math.PI / 2 - span / 2; for (const c of root.ch){ place(c, a, a + c.need * spread); a += c.need * spread; } }
  // 6. drawing list
  const lines = [], people = [], texts = [];
  const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const seg = (r0, a0, r1, a1) => { const p = pol(r0, a0), q = pol(r1, a1); lines.push({ k: 'L', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }); };
  const arc = (r, a0, a1) => { if (a1 - a0 > 1e-6) lines.push({ k: 'A', r, a0, a1 }); };
  // centre: the founding couple, title above
  const rr = Math.max(G.pr, Math.min(420, R1 * .09)), n0 = root.members.length, cs = rr / G.pr;
  const arc1 = R1 - G.pr - G.arcIn;
  root.members.forEach((p, i) => {
    const x = (i - (n0 - 1) / 2) * (2 * rr + 14 * cs);
    people.push({ p, x, y: 0, th: 0, r: rr, root: true, lines: [] });
    const side = i === 0 && n0 > 1 ? -1 : 1, below = n0 > 2 && i > 0 && i < n0 - 1;
    const lab = labelLines(p, o), fs = Math.max(1, cs * .95);
    const maxW = Math.max(60, (D >= 1 ? arc1 : R1) - (Math.abs(x) + rr + 14 * cs) - 20 * cs);
    const widest = Math.max(1, ...lab.map(l => l.w * fs)), k = Math.min(1, maxW / widest);
    const H = lab.reduce((s, l) => s + l.lh * fs * k, 0); let y = below ? rr + 16 * cs : -H / 2;
    for (const l of lab){ const lh = l.lh * fs * k; texts.push({ s: l.s, x: below ? x : x + side * (rr + 14 * cs), y: y + lh / 2, rot: 0, size: l.size * fs * k, bold: l.bold, sub: l.sub, al: below ? 'c' : side < 0 ? 'r' : 'l' }); y += lh; }
    if (i > 0) lines.push({ k: 'L', x1: x - (2 * rr + 14 * cs), y1: 0, x2: x, y2: 0 });
  });
  const title = (o.title || '').trim();
  const gensN = D + 1, sub = count + (count === 1 ? ' person' : ' people') + ' \u00B7 ' + gensN + (gensN === 1 ? ' generation' : ' generations');
  const tSize = Math.max(26, R1 * .11), ty = -(rr + R1 * .2);
  if (title) texts.push({ s: title, x: 0, y: ty, rot: 0, size: tSize, display: true, al: 'c', maxW: (D >= 1 ? arc1 : R1) * 1.5 });
  texts.push({ s: sub, x: 0, y: title ? ty + tSize * .82 : ty + tSize * .3, rot: 0, size: Math.max(15, tSize * .27), sub: true, al: 'c' });
  // rings
  (function draw(u){
    const d = u.d;
    if (d > 0){
      u.members.forEach((p, i) => { const a = u.th + (i - (u.members.length - 1) / 2) * G.slot / R[d]; const [x, y] = pol(R[d], a); p.a = a; people.push({ p, x, y, th: a, r: G.pr, flip: Math.cos(a) < 0, lines: p.lines, len: p.len }); });
      if (u.members.length > 1) arc(R[d], u.members[0].a, u.members[u.members.length - 1].a);
    }
    if (u.ch.length){
      const arcR = R[d + 1] - G.pr - G.arcIn, kids = u.ch.map(c => c.th - ((c.members.length - 1) / 2) * G.slot / R[d + 1]);
      let ta;
      if (d === 0){ const a0 = kids[0], a1 = kids[kids.length - 1], want = Math.PI / 2; ta = want >= a0 && want <= a1 ? want : (Math.abs(a0 - want) < Math.abs(a1 - want) ? a0 : a1); if (kids.length === 1) ta = a0; seg(0, 0, arcR, ta); }
      else if (u.members.length > 1){ ta = (u.members[0].a + u.members[1].a) / 2; seg(R[d], ta, arcR, ta); }
      else { ta = u.th + (G.slot / 2) / R[d]; arc(R[d], u.th, ta); seg(R[d], ta, arcR, ta); }
      const a0 = Math.min(kids[0], ta), a1 = Math.max(kids[kids.length - 1], ta), cr = G.corner, da = cr / arcR;
      const roundL = a0 < ta - 2 * da && Math.abs(kids[0] - a0) < 1e-9, roundR = a1 > ta + 2 * da && Math.abs(kids[kids.length - 1] - a1) < 1e-9;
      arc(arcR, a0 + (roundL ? da : 0), a1 - (roundR ? da : 0));
      kids.forEach((a, i) => {
        const rounded = (i === 0 && roundL) || (i === kids.length - 1 && roundR);
        if (rounded){ const s = i === 0 && roundL ? 1 : -1, p0 = pol(arcR, a + s * da), c = pol(arcR, a), p1 = pol(arcR + cr, a); lines.push({ k: 'Q', x0: p0[0], y0: p0[1], cx: c[0], cy: c[1], x1: p1[0], y1: p1[1] }); seg(arcR + cr, a, R[d + 1], a); }
        else seg(arcR, a, R[d + 1], a);
      });
    }
    for (const c of u.ch) draw(c);
  })(root);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const grow = (x, y, m) => { x0 = Math.min(x0, x - m); x1 = Math.max(x1, x + m); y0 = Math.min(y0, y - m); y1 = Math.max(y1, y + m); };
  for (const q of people){ grow(q.x, q.y, q.r + 8); if (!q.root){ const e = q.r + G.labGap + q.len; grow(q.x + Math.cos(q.th) * e, q.y + Math.sin(q.th) * e, G.slot / 2); } }
  for (const t of texts){ const w = t.maxW ? Math.min(t.maxW, tw(t.s, t.size, 't')) : tw(t.s, t.size, t.bold ? 'b' : 'r'), l = t.al === 'c' ? t.x - w / 2 : t.al === 'r' ? t.x - w : t.x; grow(l, t.y, t.size * .6); grow(l + w, t.y, t.size * .6); }
  for (const l of lines) if (l.k === 'A' && l.a1 - l.a0 > Math.PI) grow(0, 0, l.r + 4);
  const padB = 70; x0 -= padB; y0 -= padB; x1 += padB; y1 += padB;
  const box = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  return { lines, people, texts, R, box, count, gens: gensN, root, R1 };
}

/* ============ spreadsheet files: read .xlsx / .csv, write .xlsx (no library needed) ============ */
function parseCSV(text){
  const rows = []; let row = [], cur = '', q = false; text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || ''; const sep = (first.split(';').length > first.split(',').length) ? ';' : (first.split('\t').length > first.split(',').length ? '\t' : ',');
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep){ row.push(cur); cur = ''; }
    else if (c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
async function inflateRaw(u8){ const ds = new DecompressionStream('deflate-raw'); return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer()); }
async function unzip(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This file is not a valid .xlsx workbook.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {}, dec = new TextDecoder();
  for (let i = 0; i < n; i++){
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(ds, ds + csize);
    files[name] = { method, data }; p += 46 + nl + el + cl;
  }
  return { names: Object.keys(files), text: async name => { const f = files[name]; if (!f) return null; return dec.decode(f.method === 0 ? f.data : await inflateRaw(f.data)); } };
}
async function readXLSX(buf){
  const z = await unzip(buf), xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const sst = await z.text('xl/sharedStrings.xml'); let strings = [];
  if (sst) strings = [...xml(sst).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join(''));
  const sheets = z.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  if (!sheets.length) throw new Error('No worksheet found in this workbook.');
  const doc = xml(await z.text(sheets[0])), out = [];
  for (const r of doc.getElementsByTagName('row')){
    const row = [];
    for (const c of r.getElementsByTagName('c')){
      const ref = c.getAttribute('r') || ''; let col = 0; for (const ch of ref.replace(/\d/g, '')) col = col * 26 + ch.charCodeAt(0) - 64; col = col ? col - 1 : row.length;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = strings[+v.textContent] || '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (v) val = v.textContent;
      row[col] = val;
    }
    out.push(Array.from(row, x => x == null ? '' : x));
  }
  return out;
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files){
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, text] of files){
    const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + data.length;
  }
  const csz = central.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function writeXLSX(header, rows){
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const colName = i => { let s = ''; i++; while (i){ s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cell = (v, r, c, st) => '<c r="' + colName(c) + (r + 1) + '" t="inlineStr"' + (st ? ' s="1"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  const body = [header, ...rows].map((r, i) => '<row r="' + (i + 1) + '">' + r.map((v, c) => (v === '' || v == null) ? '' : cell(v, i, c, i === 0)).join('') + '</row>').join('');
  const widths = [8, 38, 9, 11, 11, 14, 16, 16];
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipStore([
    ['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Family" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + header.map((h, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (widths[i] || 14) + '" customWidth="1"/>').join('') + '</cols><sheetData>' + body + '</sheetData></worksheet>']
  ]);
}

/* ============ PDF writer (vector, standard fonts) ============ */
function b64bytes(b64){ const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function jpegInfo(u){ let i = 2; while (i < u.length){ if (u[i] !== 0xFF){ i++; continue; } const m = u[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8], n: u[i + 9] }; i += 2 + ((u[i + 2] << 8) | u[i + 3]); } return null; }
function pdfStr(s){ let o = '('; for (const ch of s){ const b = cpByte(ch); if (b < 0){ o += '?'; continue; } if (b === 40 || b === 41 || b === 92) o += '\\' + String.fromCharCode(b); else if (b < 32 || b > 126) o += '\\' + b.toString(8).padStart(3, '0'); else o += String.fromCharCode(b); } return o + ')'; }
async function makePDF({ wPt, hPt, content, images, title, links }){
  const enc = new TextEncoder(), objs = [];
  const add = (dict, stream) => { objs.push({ dict, stream }); return objs.length; };
  let body = enc.encode(content), filter = '';
  try { if (typeof CompressionStream !== 'undefined'){ body = new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); filter = '/Filter /FlateDecode '; } } catch (e){ body = enc.encode(content); filter = ''; }
  const cat = add('<< /Type /Catalog /Pages 2 0 R >>'), pages = add(''), page = add('');
  const cont = add('<< ' + filter + '/Length ' + body.length + ' >>', body);
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Times-Bold'].map(n => add('<< /Type /Font /Subtype /Type1 /BaseFont /' + n + ' /Encoding /WinAnsiEncoding >>'));
  const xo = images.map(im => add('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace ' + (im.n === 1 ? '/DeviceGray' : im.n === 4 ? '/DeviceCMYK' : '/DeviceRGB') + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>', im.bytes));
  const info = add('<< /Title ' + pdfStr(title || 'Family tree') + ' /Producer (Family tree chart) >>');
  const annots = (links || []).map(l => add('<< /Type /Annot /Subtype /Link /Rect [' + l.rect.map(v => v.toFixed(2)).join(' ') + '] /Border [0 0 0] /A << /S /URI /URI ' + pdfStr(l.url) + ' >> >>'));
  objs[pages - 1].dict = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[page - 1].dict = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt.toFixed(2) + ' ' + hPt.toFixed(2) + '] /Contents ' + cont + ' 0 R /Resources << /Font << ' + fonts.map((f, i) => '/F' + (i + 1) + ' ' + f + ' 0 R').join(' ') + ' >> /XObject << ' + xo.map((x, i) => '/I' + i + ' ' + x + ' 0 R').join(' ') + ' >> >>' + (annots.length ? ' /Annots [' + annots.map(a => a + ' 0 R').join(' ') + ']' : '') + ' >>';
  const parts = [], offs = []; let pos = 0;
  const put = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); pos += u.length; };
  put('%PDF-1.4\n%~~~~\n');
  objs.forEach((o, i) => { offs.push(pos); put((i + 1) + ' 0 obj\n' + o.dict + '\n'); if (o.stream){ put('stream\n'); put(o.stream); put('\nendstream\n'); } put('endobj\n'); });
  const xref = pos; put('xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  put('trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}
const PRINT = { paper: '#FAFAF7', ink: '#191D3A', sub: '#4E5478', line: '#8A91AE', male: '#2C7DB6', female: '#CF4C7C', blank: '#E3E6F0', none: '#9097B4' };
function chartToPDFContent(lay, photoIndex, sc, wPt, hPt){
  const B = lay.box;
  const f = n => (Math.round(n * 100) / 100).toString(), rgb = h => [1, 3, 5].map(i => (parseInt(h.substr(i, 2), 16) / 255).toFixed(3)).join(' ');
  const o = [];
  o.push(rgb(PRINT.paper) + ' rg 0 0 ' + f(wPt) + ' ' + f(hPt) + ' re f');
  o.push('q ' + f(sc) + ' 0 0 ' + f(-sc) + ' ' + f(-B.x0 * sc) + ' ' + f(hPt + B.y0 * sc) + ' cm 1 J 1 j');
  const circle = (x, y, r) => { const k = r * .5523; return f(x + r) + ' ' + f(y) + ' m ' + f(x + r) + ' ' + f(y + k) + ' ' + f(x + k) + ' ' + f(y + r) + ' ' + f(x) + ' ' + f(y + r) + ' c ' + f(x - k) + ' ' + f(y + r) + ' ' + f(x - r) + ' ' + f(y + k) + ' ' + f(x - r) + ' ' + f(y) + ' c ' + f(x - r) + ' ' + f(y - k) + ' ' + f(x - k) + ' ' + f(y - r) + ' ' + f(x) + ' ' + f(y - r) + ' c ' + f(x + k) + ' ' + f(y - r) + ' ' + f(x + r) + ' ' + f(y - k) + ' ' + f(x + r) + ' ' + f(y) + ' c'; };
  o.push(rgb(PRINT.line) + ' RG 1.3 w');
  for (const l of lay.lines){
    if (l.k === 'L') o.push(f(l.x1) + ' ' + f(l.y1) + ' m ' + f(l.x2) + ' ' + f(l.y2) + ' l S');
    else if (l.k === 'Q'){ const c1x = l.x0 + 2 / 3 * (l.cx - l.x0), c1y = l.y0 + 2 / 3 * (l.cy - l.y0), c2x = l.x1 + 2 / 3 * (l.cx - l.x1), c2y = l.y1 + 2 / 3 * (l.cy - l.y1); o.push(f(l.x0) + ' ' + f(l.y0) + ' m ' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(l.x1) + ' ' + f(l.y1) + ' c S'); }
    else { const n = Math.max(1, Math.ceil((l.a1 - l.a0) / (Math.PI / 6))), d = (l.a1 - l.a0) / n, k = 4 / 3 * Math.tan(d / 4) * l.r; let s = f(l.r * Math.cos(l.a0)) + ' ' + f(l.r * Math.sin(l.a0)) + ' m';
      for (let i = 0; i < n; i++){ const a = l.a0 + i * d, b = a + d, ax = l.r * Math.cos(a), ay = l.r * Math.sin(a), bx = l.r * Math.cos(b), by = l.r * Math.sin(b); s += ' ' + f(ax - k * Math.sin(a)) + ' ' + f(ay + k * Math.cos(a)) + ' ' + f(bx + k * Math.sin(b)) + ' ' + f(by - k * Math.cos(b)) + ' ' + f(bx) + ' ' + f(by) + ' c'; }
      o.push(s + ' S'); }
  }
  const text = (s, x, y, rot, size, font, col, al) => {
    const fk = font === 2 ? 'b' : font === 3 ? 't' : 'r', w = tw(s, size, fk), c = Math.cos(rot), sn = Math.sin(rot);
    const lx = al === 'r' ? -w : al === 'c' ? -w / 2 : 0, ly = size * .35;
    o.push('BT /F' + font + ' ' + f(size) + ' Tf ' + rgb(col) + ' rg ' + f(c) + ' ' + f(sn) + ' ' + f(sn) + ' ' + f(-c) + ' ' + f(x + lx * c - ly * sn) + ' ' + f(y + lx * sn + ly * c) + ' Tm ' + pdfStr(s) + ' Tj ET');
  };
  for (const q of lay.people){
    const ring = q.p.gender === 'M' ? PRINT.male : q.p.gender === 'F' ? PRINT.female : PRINT.none, r = q.r, idx = photoIndex.get(q.p.id);
    if (idx != null) o.push('q ' + circle(q.x, q.y, r - 1) + ' W n ' + f(2 * r) + ' 0 0 ' + f(-2 * r) + ' ' + f(q.x - r) + ' ' + f(q.y + r) + ' cm /I' + idx + ' Do Q');
    else { o.push(rgb(PRINT.blank) + ' rg ' + circle(q.x, q.y, r - 1) + ' f'); const ini = initials(q.p.name); if (ini) text(ini, q.x, q.y, 0, r * .62, 2, ring, 'c'); }
    o.push(rgb(ring) + ' RG ' + f(r * .058) + ' w ' + (q.p.isRef ? '[' + f(r * .2) + ' ' + f(r * .13) + '] 0 d ' : '') + circle(q.x, q.y, r - 1) + ' S' + (q.p.isRef ? ' [] 0 d' : ''));
    if (q.root) continue;
    const H = q.lines.reduce((s, l) => s + l.lh, 0), rot = q.flip ? q.th + Math.PI : q.th, dir = q.flip ? -1 : 1, c = Math.cos(rot), sn = Math.sin(rot);
    let yy = -H / 2;
    for (const l of q.lines){ const ly = yy + l.lh / 2, lx = dir * (r + G.labGap); text(l.s, q.x + lx * c - ly * sn, q.y + lx * sn + ly * c, rot, l.size, l.bold ? 2 : 1, l.sub ? PRINT.sub : PRINT.ink, q.flip ? 'r' : 'l'); yy += l.lh; }
  }
  for (const t of lay.texts){
    let size = t.size; const font = t.display ? 3 : t.bold ? 2 : 1;
    if (t.maxW){ const w = tw(t.s, size, 't'); if (w > t.maxW) size *= t.maxW / w; }
    text(t.s, t.x, t.y, t.rot, size, font, t.sub ? PRINT.sub : PRINT.ink, t.al);
  }
  o.push('Q');
  return o.join('\n');
}
// A QR code in the page's bottom-right corner, drawn as vector squares so it prints sharp at any size.
// extra = { qr: { n: modules per side, dark(row, col) }, caption, url }; returns PDF content to append ('' when none).
function qrBox(wPt, hPt){ const size = Math.max(72, Math.min(216, Math.min(wPt, hPt) * .08)), pad = Math.max(18, size * .2); return { x0: wPt - pad - size, y0: pad, size, pad }; }
// the corner QR as a clickable link to extra.url, for makePDF's links ([] when there is none)
function pdfQRLinks(extra, wPt, hPt){ if (!extra || !extra.qr || !extra.url) return []; const b = qrBox(wPt, hPt); return [{ rect: [b.x0, b.y0, b.x0 + b.size, b.y0 + b.size], url: extra.url }]; }
function pdfQR(extra, wPt, hPt){
  if (!extra || !extra.qr) return '';
  const f = n => (Math.round(n * 100) / 100).toString(), q = extra.qr, quiet = 2;
  const { x0, y0, size, pad } = qrBox(wPt, hPt), m = size / (q.n + 2 * quiet), o = ['q 1 1 1 rg ' + f(x0) + ' ' + f(y0) + ' ' + f(size) + ' ' + f(size) + ' re f 0.098 0.114 0.227 rg'];
  for (let r = 0; r < q.n; r++) for (let c = 0; c < q.n; c++) if (q.dark(r, c)) o.push(f(x0 + (quiet + c) * m) + ' ' + f(y0 + size - (quiet + r + 1) * m) + ' ' + f(m + .02) + ' ' + f(m + .02) + ' re');
  o.push('f');
  if (extra.caption){
    const fs = Math.max(7, Math.min(16, size * .075)), w = tw(extra.caption, fs, 'r'), x = Math.min(x0 + size / 2 - w / 2, wPt - pad - w);
    o.push('BT /F1 ' + f(fs) + ' Tf 0.306 0.329 0.471 rg 1 0 0 1 ' + f(x) + ' ' + f(y0 + size + fs * .6) + ' Tm ' + pdfStr(extra.caption) + ' Tj ET');
  }
  o.push('Q');
  return o.join('\n');
}
function initials(name){ const w = name.split(' ').filter(Boolean); return ((w[0] || '')[0] || '') + (w.length > 1 ? w[w.length - 1][0] : ''); }
