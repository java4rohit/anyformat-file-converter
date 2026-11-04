/** Minimal ZIP reader/writer — enough for OOXML (.docx) and OpenDocument (.odt) packages. */
const te = new TextEncoder();
const td = new TextDecoder();
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
export function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++)
        c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;
/** Write an uncompressed ("stored") ZIP. File order is preserved (ODT needs `mimetype` first). */
export function writeZip(files, mime) {
    const parts = [], central = [];
    let offset = 0, centralSize = 0;
    for (const f of files) {
        const name = te.encode(f.name);
        const data = typeof f.data === 'string' ? te.encode(f.data) : f.data;
        const crc = crc32(data);
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);
        lh.setUint16(6, 0x0800, true);
        lh.setUint16(12, DOS_DATE, true);
        lh.setUint32(14, crc, true);
        lh.setUint32(18, data.length, true);
        lh.setUint32(22, data.length, true);
        lh.setUint16(26, name.length, true);
        parts.push(new Uint8Array(lh.buffer), name, data);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, 0x0800, true);
        ch.setUint16(14, DOS_DATE, true);
        ch.setUint32(16, crc, true);
        ch.setUint32(20, data.length, true);
        ch.setUint32(24, data.length, true);
        ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);
        central.push(new Uint8Array(ch.buffer), name);
        centralSize += 46 + name.length;
        offset += 30 + name.length + data.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: mime });
}
/** Read one text entry out of a ZIP (stored or deflate). Returns null if the entry doesn't exist. */
export async function readZipText(buf, wanted) {
    const v = new DataView(buf), u8 = new Uint8Array(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
        if (v.getUint32(i, true) === 0x06054b50) {
            e = i;
            break;
        }
    }
    if (e < 0)
        throw new Error('Not a valid zip-based document');
    const count = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
        if (v.getUint32(p, true) !== 0x02014b50)
            break;
        const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
        const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
        const off = v.getUint32(p + 42, true);
        if (td.decode(u8.subarray(p + 46, p + 46 + nlen)) === wanted) {
            const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
            const raw = u8.subarray(start, start + csize);
            if (method === 0)
                return td.decode(raw);
            if (method === 8) {
                const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                return td.decode(await new Response(stream).arrayBuffer());
            }
            throw new Error('Unsupported zip compression');
        }
        p += 46 + nlen + xlen + clen;
    }
    return null;
}
//# sourceMappingURL=zip.js.map