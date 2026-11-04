import type { Crop, FileEntry, Format, ImageEntry, Settings } from './types.js';
import { IMG_FORMATS, TEXT_FORMATS, TEXT_EXT } from './formats.js';
import { encodeBMP, encodePDF } from './encoders.js';
import { imageToDocx, readDocument } from './docs.js';
import { initFeatures, TOOL_INFO } from './features.js';
import { convertText } from './text.js';
import { base, ext, kb } from './util.js';
import { extractPdfText, renderPdf } from './pdf.js';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const files: FileEntry[] = [];
let cur: FileEntry | null = null;
const S: Settings = { fmt: 'png', scale: 1, quality: 0.9, ratio: null, targetBytes: null };
const LOSSY = ['jpg', 'webp', 'pdf'];

const isImage = (f: FileEntry | null): f is ImageEntry => f?.kind === 'image';

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout((t as any)._t);
  (t as any)._t = setTimeout(() => t.classList.remove('show'), 2400);
}

type Theme = 'light' | 'dark';
const themeButton = $<HTMLButtonElement>('#themeBtn');

function setTheme(theme: Theme, save = false): void {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  themeButton.textContent = theme === 'dark' ? '☼ Light' : '☾ Dark';
  themeButton.setAttribute('aria-label', `Switch to ${next} mode`);
  themeButton.title = `Switch to ${next} mode`;
  themeButton.setAttribute('aria-pressed', String(theme === 'light'));
  if (save) localStorage.setItem('anyformat-theme', theme);
}

const savedTheme = localStorage.getItem('anyformat-theme');
setTheme(savedTheme === 'dark' ? 'dark' : 'light');
themeButton.onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);

/* ---------- intake ---------- */
function loadImage(file: File, srcExt: string): Promise<ImageEntry> {
  const url = URL.createObjectURL(file);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({
      kind: 'image', file, ext: srcExt, crop: { l: 0, t: 0, r: 1, b: 1 }, url, img, w: img.naturalWidth, h: img.naturalHeight,
    });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`Can't read ${file.name}`)); };
    img.src = url;
  });
}

function register(entry: FileEntry): void {
  files.push(entry);
  select(entry);
}

async function addPdf(file: File): Promise<number> {
  toast(`Reading ${file.name}…`);
  const { pages, total } = await renderPdf(file);
  const entries = await Promise.all(pages.map(page => loadImage(page, 'pdf')));
  let text = '';
  try { text = await extractPdfText(file); } catch { /* image-only or unreadable text layer */ }
  // the whole-document tile (text → DOCX/ODT/RTF/…) comes first, then one tile per page
  if (text.trim()) files.push({ kind: 'text', file, ext: 'pdf', crop: { l: 0, t: 0, r: 1, b: 1 }, text });
  files.push(...entries);
  select(entries[0]); // open on the first page
  const more = total > pages.length ? `first ${pages.length} of ${total} pages` : `${pages.length} page${pages.length > 1 ? 's' : ''}`;
  toast(text.trim() ? `Loaded ${more} — tap the PDF tile to convert the whole text to DOCX, ODT…` : `Loaded ${more} (no text found, images only)`);
  return pages.length;
}

async function addFiles(list: File[]): Promise<void> {
  let added = 0;
  for (const file of list) {
    const e = ext(file);
    try {
      if (file.type === 'application/pdf' || e === 'pdf') {
        added += await addPdf(file);
      } else if (file.type.startsWith('image/')) {
        register(await loadImage(file, e));
        added++;
      } else if ((TEXT_EXT as string[]).includes(e)) {
        register({ kind: 'text', file, ext: e, crop: { l: 0, t: 0, r: 1, b: 1 }, text: await readDocument(file, e) });
        added++;
      } else {
        toast(e === 'doc' ? `${file.name}: old .doc isn't supported — save it as .docx first` : `${file.name}: unsupported type`);
      }
    } catch (err) {
      toast(file.type === 'application/pdf' || e === 'pdf'
        ? `Couldn't open ${file.name} (is it encrypted or is the network offline?)`
        : message(err));
    }
  }
  if (added) {
    const o = $('#orb');
    o.classList.add('pop');
    setTimeout(() => o.classList.remove('pop'), 600);
  }
}

