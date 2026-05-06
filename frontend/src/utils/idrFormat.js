/** Indonesian-style grouping: 1.000.000 (whole IDR). */
export function formatIdr(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n === 0) return '';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseIdrDigits(display) {
  const d = String(display || '').replace(/\D/g, '');
  if (!d) return 0;
  const n = parseInt(d, 10);
  return Number.isFinite(n) ? n : 0;
}
