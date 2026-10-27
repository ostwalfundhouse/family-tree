// Turns any picked image into the three JPEGs we store:
//  main  – whole photo, long edge up to 1800 px (used only for the large centre-couple circles in PDFs)
//  print – 768 px square, same crop; used for PDF circles (sharp at 300 dpi for everyone except the centre couple)
//  thumb – 256 px square, cropped the way the chart crops (centred, a little above the middle)
export const MAIN_PX = 1800, PRINT_PX = 768, THUMB_PX = 256;
const MAIN_Q = .82;   // ~40-50% smaller than 2400 px at 0.88; centre circles still print at ~150-200 dpi on the largest charts

function toBlob(c, q){ return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('could not encode the photo')), 'image/jpeg', q)); }

export async function makeJpegs(file){
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e){ throw new Error(/hei[cf]/i.test(file.type + file.name) ? 'This browser cannot open HEIC photos. Choose a JPEG, or share the photo as "Most compatible".' : 'This file is not a photo we can open.'); }
  const s = Math.min(1, MAIN_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const t = cropSquare(bmp, THUMB_PX), pr = cropSquare(bmp, PRINT_PX);
  bmp.close && bmp.close();
  return { main: await toBlob(c, MAIN_Q), print: await toBlob(pr, .9), thumb: await toBlob(t, .85), preview: t.toDataURL('image/jpeg', .8), w: c.width, h: c.height };
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