function select(entry: FileEntry): void {
  cur = entry;
  document.body.classList.remove('empty');
  $('#previewWrap').classList.toggle('text', entry.kind === 'text');
  const img = isImage(entry);
  S.scale = 1;
  S.ratio = null;
  document.querySelectorAll<HTMLButtonElement>('#ratios button').forEach(b => b.classList.toggle('on', b.dataset.r === 'free'));
  $<HTMLInputElement>('#scale').value = '100';

  if (isImage(entry)) {
    $<HTMLImageElement>('#previewImg').src = entry.url;
    $<HTMLImageElement>('#orbImg').src = entry.url;
  } else if (entry.kind === 'text') {
    $('#textPreview').textContent = entry.text.slice(0, 4000);
    $<HTMLImageElement>('#orbImg').removeAttribute('src');
  }
  $('#orb').classList.toggle('has', img);
  $('#orb').classList.toggle('doc', !img);
  $('#orbExt').textContent = img ? '' : entry.ext.toUpperCase();
  $('#metaName').textContent = entry.file.name;
  $('#metaInfo').textContent = (isImage(entry) ? `${entry.w} × ${entry.h} · ` : '') + kb(entry.file.size);

  const fmts: Format[] = isImage(entry)
    ? IMG_FORMATS
    : (TEXT_FORMATS[entry.ext] ?? ['txt']).map(id => ({ id, label: id.toUpperCase() }));
  const srcExt = entry.ext === 'jpeg' ? 'jpg' : entry.ext;
  if (!fmts.some(f => f.id === S.fmt) || (isImage(entry) && srcExt === S.fmt)) {
    S.fmt = (fmts.find(f => f.id !== srcExt) ?? fmts[0]).id;
  }
  renderChips(fmts);
  renderQueue();
  renderSpokes(img);
  if (isImage(entry)) layout(); // sized from known natural dimensions, no need to wait for load
  updateUI();
}

function renderChips(fmts: Format[]): void {
  $('#chips').innerHTML = fmts.map(f => `<button data-f="${f.id}" class="${f.id === S.fmt ? 'on' : ''}">${f.label}</button>`).join('');
}

function renderQueue(): void {
  const q = $('#queue');
  q.innerHTML = '';
  files.forEach(f => {
    const d = document.createElement('div');
    d.className = 'thumb' + (f === cur ? ' on' : '');
    d.innerHTML = (isImage(f) ? `<img src="${f.url}">` : f.ext.toUpperCase()) + '<span class="x">✕</span>';
    d.onclick = e => {
      if ((e.target as HTMLElement).classList.contains('x')) {
        files.splice(files.indexOf(f), 1);
        if (!files.length) return backToStart();
        return select(files[files.length - 1]);
      }
      select(f);
    };
    q.appendChild(d);
  });
  q.style.display = files.length > 1 ? '' : 'none';
}

$('#chips').onclick = e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  S.fmt = b.dataset.f ?? S.fmt;
  document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b));
  updateUI();
};

