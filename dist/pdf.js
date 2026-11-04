import { base } from './util.js';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
export const MAX_PDF_PAGES = 50;
let lib = null;
function loadLib() {
    lib ??= import(/* webpackIgnore: true */ PDFJS + 'pdf.min.mjs').then((m) => {
        m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
        return m;
    });
    lib.catch(() => { lib = null; }); // allow retry if the CDN was unreachable
    return lib;
}
/** Render each page of a PDF to a PNG file (capped at MAX_PDF_PAGES). */
export async function renderPdf(file, scale = 2) {
    const pdfjs = await loadLib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const total = doc.numPages, count = Math.min(total, MAX_PDF_PAGES), pages = [];
    const pad = String(total).length;
    try {
        for (let n = 1; n <= count; n++) {
            const page = await doc.getPage(n);
            const viewport = page.getViewport({ scale });
            const cv = document.createElement('canvas');
            cv.width = Math.ceil(viewport.width);
            cv.height = Math.ceil(viewport.height);
            const ctx = cv.getContext('2d');
            if (!ctx)
                throw new Error('Canvas not supported');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cv.width, cv.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Render failed'))), 'image/png'));
            const name = total > 1 ? `${base(file)}-page-${String(n).padStart(pad, '0')}.png` : `${base(file)}.png`;
            pages.push(new File([blob], name, { type: 'image/png' }));
        }
    }
    finally {
        void doc.destroy();
    }
    return { pages, total };
}
/** Extract the text of every page, rebuilt into paragraphs. Returns '' for scanned (image-only) PDFs. */
export async function extractPdfText(file) {
    const pdfjs = await loadLib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out = [];
    try {
        for (let n = 1; n <= doc.numPages; n++) {
            const content = await (await doc.getPage(n)).getTextContent();
            const ls = [];
            for (const it of content.items) {
                if (!('str' in it) || !it.str.trim())
                    continue;
                const y = it.transform[5], h = it.height || 10, last = ls[ls.length - 1];
                if (last && Math.abs(last.y - y) < last.h * 0.5)
                    last.text += (/\s$/.test(last.text) ? '' : ' ') + it.str;
                else
                    ls.push({ y, h, text: it.str });
            }
            let para = '';
            ls.forEach((l, i) => {
                const gap = i ? ls[i - 1].y - l.y : 0;
                if (i && gap > l.h * 1.9) {
                    out.push(para.trim());
                    para = '';
                }
                para += (para ? ' ' : '') + l.text.trim();
            });
            if (para.trim())
                out.push(para.trim());
        }
    }
    finally {
        void doc.destroy();
    }
    return out.join('\n\n');
}
//# sourceMappingURL=pdf.js.map