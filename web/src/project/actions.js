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

export function fetchOptimize({ siteId, designDay, options, baseline }) {
  return postJson('/optimize', {
    site_id: siteId,
    design_day: designDay,
    floor_area_m2: Number(baseline?.floor_area_m2) || 16,
    ceiling_height_m: Number(baseline?.ceiling_height_m) || 2.4,
    sensible_heat_w: Number(baseline?.sensible_heat_w) || 200,
    optimize_roof_slope: options.optimizeRoofSlope,
    optimize_ceiling_height: options.optimizeCeilingHeight,
    roof_slope_deg: Number(baseline?.roof_slope_deg) || 0,
    ground_snow_load_kpa: Number(options.groundSnowKpa) || 0,
    max_roof_snow_load_kpa: options.maxSnowKpa === '' ? null : Number(options.maxSnowKpa),
    orientation_deg: Number(baseline?.orientation_deg) || 0,
    window_wall: baseline?.window_wall ?? null,
    window_area_m2: Number(baseline?.window_area_m2) || 0,
    window_material_id: baseline?.window_material_id || 'double_glazed_low_e_window',
    co_generation_rate_lpm: Number(baseline?.co_generation_rate_lpm) || 0,
    night_gate_enabled: Boolean(baseline?.night_gate_enabled),
    night_gate_close_hour: Number(baseline?.night_gate_close_hour ?? 19),
    night_gate_open_hour: Number(baseline?.night_gate_open_hour ?? 7),
    night_gate_closed_leakage_area_cm2: Number(baseline?.night_gate_closed_leakage_area_cm2 ?? 60),
  });
}


export async function simulateDesign({ siteId, dayOfYear, design, context }) {
  return postJson('/simulate', {
    site_id: siteId,
    day_of_year: dayOfYear,
    wall_material_id: design.wall_material_id,
    insulation_material_id: design.insulation_material_id,
    wall_thickness_m: design.wall_thickness_m,
    insulation_thickness_m: design.insulation_thickness_m,
    leakage_area_cm2: design.leakage_area_cm2,
    floor_area_m2: context?.floor_area_m2 ?? 16,
    ceiling_height_m: design.ceiling_height_m ?? context?.ceiling_height_m ?? 2.4,
    roof_slope_deg: design.roof_slope_deg ?? context?.roof_slope_deg ?? 0,
    sensible_heat_w: context?.sensible_heat_w ?? 200,
    co_generation_rate_lpm: context?.co_generation_rate_lpm ?? 0,
    orientation_deg: context?.orientation_deg ?? 0,
    window_wall: context?.window_wall ?? null,
    window_area_m2: context?.window_area_m2 ?? 0,
    window_material_id: context?.window_material_id ?? 'double_glazed_low_e_window',
    night_gate_enabled: context?.night_gate_enabled ?? false,
    night_gate_close_hour: context?.night_gate_close_hour ?? 19,
    night_gate_open_hour: context?.night_gate_open_hour ?? 7,
    night_gate_closed_leakage_area_cm2: context?.night_gate_closed_leakage_area_cm2 ?? 60,
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
    orientation_deg: ctx.orientation_deg ?? 0,
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