/* ---------- orbit tools ---------- */
type Tab = 'convert' | 'trim' | 'resize' | 'size' | 'quality';
interface Tool { id: string; label: string; icon: string; imageOnly: boolean; tab?: Tab; ring?: string }

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const TOOLS: Tool[] = [
  { id: 'convert', tab: 'convert', label: 'Convert', imageOnly: false, icon: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>') },
  { id: 'trim', tab: 'trim', label: 'Trim', imageOnly: true, icon: svg('<path d="M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14"/>') },
  { id: 'resize', tab: 'resize', label: 'Resize', imageOnly: true, icon: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>') },
  { id: 'size', tab: 'size', label: 'File size', ring: 'Size', imageOnly: true, icon: svg('<path d="M6 20h12l-2-12H8z"/><path d="M9 8a3 3 0 016 0"/>') },
  { id: 'quality', tab: 'quality', label: 'Quality', imageOnly: true, icon: svg('<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>') },
  { id: 'pdf', label: 'To PDF', imageOnly: true, icon: svg('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>') },
  { id: 'save', label: 'Save', imageOnly: false, icon: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>') },
];

let tab: Tab = 'convert';

function setTab(t: Tab): void {
  tab = t;
  document.querySelectorAll<HTMLElement>('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t));
  document.querySelectorAll<HTMLElement>('.spoke').forEach(el => el.classList.toggle('on', el.dataset.tab === t));
}

function renderSpokes(img: boolean, preview = false): void {
  const tools = TOOLS.filter(t => img || !t.imageOnly);
  const nav = $('#spokes');
  nav.innerHTML = tools.map((t, i) => {
    const a = -90 + (360 / tools.length) * i;
    const hue = tools.length > 1 ? Math.round(190 + (i * 140) / (tools.length - 1)) : 250; // cyan → violet → pink across the petals
    return `<button class="spoke" data-id="${t.id}" ${t.tab ? `data-tab="${t.tab}"` : ''} style="--a:${a}deg;--h:${hue};--d:${i * 0.06}s" aria-label="${t.label}"><i class="pc">${t.icon}<span>${t.ring ?? t.label}</span></i></button>`;
  }).join('');
  nav.classList.toggle('preview', preview);
  if (!tools.some(t => t.tab === tab)) tab = 'convert';
  if (!preview) setTab(tab);
  // open on the next frame so the buttons fly out from the circle
  nav.classList.remove('open');
  requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add('open')));
}

$('#spokes').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.spoke');
  if (!b) return;
  if (!cur) return void $('#fileInput').click(); // preview ring on the start screen: go pick a file
  const id = b.dataset.id;
  if (id === 'save') return void $('#convertBtn').click();
  if (id === 'pdf') {
    S.fmt = 'pdf';
    const fmts = IMG_FORMATS;
    renderChips(fmts);
    updateUI();
    return setTab('convert');
  }
  setTab(b.dataset.tab as Tab);
});

// hover card: what does this button do?
const tip = $('#tip');
function showTip(b: HTMLElement): void {
  const info = TOOL_INFO[b.dataset.id ?? ''];
  if (!info) return;
  tip.innerHTML = `<b>${info[0]}</b><span>${info[1]}</span>`;
  const r = b.getBoundingClientRect(), o = $('#orbit').getBoundingClientRect();
  const w = 220, gap = 14;
  // sit beside the button, on the side facing away from the circle, so the circle's text stays readable
  let right = r.left + r.width / 2 >= o.left + o.width / 2;
  if (right && r.right + gap + w > innerWidth - 8) right = false;
  if (!right && r.left - gap - w < 8) right = true;
  tip.style.left = (right ? r.right + gap : r.left - gap) + 'px';
  tip.style.top = r.top + r.height / 2 + 'px';
  tip.style.transform = `translate(${right ? '0' : '-100%'}, -50%)`;
  tip.classList.add('on');
}
$('#spokes').addEventListener('mouseover', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.spoke');
  if (b) showTip(b);
});
$('#spokes').addEventListener('mouseout', e => {
  if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.spoke')) tip.classList.remove('on');
});

// start screen: hovering the circle fans out every tool so users can see what AnyFormat offers before uploading
const orbit = $('#orbit');
orbit.addEventListener('mouseenter', () => { if (!cur) renderSpokes(true, true); });
orbit.addEventListener('mouseleave', () => { if (!cur) $('#spokes').classList.remove('open'); });

/* ---------- crop UI ---------- */
function layout(): void {
  if (!isImage(cur)) return;
  const im = $<HTMLImageElement>('#previewImg'), wrap = $('#previewWrap');
  const r = Math.min(wrap.clientWidth / cur.w, wrap.clientHeight / cur.h, 1);
  const w = cur.w * r, h = cur.h * r;
  Object.assign(im.style, {
    width: w + 'px', height: h + 'px',
    left: (wrap.clientWidth - w) / 2 + 'px', top: (wrap.clientHeight - h) / 2 + 'px',
  });
  drawCrop();
}

function drawCrop(): void {
  if (!cur) return;
  const im = $<HTMLImageElement>('#previewImg'), c = cur.crop, el = $('#crop');
  const w = im.offsetWidth, h = im.offsetHeight;
  Object.assign(el.style, {
    left: im.offsetLeft + c.l * w + 'px', top: im.offsetTop + c.t * h + 'px',
    width: (c.r - c.l) * w + 'px', height: (c.b - c.t) * h + 'px',
  });
}
window.addEventListener('resize', layout);

interface DragState { h: string; x: number; y: number; c: Crop }
let drag: DragState | null = null;
const cropEl = $('#crop');

