import { readZipText, writeZip } from './zip.js';

/** Format-neutral document model: every source is parsed into blocks, every document target is written from them. */
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string };

export const DOC_SOURCES = ['docx', 'odt', 'rtf', 'pdf', 'md', 'txt', 'html'];
export const DOC_TARGETS = ['docx', 'odt', 'rtf', 'pdf', 'html', 'txt', 'md'];
const MARKDOWN_SOURCES = ['md', 'docx', 'odt'];

export const DOC_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  pdf: 'application/pdf',
  html: 'text/html',
  txt: 'text/plain',
  md: 'text/markdown',
};

const xml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const unxml = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const lines = (s: string) => s.split('\n');
const BULLET = /^[•▪◦‣]\s+/;

/* ---------------- parsing: text → blocks ---------------- */

const cleanInline = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

export function textToBlocks(text: string, markdown: boolean): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const ls = lines(chunk).filter(l => l.trim() !== '' && !/^```/.test(l));
    if (!ls.length) continue;
    if (!markdown) { blocks.push({ t: 'p', text: ls.join('\n').trim() }); continue; }
    let para: string[] = [];
    const flush = () => { if (para.length) { blocks.push({ t: 'p', text: cleanInline(para.join(' ')) }); para = []; } };
    for (const l of ls) {
      const h = /^(#{1,6})\s+(.*)$/.exec(l), li = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/.exec(l);
      if (h) { flush(); blocks.push({ t: 'h', level: Math.min(3, h[1].length) as 1 | 2 | 3, text: cleanInline(h[2]) }); }
      else if (li) { flush(); blocks.push({ t: 'li', text: cleanInline(li[1]) }); }
      else para.push(l.trim());
    }
    flush();
  }
  return blocks;
}

export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,tr').forEach(el => {
    const text = (el.tagName === 'TR'
      ? [...el.children].map(c => c.textContent?.trim() ?? '').join('\t')
      : el.textContent ?? '').replace(/[ \t]+\n/g, '\n').trim();
    if (!text) return;
    const m = /^H(\d)$/.exec(el.tagName);
    if (m) blocks.push({ t: 'h', level: Math.min(3, +m[1]) as 1 | 2 | 3, text });
    else if (el.tagName === 'LI') blocks.push({ t: 'li', text });
    else blocks.push({ t: 'p', text });
  });
  if (!blocks.length) return textToBlocks(doc.body.textContent ?? '', false);
  return blocks;
}

export function toBlocks(ext: string, text: string): Block[] {
  return ext === 'html' ? htmlToBlocks(text) : textToBlocks(text, MARKDOWN_SOURCES.includes(ext));
}

/* ---------------- reading: DOCX / ODT / RTF → text ---------------- */

export function docxToBlocks(x: string): Block[] {
  const blocks: Block[] = [];
  for (const m of x.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? '';
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map(t => (t[0] === '<w:tab/>' ? '\t' : t[0] === '<w:br/>' ? '\n' : unxml(t[1] ?? ''))).join('').trim();
    if (!text) continue;
    const h = /^heading\s?(\d)$/i.exec(style);
    if (h) blocks.push({ t: 'h', level: Math.min(3, +h[1]) as 1 | 2 | 3, text });
    else if (/^title$/i.test(style)) blocks.push({ t: 'h', level: 1, text });
    else if (/<w:numPr>/.test(p) || /^list/i.test(style)) blocks.push({ t: 'li', text: text.replace(BULLET, '') });
    else if (BULLET.test(text)) blocks.push({ t: 'li', text: text.replace(BULLET, '') });
    else blocks.push({ t: 'p', text });
  }
  return blocks;
}

export function odtToBlocks(x: string): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  for (const m of x.matchAll(/<text:list-item\b[^>]*>|<\/text:list-item>|<text:(h|p)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text:\1>)/g)) {
    if (m[0].startsWith('<text:list-item')) { depth++; continue; }
    if (m[0] === '</text:list-item>') { depth--; continue; }
    const text = unxml((m[3] ?? '').replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<text:tab\/>/g, '\t')
      .replace(/<text:line-break\/>/g, '\n').replace(/<[^>]+>/g, '')).trim();
    if (!text) continue;
    if (m[1] === 'h') blocks.push({ t: 'h', level: Math.min(3, +(/outline-level="(\d)"/.exec(m[2])?.[1] ?? 1)) as 1 | 2 | 3, text });
    else if (depth > 0 || BULLET.test(text)) blocks.push({ t: 'li', text: text.replace(BULLET, '') });
    else blocks.push({ t: 'p', text });
  }
  return blocks;
}

export function rtfToText(rtf: string): string {
  let out = '', depth = 0, skip = -1;
  const SKIP = /^\{\\(\*|fonttbl|colortbl|stylesheet|info|pict|header|footer)/;
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') { depth++; if (skip < 0 && SKIP.test(rtf.slice(i, i + 14))) skip = depth; }
    else if (ch === '}') { if (depth === skip) skip = -1; depth--; }
    else if (ch === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') { if (skip < 0) out += n; i++; }
      else if (n === "'") { if (skip < 0) out += String.fromCharCode(parseInt(rtf.slice(i + 2, i + 4), 16)); i += 3; }
      else {
        const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 32));
        if (!m) continue;
        i += m[0].length - 1;
        if (skip >= 0) continue;
        if (m[1] === 'par') out += '\n\n';
        else if (m[1] === 'line') out += '\n';
        else if (m[1] === 'tab') out += '\t';
        else if (m[1] === 'u') { const c = +(m[2] ?? 0); out += String.fromCharCode(c < 0 ? c + 65536 : c); i++; }
      }
    } else if (skip < 0 && ch !== '\r' && ch !== '\n') out += ch;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Read any supported document file into text (markdown-ish for docx/odt, plain for the rest). */
export async function readDocument(file: File, ext: string): Promise<string> {
  if (ext === 'docx' || ext === 'odt') {
    const part = ext === 'docx' ? 'word/document.xml' : 'content.xml';
    const x = await readZipText(await file.arrayBuffer(), part);
    if (!x) throw new Error(`${file.name} isn't a valid .${ext} file`);
    return blocksToMd(ext === 'docx' ? docxToBlocks(x) : odtToBlocks(x));
  }
  if (ext === 'rtf') return rtfToText(await file.text());
  return file.text();
}

