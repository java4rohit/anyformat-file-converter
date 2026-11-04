import { IMAGE_INPUTS, IMG_FORMATS, TEXT_EXT, TEXT_FORMATS } from './formats.js';
/** id → [name, description]; shared by the Features panel and the hover cards on the ring. */
export const TOOL_INFO = {
    convert: ['Convert', 'Pick the output format for the file'],
    trim: ['Trim', 'Drag the crop frame or use 1:1, 16:9, 4:3, 4:5 presets'],
    resize: ['Resize', 'Set exact width/height or scale from 5% to 200%'],
    size: ['File size', 'Enter a limit in KB or MB — AnyFormat compresses until it fits'],
    quality: ['Quality', 'Compression level for JPG, WEBP and PDF'],
    pdf: ['To PDF', 'One tap to turn an image into a PDF'],
    save: ['Save', 'Convert and download'],
};
const TOOLS = Object.values(TOOL_INFO);
const EXTRAS = [
    'Drop anywhere on the page, click the circle to browse, or paste an image',
    'Several files at once, with a queue and "Convert all"',
    'Multi-page PDFs: every page (up to 50) becomes its own image',
    'PDF text is extracted so the whole document can become DOCX, ODT, RTF…',
    'Back button (or Esc) returns to the start screen to choose a different file',
    'Everything runs in your browser — files are never uploaded',
];
const chips = (a) => a.map(x => `<i>${x}</i>`).join('');
export function initFeatures() {
    const up = (a) => a.map(x => x.toUpperCase());
    const imgOut = IMG_FORMATS.map(f => f.label);
    const rows = [
        [`Images <small>${IMAGE_INPUTS.join(' · ')}</small>`, imgOut],
        ['PDF <small>each page as an image</small>', imgOut],
        ...Object.entries(TEXT_FORMATS).map(([src, outs]) => [src === 'pdf' ? 'PDF <small>text</small>' : src.toUpperCase(), up(outs.filter(o => o !== src))]),
    ];
    const routes = rows.reduce((n, r) => n + r[1].length, 0);
    const outputs = new Set([...imgOut, ...rows.flatMap(r => r[1])]).size;
    const inputs = IMAGE_INPUTS.length + TEXT_EXT.length;
    const stat = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
    $('#modalBody').innerHTML = `
    <h2>What AnyFormat can do</h2>
    <div class="stats">${stat(inputs, 'file types in')}${stat(outputs, 'formats out')}${stat(routes, 'conversion routes')}${stat(TOOLS.length, 'tools')}</div>
    <h3>Conversions</h3>
    <div class="matrix">${rows.map(([from, to]) => `<div class="row"><div class="from">${from}</div><div class="arrow">→</div><div class="to">${chips(to)}</div></div>`).join('')}</div>
    <h3>Tools in the ring</h3>
    <ul class="tools">${TOOLS.map(([n, d]) => `<li><b>${n}</b><span>${d}</span></li>`).join('')}</ul>
    <h3>Also</h3>
    <ul class="extras">${EXTRAS.map(x => `<li>${x}</li>`).join('')}</ul>`;
    $('#orbCount').innerHTML = `<b>${TOOLS.length} tools</b><span>${inputs} file types in · ${outputs} formats out</span><em>drop a file</em>`;
    const modal = $('#modal');
    const close = () => modal.classList.remove('on');
    $('#featuresBtn').onclick = () => modal.classList.add('on');
    $('#modalX').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal)
        close(); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape')
        close(); });
}
function $(sel) {
    const el = document.querySelector(sel);
    if (!el)
        throw new Error(`Missing element: ${sel}`);
    return el;
}
//# sourceMappingURL=features.js.map