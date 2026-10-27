// Public sample: the chart engine on the made-up Sharma family from data/sample-family-dummy.xlsx.
function loadScript(src){ return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('could not load ' + src)); document.body.appendChild(s); }); }

document.head.insertAdjacentHTML('beforeend', '<style>#bData{display:none}</style>'); // nothing to edit on the sample
await loadScript('engine/widths.js'); await loadScript('engine/core.js');
const rows = tableToRows(await readXLSX(await (await fetch('data/sample-family-dummy.xlsx')).arrayBuffer()));
Object.assign(window, { FT_EMBED: true, FT_TITLE: 'Sharma Family', ROWS0: rows, PHOTOS0: {} });
await loadScript('engine/app.js');
