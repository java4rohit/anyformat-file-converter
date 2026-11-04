import { base } from './util.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
export const MAX_PDF_PAGES = 50;

interface TextItem { str: string; transform: number[]; height: number }
interface PdfPage {
  getTextContent(): Promise<{ items: (TextItem | { type: string })[] }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface PdfLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDoc> };
}

let lib: Promise<PdfLib> | null = null;
function loadLib(): Promise<PdfLib> {
  lib ??= import(/* webpackIgnore: true */ PDFJS + 'pdf.min.mjs' as string).then((m: PdfLib) => {
    m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    return m;
  });
  lib.catch(() => { lib = null; }); // allow retry if the CDN was unreachable
  return lib;
}

export interface RenderedPdf { pages: File[]; total: number }

/** Render each page of a PDF to a PNG file (capped at MAX_PDF_PAGES). */
export async function renderPdf(file: File, scale = 2): Promise<RenderedPdf> {
  const pdfjs = await loadLib();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const total = doc.numPages, count = Math.min(total, MAX_PDF_PAGES), pages: File[] = [];
  const pad = String(total).length;
  try {
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(viewport.width);
      cv.height = Math.ceil(viewport.height);
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Render failed'))), 'image/png'));
      const name = total > 1 ? `${base(file)}-page-${String(n).padStart(pad, '0')}.png` : `${base(file)}.png`;
      pages.push(new File([blob], name, { type: 'image/png' }));
    }
  } finally {
    void doc.destroy();
  }
  return { pages, total };
}

/** Extract the text of every page, rebuilt into paragraphs. Returns '' for scanned (image-only) PDFs. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadLib();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      interface Line { y: number; h: number; text: string }
      const ls: Line[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        const y = it.transform[5], h = it.height || 10, last = ls[ls.length - 1];
        if (last && Math.abs(last.y - y) < last.h * 0.5) last.text += (/\s$/.test(last.text) ? '' : ' ') + it.str;
        else ls.push({ y, h, text: it.str });
      }
      let para = '';
      ls.forEach((l, i) => {
        const gap = i ? ls[i - 1].y - l.y : 0;
        if (i && gap > l.h * 1.9) { out.push(para.trim()); para = ''; }
        para += (para ? ' ' : '') + l.text.trim();
      });
      if (para.trim()) out.push(para.trim());
    }
  } finally {
    void doc.destroy();
  }
  return out.join('\n\n');
}
