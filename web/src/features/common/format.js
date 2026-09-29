// Small formatting helpers shared by the Person-6 output features.
// Rule: never print undefined / null / NaN — always fall back to an explicit label.

export const NOT_AVAILABLE = 'Not available';
export const NOT_SPECIFIED = 'Not specified';

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 12.345 -> "12.3 °C" (unit optional). Falls back to `fallback` for non-numbers. */
export function fmt(v, digits = 1, unit = '', fallback = NOT_AVAILABLE) {
  if (!isNum(v)) return fallback;
  const n = v.toFixed(digits);
  if (!unit) return n;
  return unit.startsWith('°') || unit === '%' ? `${n} ${unit}` : `${n} ${unit}`;
}

/** metres -> "0.300 m" */
export function fmtM(v, digits = 2, fallback = NOT_SPECIFIED) {
  return fmt(v, digits, 'm', fallback);
}

/** metres -> "30 cm" style for thin layers */
export function fmtMm(v, fallback = NOT_SPECIFIED) {
  return isNum(v) ? `${Math.round(v * 1000)} mm` : fallback;
}

export function text(v, fallback = NOT_SPECIFIED) {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  if (!s || s === 'NaN' || s === 'undefined' || s === 'null') return fallback;
  return s;
}

export function fmtDateTime(iso, fallback = NOT_AVAILABLE) {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function mean(arr) {
  const xs = (arr || []).filter(isNum);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function minOf(arr) {
  const xs = (arr || []).filter(isNum);
  return xs.length ? Math.min(...xs) : null;
}

export function maxOf(arr) {
  const xs = (arr || []).filter(isNum);
  return xs.length ? Math.max(...xs) : null;
}

/** "Balanced" -> "balanced", for file names. */
export function slug(s, fallback = 'design') {
  const t = String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t || fallback;
}

export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
