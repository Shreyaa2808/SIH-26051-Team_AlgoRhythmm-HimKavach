// Telemetry adapter: parsing, alignment and validation metrics.
//
// IMPORTANT — what is and is not "live":
//  * The backend currently has NO sensor-ingestion endpoint, so
//    getLiveSensorStatus() always reports "not connected". When a real
//    endpoint exists, only this function needs to change.
//  * "Imported" data = a CSV log the user loads from their own test-box logger.
//  * "Demo" data = clearly synthetic values for previewing the UI. It is never
//    called live / measured / sensor data and never counted as validation.
import { isNum } from '../common/format';

export const SOURCE = { IMPORTED: 'imported', DEMO: 'demo' };

export function getLiveSensorStatus() {
  return {
    connected: false,
    reason: 'Sensor data is not connected yet. The backend has no sensor-ingestion endpoint in this prototype.',
  };
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

const ALIASES = {
  timestamp: ['timestamp', 'time', 'datetime', 'date_time', 'date'],
  hour: ['hour', 'hour_of_day', 'hr'],
  indoor: ['indoor_temp_c', 'indoor_temp', 'indoor', 'temp_indoor', 'indoor_c', 'tin'],
  outdoor: ['outdoor_temp_c', 'outdoor_temp', 'outdoor', 'temp_outdoor', 'outdoor_c', 'tout'],
  humidity: ['humidity_pct', 'humidity', 'rh', 'rh_pct', 'indoor_humidity_pct'],
};

function splitLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pulls the wall-clock hour / date straight from the string (no timezone shifts). */
function parseStamp(v) {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const hour = hh !== undefined ? Number(hh) : null;
  return {
    date: `${y}-${mo}-${d}`,
    hour,
    minute: mm !== undefined ? Number(mm) : 0,
    label: String(v).trim(),
    sortKey: `${y}${mo}${d}${String(hh ?? 0).padStart(2, '0')}${String(mm ?? 0).padStart(2, '0')}`,
  };
}

/**
 * Accepts a CSV with a header row. Columns (case-insensitive, any order):
 *   timestamp (ISO 8601, e.g. 2025-01-15 07:30) OR hour (0-23)
 *   indoor_temp_c   [required]
 *   outdoor_temp_c, humidity_pct  [optional]
 * Lines starting with '#' are ignored.
 */
export function parseMeasuredCsv(textContent) {
  const errors = [];
  const lines = String(textContent ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) {
    return { ok: false, rows: [], errors: ['The file has no data rows.'], columns: [] };
  }
  const header = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, '_'));
  const idx = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    idx[key] = header.findIndex((h) => names.includes(h));
  }
  if (idx.indoor < 0) {
    return {
      ok: false, rows: [], columns: header,
      errors: ['No indoor temperature column found. Expected a header such as "indoor_temp_c".'],
    };
  }
  if (idx.timestamp < 0 && idx.hour < 0) {
    return {
      ok: false, rows: [], columns: header,
      errors: ['No time column found. Expected "timestamp" (ISO 8601) or "hour" (0-23).'],
    };
  }

  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i]);
    let stamp = null;
    let hour = null;
    if (idx.timestamp >= 0) {
      stamp = parseStamp(cells[idx.timestamp]);
      hour = stamp?.hour ?? null;
    }
    if (hour === null && idx.hour >= 0) {
      const h = num(cells[idx.hour]);
      if (isNum(h) && h >= 0 && h < 24) hour = Math.floor(h);
    }
    const indoor = num(cells[idx.indoor]);
    if (hour === null || !isNum(indoor)) { skipped += 1; continue; }
    rows.push({
      date: stamp?.date ?? null,
      hour,
      label: stamp?.label ?? `${String(hour).padStart(2, '0')}:00`,
      sortKey: stamp?.sortKey ?? String(hour).padStart(2, '0'),
      indoor,
      outdoor: idx.outdoor >= 0 ? num(cells[idx.outdoor]) : null,
      humidity: idx.humidity >= 0 ? num(cells[idx.humidity]) : null,
    });
  }
  if (skipped) errors.push(`${skipped} row(s) skipped (missing/invalid time or indoor temperature).`);
  if (!rows.length) {
    return { ok: false, rows: [], columns: header, errors: [...errors, 'No usable rows found.'] };
  }
  rows.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return { ok: true, rows, errors, columns: header };
}