cropEl.addEventListener('pointerdown', e => {
  if (!cur) return;
  drag = { h: (e.target as HTMLElement).dataset.h ?? 'move', x: e.clientX, y: e.clientY, c: { ...cur.crop } };
  cropEl.setPointerCapture(e.pointerId);
  e.preventDefault();
});

cropEl.addEventListener('pointermove', e => {
  if (!drag || !cur) return;
  const im = $<HTMLImageElement>('#previewImg');
  const dx = (e.clientX - drag.x) / im.offsetWidth, dy = (e.clientY - drag.y) / im.offsetHeight;
  const o = drag.c, c = cur.crop, min = 0.03;
  const cl = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  if (drag.h === 'move') {
    const w = o.r - o.l, h = o.b - o.t;
    c.l = cl(o.l + dx, 0, 1 - w); c.r = c.l + w;
    c.t = cl(o.t + dy, 0, 1 - h); c.b = c.t + h;
  } else {
    if (drag.h.includes('w')) c.l = cl(o.l + dx, 0, o.r - min);
    if (drag.h.includes('e')) c.r = cl(o.r + dx, o.l + min, 1);
    if (drag.h.includes('n')) c.t = cl(o.t + dy, 0, o.b - min);
    if (drag.h.includes('s')) c.b = cl(o.b + dy, o.t + min, 1);
    if (S.ratio && drag.h.length === 2) enforceRatio(drag.h);
  }
  drawCrop();
  updateUI();
});
(['pointerup', 'pointercancel'] as const).forEach(t => cropEl.addEventListener(t, () => { drag = null; }));

function enforceRatio(h: string): void {
  if (!isImage(cur) || !S.ratio) return;
  const c = cur.crop, W = cur.w, H = cur.h;
  let w = (c.r - c.l) * W, hh = w / S.ratio / H; // normalized height
  const fixWidth = () => {
    hh = c.b - c.t;
    w = hh * H * S.ratio!;
    if (h.includes('e')) c.r = c.l + w / W; else c.l = c.r - w / W;
  };
  if (h.includes('s')) { c.b = Math.min(1, c.t + hh); if (c.b - c.t < hh) fixWidth(); }
  else { c.t = Math.max(0, c.b - hh); if (c.b - c.t < hh) fixWidth(); }
}

$('#ratios').onclick = e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b || !isImage(cur)) return;
  const r = b.dataset.r;
  if (r === 'reset') { cur.crop = { l: 0, t: 0, r: 1, b: 1 }; S.ratio = null; }
  else if (r === 'free') S.ratio = null;
  else {
    S.ratio = Number(r);
    let w = cur.w, h = w / S.ratio;
    if (h > cur.h) { h = cur.h; w = h * S.ratio; }
    const nw = w / cur.w, nh = h / cur.h;
    cur.crop = { l: (1 - nw) / 2, r: (1 + nw) / 2, t: (1 - nh) / 2, b: (1 + nh) / 2 };
  }
  const active = r === 'reset' ? $('[data-r=free]') : b;
  document.querySelectorAll('#ratios button').forEach(x => x.classList.toggle('on', x === active));
  drawCrop();
  updateUI();
};

/* ---------- size controls ---------- */
interface Rect { x: number; y: number; w: number; h: number }

const cropPx = (f: ImageEntry): Rect => ({
  x: Math.round(f.crop.l * f.w),
  y: Math.round(f.crop.t * f.h),
  w: Math.max(1, Math.round((f.crop.r - f.crop.l) * f.w)),
  h: Math.max(1, Math.round((f.crop.b - f.crop.t) * f.h)),
});
const outSize = (f: ImageEntry) => {
  const c = cropPx(f);
  return { w: Math.max(1, Math.round(c.w * S.scale)), h: Math.max(1, Math.round(c.h * S.scale)) };
};

/** Fill the left part of each range track so the value reads at a glance. */
const paint = (el: HTMLInputElement) => {
  const p = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  el.style.setProperty('--p', p + '%');
};
const paintAll = () => document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(paint);
document.addEventListener('input', e => { const el = e.target as HTMLInputElement; if (el.type === 'range') paint(el); });

