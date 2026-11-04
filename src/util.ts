export const ext = (f: File): string => (f.name.split('.').pop() ?? '').toLowerCase();

export const base = (f: File): string => f.name.replace(/\.[^.]+$/, '');

export const kb = (n: number): string =>
  n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