// ---------------------------------------------------------------------------
// Demo data (synthetic — always labelled DEMO DATA in the UI)
// ---------------------------------------------------------------------------

/**
 * Synthetic 24 h series for previewing the page: the model's own predicted
 * curve with a fixed, arbitrary perturbation. It says NOTHING about model
 * accuracy and must never be shown as measured / sensor / live data.
 */
export function buildDemoRows(predicted) {
  if (!predicted?.hours?.length) return [];
  return predicted.hours.map((h, i) => {
    const hour = Math.floor(h);
    const pert = 0.7 * Math.sin(hour * 0.55 + 0.6) + 0.35 * Math.cos(hour * 1.3);
    const indoor = predicted.indoor[i] + pert;
    const outdoor = isNum(predicted.outdoor?.[i]) ? predicted.outdoor[i] + 0.4 * Math.sin(hour * 0.9) : null;
    return {
      date: null, hour, label: `${String(hour).padStart(2, '0')}:00`,
      sortKey: String(hour).padStart(2, '0'),
      indoor, outdoor, humidity: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Alignment + metrics
// ---------------------------------------------------------------------------

export function listDates(rows) {
  return [...new Set((rows ?? []).map((r) => r.date).filter(Boolean))];
}

/**
 * Pairs the model's predicted hourly indoor curve with measured samples by
 * hour of day (mean of the samples that fall in each hour). `date` restricts to
 * one calendar day; null = all days averaged.
 */
export function alignSeries(predicted, rows, date = null) {
  if (!predicted?.hours?.length) return [];
  const use = (rows ?? []).filter((r) => (date ? r.date === date : true));
  const buckets = new Map();
  for (const r of use) {
    const b = buckets.get(r.hour) ?? { sum: 0, n: 0, osum: 0, on: 0 };
    b.sum += r.indoor; b.n += 1;
    if (isNum(r.outdoor)) { b.osum += r.outdoor; b.on += 1; }
    buckets.set(r.hour, b);
  }
  return predicted.hours.map((h, i) => {
    const hour = Math.floor(h);
    const b = buckets.get(hour);
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      predicted: isNum(predicted.indoor[i]) ? predicted.indoor[i] : null,
      measured: b ? b.sum / b.n : null,
      measuredOutdoor: b && b.on ? b.osum / b.on : null,
      samples: b ? b.n : 0,
    };
  });
}

/**
 * Real, standard error statistics on paired hours only. Error = predicted −
 * measured. Returns null if there is nothing to compare. No "accuracy %" and
 * no "confidence" figure is produced — neither is mathematically defined here.
 */
export function computeMetrics(aligned) {
  const pairs = (aligned ?? []).filter((p) => isNum(p.predicted) && isNum(p.measured));
  if (!pairs.length) return null;
  const errs = pairs.map((p) => p.predicted - p.measured);
  const n = errs.length;
  const mae = errs.reduce((a, e) => a + Math.abs(e), 0) / n;
  const bias = errs.reduce((a, e) => a + e, 0) / n;
  const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / n);
  let worst = pairs[0];
  let maxAbs = Math.abs(errs[0]);
  errs.forEach((e, i) => {
    if (Math.abs(e) > maxAbs) { maxAbs = Math.abs(e); worst = pairs[i]; }
  });
  return { n, mae, maxAbs, bias, rmse, worstHour: worst.hour };
}

export function describeLog(rows) {
  if (!rows?.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const dates = listDates(rows);
  return {
    samples: rows.length,
    from: first.date ? first.label : null,
    to: last.date ? last.label : null,
    days: dates.length,
    hasOutdoor: rows.some((r) => isNum(r.outdoor)),
    hasHumidity: rows.some((r) => isNum(r.humidity)),
  };
}

export function latestSample(rows) {
  if (!rows?.length) return null;
  return rows[rows.length - 1];
}