function updateUI(): void {
  if (!cur) return;
  paintAll();
  if (isImage(cur)) {
    const o = outSize(cur), c = cropPx(cur);
    if (document.activeElement?.id !== 'outW') $<HTMLInputElement>('#outW').value = String(o.w);
    if (document.activeElement?.id !== 'outH') $<HTMLInputElement>('#outH').value = String(o.h);
    $('#dims').textContent = `${c.w} × ${c.h} → ${o.w} × ${o.h}`;
    $('#scaleOut').textContent = Math.round(S.scale * 100) + '%';
    const lossy = ['jpg', 'webp', 'pdf'].includes(S.fmt);
    $<HTMLInputElement>('#quality').disabled = !lossy;
    $('#qualityNote').textContent = lossy ? '' : `${S.fmt.toUpperCase()} is lossless`;
  }
  $('#srcFmt').textContent = `from ${cur.ext.toUpperCase()}`;
  const limit = isImage(cur) && S.targetBytes ? ` · ≤ ${kb(S.targetBytes)}` : '';
  $('#estimate').textContent = `${cur.ext.toUpperCase()} → ${S.fmt.toUpperCase()}${limit}`;
  $('#targetNote').textContent = S.targetBytes ? `output ≤ ${kb(S.targetBytes)}` : 'no limit';
  $('#convertAll').style.display = files.length > 1 ? '' : 'none';
}

const setScale = (s: number) => {
  S.scale = s;
  $<HTMLInputElement>('#scale').value = String(Math.min(200, s * 100));
  updateUI();
};
$<HTMLInputElement>('#scale').oninput = e => { S.scale = Number((e.target as HTMLInputElement).value) / 100; updateUI(); };
$<HTMLInputElement>('#quality').oninput = e => {
  const v = (e.target as HTMLInputElement).value;
  S.quality = Number(v) / 100;
  $('#qualityOut').textContent = v + '%';
};
$<HTMLInputElement>('#outW').oninput = e => {
  const v = Number((e.target as HTMLInputElement).value);
  if (v > 0 && isImage(cur)) setScale(v / cropPx(cur).w);
};
$<HTMLInputElement>('#outH').oninput = e => {
  const v = Number((e.target as HTMLInputElement).value);
  if (v > 0 && isImage(cur)) setScale(v / cropPx(cur).h);
};

/* ---------- conversion ---------- */
const canvasBlob = (cv: HTMLCanvasElement, mime: string, q?: number) =>
  new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Encoding failed'))), mime, q));

async function encodeImage(f: ImageEntry, fmt: string, scale: number, quality: number): Promise<Blob> {
  const c = cropPx(f);
  const w = Math.max(1, Math.round(c.w * scale)), h = Math.max(1, Math.round(c.h * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingQuality = 'high';
  if (['jpg', 'bmp', 'pdf'].includes(fmt)) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(f.img, c.x, c.y, c.w, c.h, 0, 0, w, h);
  switch (fmt) {
    case 'png': return canvasBlob(cv, 'image/png');
    case 'jpg': return canvasBlob(cv, 'image/jpeg', quality);
    case 'webp': return canvasBlob(cv, 'image/webp', quality);
    case 'bmp': return encodeBMP(ctx.getImageData(0, 0, w, h));
    case 'pdf': return encodePDF(await canvasBlob(cv, 'image/jpeg', quality), w, h);
    case 'docx': return imageToDocx(await canvasBlob(cv, 'image/png'), w, h);
    default: throw new Error(`Unknown format: ${fmt}`);
  }
}

interface Converted { blob: Blob; note: string; missed: boolean }

/** Encode at the chosen settings; if a target size is set, lower quality and then dimensions until it fits. */
async function convertImage(f: ImageEntry, fmt: string): Promise<Converted> {
  const target = S.targetBytes;
  const first = await encodeImage(f, fmt, S.scale, S.quality);
  if (!target || first.size <= target) return { blob: first, note: '', missed: false };

  const lossy = LOSSY.includes(fmt);
  if (lossy) { // 1) keep every pixel, search for the highest quality that fits
    const floor = await encodeImage(f, fmt, S.scale, 0.05);
    if (floor.size <= target) {
      let lo = 0.05, hi = S.quality, found = floor;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2, b = await encodeImage(f, fmt, S.scale, mid);
        if (b.size <= target) { found = b; lo = mid; } else hi = mid;
      }
      return { blob: found, note: ` · quality ${Math.round(lo * 100)}%`, missed: false };
    }
  }
  // 2) shrink dimensions (the only lever for lossless formats)
  const q = lossy ? 0.7 : 1;
  let lo = 0.02, hi = S.scale, found = await encodeImage(f, fmt, lo, q);
  if (found.size > target) return { blob: found, note: ' · smallest possible', missed: true };
  let at = lo;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2, b = await encodeImage(f, fmt, mid, q);
    if (b.size <= target) { found = b; at = mid; lo = mid; } else hi = mid;
  }
  return { blob: found, note: ` · resized to ${Math.round((at / S.scale) * 100)}%`, missed: false };
}

