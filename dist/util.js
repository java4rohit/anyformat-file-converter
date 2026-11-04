export const ext = (f) => (f.name.split('.').pop() ?? '').toLowerCase();
export const base = (f) => f.name.replace(/\.[^.]+$/, '');
export const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
export const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
//# sourceMappingURL=util.js.map