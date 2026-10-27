// Turns any picked image into the three JPEGs we store:
//  main  – whole photo, long edge up to 1800 px, at most 200 KB (used only for the large centre-couple circles in PDFs)
//  print – 768 px square, same crop; used for PDF circles (sharp at 300 dpi for everyone except the centre couple)
//  thumb – 256 px square, cropped the way the chart crops (centred, a little above the middle)
export const MAIN_PX = 1800, PRINT_PX = 768, THUMB_PX = 256;
export const MAIN_MAX_BYTES = 200 * 1024;
const MAIN_Q = .82, MIN_Q = .6, Q_STEP = .06, SHRINK = .85;

function toBlob(c, q){ return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('could not encode the photo')), 'image/jpeg', q)); }
function drawn(img, w, h){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  return c;
}

// The main copy under MAIN_MAX_BYTES: lower the quality a step at a time (not below MIN_Q), then shrink the
// picture by 15% at a time, never below the print copy's 768 px; the smallest attempt is kept if nothing fits.
async function mainUnderCap(img){
  let w = img.width, h = img.height, s = Math.min(1, MAIN_PX / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  let c = drawn(img, w, h), q = MAIN_Q, blob = await toBlob(c, q);
  while (blob.size > MAIN_MAX_BYTES && q > MIN_Q + 1e-9){ q = Math.max(MIN_Q, q - Q_STEP); blob = await toBlob(c, q); }
  while (blob.size > MAIN_MAX_BYTES && Math.max(w, h) * SHRINK >= PRINT_PX){
    w = Math.round(w * SHRINK); h = Math.round(h * SHRINK); c = drawn(img, w, h); q = MIN_Q; blob = await toBlob(c, q);
  }
  return { blob, w, h, q };
}

export async function makeJpegs(file){
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e){ throw new Error(/hei[cf]/i.test(file.type + file.name) ? 'This browser cannot open HEIC photos. Choose a JPEG, or share the photo as "Most compatible".' : 'This file is not a photo we can open.'); }
  const main = await mainUnderCap(bmp), t = cropSquare(bmp, THUMB_PX), pr = cropSquare(bmp, PRINT_PX);
  bmp.close && bmp.close();
  return { main: main.blob, print: await toBlob(pr, .9), thumb: await toBlob(t, .85), preview: t.toDataURL('image/jpeg', .8), w: main.w, h: main.h, q: main.q };
}

// Square crop like the chart's: centred across, a quarter of the spare height above. Never upscales.
export function cropSquare(img, px){
  const m = Math.min(img.width, img.height), n = Math.min(px, m), c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); g.imageSmoothingQuality = 'high';
  g.drawImage(img, (img.width - m) / 2, (img.height - m) * .25, m, m, 0, 0, n, n);
  return c;
}

export const thumbPath = path => path.replace(/\.jpg$/, '_t.jpg');
export const printPath = path => path.replace(/\.jpg$/, '_p.jpg');
export const allPaths = path => [path, thumbPath(path), printPath(path)];