async function run(f: FileEntry): Promise<Converted> {
  const fmt = S.fmt;
  let out: Converted;
  if (isImage(f)) {
    if (!IMG_FORMATS.some(x => x.id === fmt)) throw new Error('Pick an image format for ' + f.file.name);
    out = await convertImage(f, fmt);
  } else {
    if (!(TEXT_FORMATS[f.ext] ?? []).includes(fmt)) throw new Error(`${f.file.name} can't become ${fmt.toUpperCase()}`);
    out = { blob: convertText(f, fmt), note: '', missed: false };
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(out.blob);
  a.download = `${base(f.file)}.${fmt}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return out;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

$('#convertBtn').onclick = async () => {
  if (!cur) return;
  try {
    const r = await run(cur);
    toast(r.missed
      ? `Can't reach ${kb(S.targetBytes ?? 0)} — saved the smallest possible (${kb(r.blob.size)})`
      : `Done — ${kb(r.blob.size)} saved${r.note}`);
  } catch (e) { toast(message(e)); }
};
$('#convertAll').onclick = async () => {
  let n = 0;
  for (const f of files) {
    try { await run(f); n++; await new Promise(r => setTimeout(r, 250)); } catch (e) { toast(message(e)); }
  }
  if (n) toast(`${n} file${n > 1 ? 's' : ''} converted`);
};

/* ---------- target file size ---------- */
let unit: 'KB' | 'MB' = 'KB';
const targetInput = $<HTMLInputElement>('#targetVal');

function readTarget(): void {
  const v = Number(targetInput.value);
  S.targetBytes = v > 0 ? Math.round(v * (unit === 'MB' ? 1048576 : 1024)) : null;
  updateUI();
}
function setUnit(u: 'KB' | 'MB'): void {
  unit = u;
  document.querySelectorAll<HTMLElement>('#unit button').forEach(b => b.classList.toggle('on', b.dataset.u === u));
}
targetInput.oninput = readTarget;
$('#unit').onclick = e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  setUnit(b.dataset.u as 'KB' | 'MB');
  readTarget();
};
$('#targetPresets').onclick = e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.v) { setUnit(b.dataset.u as 'KB' | 'MB'); targetInput.value = b.dataset.v; } else targetInput.value = '';
  readTarget();
};

/* ---------- back to start ---------- */
function backToStart(): void {
  files.forEach(f => { if (isImage(f)) URL.revokeObjectURL(f.url); });
  files.length = 0;
  cur = null;
  document.body.classList.add('empty');
  $('#orb').classList.remove('has', 'doc');
  $<HTMLImageElement>('#orbImg').removeAttribute('src');
  $('#spokes').classList.remove('open');
  $('#spokes').innerHTML = '';
  S.scale = 1;
  renderQueue();
}
$('#backBtn').onclick = backToStart;
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && cur && !$('#modal').classList.contains('on')) backToStart();
});
initFeatures();

/* ---------- drag & drop ---------- */
let depth = 0;
const dragUI = (on: boolean) => {
  $('#overlay').classList.toggle('on', on);
  $('#orb').classList.toggle('drag', on);
};
window.addEventListener('dragenter', e => { e.preventDefault(); depth++; dragUI(true); });
window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dragUI(false); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  depth = 0;
  dragUI(false);
  const dropped = e.dataTransfer?.files;
  if (dropped?.length) void addFiles([...dropped]);
});
$<HTMLInputElement>('#fileInput').onchange = e => {
  const input = e.target as HTMLInputElement;
  void addFiles([...(input.files ?? [])]);
  input.value = '';
};
window.addEventListener('paste', e => {
  const f = [...(e.clipboardData?.files ?? [])];
  if (f.length) void addFiles(f);
});
