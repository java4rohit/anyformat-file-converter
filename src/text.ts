import type { TextEntry } from './types.js';
import { base, esc } from './util.js';
import { DOC_MIME, DOC_SOURCES, DOC_TARGETS, toBlocks, writeDocument } from './docs.js';

type Row = string[];

export function parseCSV(t: string): Row[] {
  const rows: Row[] = [];
  let r: Row = [], v = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { v += '"'; i++; } else q = false; }
      else v += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { r.push(v); v = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      r.push(v); rows.push(r); r = []; v = '';
    } else v += ch;
  }
  if (v || r.length) { r.push(v); rows.push(r); }
  return rows.filter(row => row.length > 1 || row[0] !== '');
}

const cell = (v: unknown): string => {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCSV = (rows: unknown[][]): string => rows.map(r => r.map(cell).join(',')).join('\n');

export function convertText(f: TextEntry, fmt: string): Blob {
  const { ext: src, text: t } = f;
  const blob = (s: string, mime: string) => new Blob([s], { type: mime + ';charset=utf-8' });

  if (src === fmt) return blob(t, DOC_MIME[fmt] ?? 'text/plain');
  // documents: parsed to a neutral block model, then written in the target format
  if (DOC_SOURCES.includes(src) && DOC_TARGETS.includes(fmt)) return writeDocument(toBlocks(src, t), fmt, base(f.file));

  // structured data
  if (src === 'csv' || src === 'txt') {
    if (fmt === 'json') {
      const [hd = [], ...rest] = parseCSV(t);
      return blob(JSON.stringify(rest.map(r => Object.fromEntries(hd.map((k, i) => [k, r[i] ?? '']))), null, 2), 'application/json');
    }
    if (fmt === 'html') {
      const table = '<table border="1" cellpadding="6">' + parseCSV(t).map((r, i) => {
        const tag = i ? 'td' : 'th';
        return '<tr>' + r.map(c => `<${tag}>${esc(c)}</${tag}>`).join('') + '</tr>';
      }).join('') + '</table>';
      return blob(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(base(f.file))}</title></head><body>${table}</body></html>`, 'text/html');
    }
    return blob(t, 'text/plain');
  }
  if (src === 'json') {
    if (fmt === 'csv') {
      const parsed: unknown = JSON.parse(t);
      const data = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
      const keys = [...new Set(data.flatMap(o => Object.keys(o)))];
      return blob(toCSV([keys, ...data.map(o => keys.map(k => o[k]))]), 'text/csv');
    }
    if (fmt === 'html') {
      return blob(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(base(f.file))}</title></head><body><pre>${esc(t)}</pre></body></html>`, 'text/html');
    }
    return blob(t, 'text/plain');
  }
  throw new Error(`${src.toUpperCase()} can't become ${fmt.toUpperCase()}`);
}
