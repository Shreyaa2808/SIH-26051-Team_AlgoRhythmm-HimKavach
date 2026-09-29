// Person 1: API actions moved out of App.jsx (logic unchanged).
// Each function returns data or throws an Error with a readable message.
import { API } from '../api';

export function errorText(body, status) {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (d) return JSON.stringify(d);
  return `Request failed: ${status}`;
}

async function postJson(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorText(data, res.status));
  return data;
}

export function fetchOptimize({ siteId, designDay, options }) {
  return postJson('/optimize', {
    site_id: siteId,
    design_day: designDay,
    optimize_roof_slope: options.optimizeRoofSlope,
    optimize_ceiling_height: options.optimizeCeilingHeight,
    ground_snow_load_kpa: Number(options.groundSnowKpa) || 0,
    max_roof_snow_load_kpa: options.maxSnowKpa === '' ? null : Number(options.maxSnowKpa),
  });
}

export function fetchInstantiate({ optimizeResult, design, label }) {
  const ctx = optimizeResult.context ?? {};
  return postJson('/optimize/instantiate', {
    site_id: optimizeResult.site_id,
    day_of_year: optimizeResult.day_of_year,
    design,
    floor_area_m2: ctx.floor_area_m2 ?? 16,
    ceiling_height_m: ctx.ceiling_height_m ?? 2.4,
    roof_slope_deg: ctx.roof_slope_deg ?? 0,
    sensible_heat_w: ctx.sensible_heat_w ?? 200,
    ground_snow_load_kpa: ctx.ground_snow_load_kpa ?? 0,
    name: `Optimizer · ${label}`,
  });
}

export function exportOptimizeCSV(optimizeResult) {
  const rows = optimizeResult?.pareto_front || optimizeResult?.curated_designs || [];
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).join(',');
  const body = rows
    .map((r) =>
      Object.values(r)
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  const url = URL.createObjectURL(new Blob([headers + '\n' + body], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'himkavach_designs.csv';
  a.click();
  URL.revokeObjectURL(url);
}