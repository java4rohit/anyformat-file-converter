/** Encode raw pixels as a 24-bit BMP. */
export function encodeBMP(id: ImageData): Blob {
  const { width: w, height: h, data } = id;
  const row = Math.ceil((w * 3) / 4) * 4, size = 54 + row * h;
  const b = new DataView(new ArrayBuffer(size));
  b.setUint16(0, 0x4d42, true); b.setUint32(2, size, true); b.setUint32(10, 54, true); b.setUint32(14, 40, true);
  b.setInt32(18, w, true); b.setInt32(22, h, true); b.setUint16(26, 1, true); b.setUint16(28, 24, true); b.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((h - 1 - y) * w + x) * 4, d = 54 + y * row + x * 3;
      b.setUint8(d, data[s + 2]); b.setUint8(d + 1, data[s + 1]); b.setUint8(d + 2, data[s]);
    }
  }
  return new Blob([b], { type: 'image/bmp' });
}

/** Wrap a JPEG in a minimal single-page PDF sized to the image. */
export async function encodePDF(jpeg: Blob, w: number, h: number): Promise<Blob> {
  return encodeImagesPDF([{ jpeg, w, h }]);
}

/** Combine JPEG pages into one image-based PDF. */
export async function encodeImagesPDF(pages: { jpeg: Blob; w: number; h: number }[]): Promise<Blob> {
  if (!pages.length) throw new Error('Add at least one page to the scan');
  const enc = new TextEncoder();
  const parts: BlobPart[] = [], offs: number[] = [];
  let len = 0;
  const push = (d: string | Uint8Array) => {
    const u = typeof d === 'string' ? enc.encode(d) : d;
    parts.push(u as BlobPart);
    len += u.length;
  };
  const obj = (n: number, body: string) => { offs[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  for (const [i, page] of pages.entries()) {
    const pageId = pageIds[i], contentId = pageId + 1, imageId = pageId + 2;
    const pw = (page.w * 0.75).toFixed(2), ph = (page.h * 0.75).toFixed(2);
    const cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`;
    const jb = new Uint8Array(await page.jpeg.arrayBuffer());
    obj(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${contentId} 0 R /Resources << /XObject << /Im ${imageId} 0 R >> >> >>`);
    obj(contentId, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
    offs[imageId] = len;
    push(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jb.length} >>\nstream\n`);
    push(jb);
    push('\nendstream\nendobj\n');
  }
  const xr = len;
  const size = 3 + pages.length * 3;
  let x = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
