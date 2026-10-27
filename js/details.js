// Birth dates and mobile numbers as people type them, shared by the admin editor and the photo link.
// Stored as 1970-05-27 or 1970 (what engine/core.js parseDate reads); people type 27/05/1970.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const showBirth = b => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(b || ''); return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (b || ''); };
export const typedBirth = b => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(b || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (b || ''); };

// '' for empty, the stored form when valid, null when it can't be right
export function readBirth(s){
  s = String(s || '').trim(); if (!s) return '';
  const now = new Date();
  if (/^\d{4}$/.test(s)) return +s >= 1800 && +s <= now.getFullYear() ? s : null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s), m = iso ? [0, iso[3], iso[2], iso[1]] : /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1800 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t > now) return null;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
export const readMobile = s => { s = String(s || '').trim(); if (!s) return ''; const n = s.replace(/\D/g, '').length; return /^[0-9 +()\-]+$/.test(s) && n >= 7 && n <= 15 ? s : null; };

export const BIRTH_HELP = 'Write the birth date like 27/05/1970, or just the year. It cannot be in the future.';
export const MOBILE_HELP = 'That mobile number does not look right.';