/* ---------------- writing: blocks → text formats ---------------- */

export function blocksToMd(blocks: Block[]): string {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    const s = b.t === 'h' ? '#'.repeat(b.level) + ' ' + b.text : b.t === 'li' ? '- ' + b.text : b.text;
    out.push(b.t === 'li' && blocks[i - 1]?.t === 'li' ? '\n' + s : (i ? '\n\n' : '') + s);
  });
  return out.join('').replace(/\n\n\n/g, '\n');
}

export function blocksToText(blocks: Block[]): string {
  return blocks.map(b => (b.t === 'li' ? '- ' : '') + b.text).join('\n\n');
}

export function blocksToHtml(blocks: Block[], title: string): string {
  let body = '', open = false;
  for (const b of blocks) {
    if (b.t !== 'li' && open) { body += '</ul>\n'; open = false; }
    const t = xml(b.text).replace(/\n/g, '<br>');
    if (b.t === 'h') body += `<h${b.level}>${t}</h${b.level}>\n`;
    else if (b.t === 'li') { if (!open) { body += '<ul>\n'; open = true; } body += `<li>${t}</li>\n`; }
    else body += `<p>${t}</p>\n`;
  }
  if (open) body += '</ul>\n';
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${xml(title)}</title></head>\n<body>\n${body}</body></html>`;
}

/* ---------------- writing: DOCX ---------------- */

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OD = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SECT = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';

const runs = (s: string) =>
  lines(s).map(l => `<w:r><w:t xml:space="preserve">${xml(l)}</w:t></w:r>`).join('<w:r><w:br/></w:r>');

const headingStyle = (id: number, size: number) =>
  `<w:style w:type="paragraph" w:styleId="Heading${id}"><w:name w:val="heading ${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${id - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headingStyle(1, 40)}${headingStyle(2, 32)}${headingStyle(3, 26)}</w:styles>`;

function docxPackage(bodyXml: string, extra: { name: string; data: Uint8Array }[] = [], imageRel = ''): Blob {
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OD}/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${OD}/styles" Target="styles.xml"/>${imageRel}</Relationships>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS} xmlns:r="${OD}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${bodyXml}${SECT}</w:body></w:document>`;
  return writeZip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    ...extra,
  ], DOC_MIME.docx);
}

export function blocksToDocx(blocks: Block[]): Blob {
  const body = blocks.map(b => {
    if (b.t === 'h') return `<w:p><w:pPr><w:pStyle w:val="Heading${b.level}"/></w:pPr>${runs(b.text)}</w:p>`;
    if (b.t === 'li') return `<w:p><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>•</w:t></w:r><w:r><w:tab/></w:r>${runs(b.text)}</w:p>`;
    return `<w:p>${runs(b.text)}</w:p>`;
  }).join('');
  return docxPackage(body || '<w:p/>');
}

/** A .docx containing just one picture, scaled to fit the page width. */
export async function imageToDocx(png: Blob, w: number, h: number): Promise<Blob> {
  const MAX = 5486400, EMU = 9525; // 6in wide max
  const k = Math.min(1, MAX / (w * EMU));
  const cx = Math.round(w * EMU * k), cy = Math.round(h * EMU * k);
  const drawing = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Picture"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const data = new Uint8Array(await png.arrayBuffer());
  return docxPackage(drawing, [{ name: 'word/media/image1.png', data }],
    `<Relationship Id="rId2" Type="${OD}/image" Target="media/image1.png"/>`);
}

/* ---------------- writing: ODT ---------------- */

export function blocksToOdt(blocks: Block[]): Blob {
  const para = (s: string) => lines(s).map(xml).join('<text:line-break/>');
  const body = blocks.map(b => {
    if (b.t === 'h') return `<text:h text:style-name="Heading_20_${b.level}" text:outline-level="${b.level}">${para(b.text)}</text:h>`;
    if (b.t === 'li') return `<text:p>• ${para(b.text)}</text:p>`;
    return `<text:p>${para(b.text)}</text:p>`;
  }).join('');
  const O = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"';
  const T = 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
  const style = (n: number, pt: number) =>
    `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph"><style:text-properties fo:font-size="${pt}pt" fo:font-weight="bold"/></style:style>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${O} ${T} office:version="1.2"><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${O} xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:styles>${style(1, 20)}${style(2, 16)}${style(3, 13)}</office:styles></office:document-styles>`;
  const entry = (p: string, t: string) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${t}"/>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">${entry('/', DOC_MIME.odt)}${entry('content.xml', 'text/xml')}${entry('styles.xml', 'text/xml')}</manifest:manifest>`;
  return writeZip([
    { name: 'mimetype', data: DOC_MIME.odt }, // must be first and uncompressed
    { name: 'META-INF/manifest.xml', data: manifest },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
  ], DOC_MIME.odt);
}

/* ---------------- writing: RTF ---------------- */

const rtfEsc = (s: string) =>
  [...s].map(c => {
    const n = c.codePointAt(0)!;
    if (c === '\\' || c === '{' || c === '}') return '\\' + c;
    if (c === '\n') return '\\line ';
    if (c === '\t') return '\\tab ';
    if (n < 128) return c;
    return `\\u${n > 32767 ? n - 65536 : n}?`;
  }).join('');

export function blocksToRtf(blocks: Block[]): Blob {
  const SIZE = [0, 40, 32, 26];
  const body = blocks.map(b => {
    if (b.t === 'h') return `\\pard\\sb240\\sa120\\b\\fs${SIZE[b.level]} ${rtfEsc(b.text)}\\b0\\fs22\\par`;
    if (b.t === 'li') return `\\pard\\li720\\fi-360\\sa100 \\u8226?\\tab ${rtfEsc(b.text)}\\par`;
    return `\\pard\\sa160 ${rtfEsc(b.text)}\\par`;
  }).join('\n');
  return new Blob([`{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Calibri;}}\\f0\\fs22\n${body}\n}`], { type: DOC_MIME.rtf });
}

/* ---------------- writing: PDF (text) ---------------- */

const WIN1252: Record<string, string> = {
  '•': '\x95', '–': '\x96', '—': '\x97', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '…': '\x85', '€': '\x80',
};
const pdfStr = (s: string) =>
  [...s].map(c => (WIN1252[c] ?? (c.charCodeAt(0) <= 255 ? c : '?'))).join('').replace(/[\\()]/g, '\\$&');

/** Paginated Helvetica PDF. Characters outside Latin-1 are replaced with "?". */
export function blocksToPdf(blocks: Block[]): Blob {
  const W = 612, H = 792, M = 72;
  interface Ln { text: string; size: number; bold: boolean; x: number; gap: number }
  const all: Ln[] = [];
  for (const b of blocks) {
    const size = b.t === 'h' ? [0, 22, 17, 14][b.level] : 11, bold = b.t === 'h', indent = b.t === 'li' ? 18 : 0;
    const perLine = Math.max(8, Math.floor((W - 2 * M - indent) / (size * (bold ? 0.58 : 0.52))));
    const wrapped: string[] = [];
    lines((b.t === 'li' ? '• ' : '') + b.text).forEach(para => {
      let cur = '';
      for (const word of para.split(/\s+/)) {
        if (cur && (cur + ' ' + word).length > perLine) { wrapped.push(cur); cur = word; }
        else cur = cur ? cur + ' ' + word : word;
        while (cur.length > perLine) { wrapped.push(cur.slice(0, perLine)); cur = cur.slice(perLine); }
      }
      wrapped.push(cur);
    });
    wrapped.forEach((text, i) => all.push({ text, size, bold, x: M + indent, gap: i === 0 ? size * 0.7 : 0 }));
  }
  const pages: string[][] = [[]];
  let y = H - M;
  for (const l of all) {
    const lh = l.size * 1.35;
    if (y - lh - l.gap < M && pages[pages.length - 1].length) { pages.push([]); y = H - M; }
    y -= l.gap ? l.gap * (y === H - M ? 0 : 1) : 0;
    y -= lh;
    if (l.text) pages[pages.length - 1].push(`BT /F${l.bold ? 2 : 1} ${l.size} Tf ${l.x} ${y.toFixed(2)} Td (${pdfStr(l.text)}) Tj ET`);
  }

  const offs: number[] = [];
  let pdf = '%PDF-1.4\n';
  const obj = (n: number, body: string) => { offs[n] = pdf.length; pdf += `${n} 0 obj\n${body}\nendobj\n`; };
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    obj(5 + 2 * i, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${6 + 2 * i} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    obj(6 + 2 * i, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  const count = 5 + 2 * pages.length, xr = pdf.length;
  pdf += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i++) pdf += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
  return new Blob([Uint8Array.from(pdf, c => c.charCodeAt(0) & 255)], { type: DOC_MIME.pdf });
}

/* ---------------- entry point ---------------- */

export function writeDocument(blocks: Block[], fmt: string, title: string): Blob {
  switch (fmt) {
    case 'docx': return blocksToDocx(blocks);
    case 'odt': return blocksToOdt(blocks);
    case 'rtf': return blocksToRtf(blocks);
    case 'pdf': return blocksToPdf(blocks);
    case 'html': return new Blob([blocksToHtml(blocks, title)], { type: DOC_MIME.html + ';charset=utf-8' });
    case 'md': return new Blob([blocksToMd(blocks)], { type: DOC_MIME.md + ';charset=utf-8' });
    case 'txt': return new Blob([blocksToText(blocks)], { type: DOC_MIME.txt + ';charset=utf-8' });
    default: throw new Error(`Unknown document format: ${fmt}`);
  }
}
