// Adapter layer for the Person-6 output features (blueprint, reports, CSV,
// telemetry comparison, validation status).
//
// Everything here READS existing backend endpoints — nothing is renamed and
// no fields are invented:
//   GET /shelter/projects            -> [{id, name, site_id, created_at, updated_at}]
//   GET /shelter/projects/{id}       -> {model: ShelterModel, last_sim: DesignResponse | null}
//   GET /materials                   -> [{id, name, category, k, rho, cp, ...}]
//   GET /climate-status              -> {sites: [{site_id, cached, source_file, year_start, ...}]}
//   GET /openapi.json                -> {info: {title, version}}
//
// "The selected design" in this app == one saved project (the same project_id
// the 3D twin and the old blueprint tab already use).
import { apiUrl } from '../../api';
import { isNum, mean, minOf, maxOf } from '../common/format';

async function getJson(path) {
  const res = await fetch(apiUrl(path));
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status}) for ${path}`);
  }
  return res.json();
}

export async function listProjects() {
  const data = await getJson('/shelter/projects');
  return Array.isArray(data) ? data : [];
}

export async function loadProjectRaw(projectId) {
  return getJson(`/shelter/projects/${encodeURIComponent(projectId)}`);
}

export async function listMaterials() {
  const data = await getJson('/materials');
  return Array.isArray(data) ? data : [];
}

export async function loadClimateStatus() {
  const data = await getJson('/climate-status');
  return Array.isArray(data?.sites) ? data.sites : [];
}

export async function loadApiInfo() {
  const data = await getJson('/openapi.json');
  return data?.info ?? null;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const CARDINALS = ['N', 'E', 'S', 'W'];
export { CARDINALS };

function arr(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Turns the raw {model, last_sim} payload into one flat, null-safe object the
 * presentation components consume. Missing pieces stay null — never guessed.
 */
export function normalizeProject(raw) {
  const m = raw?.model;
  if (!m || typeof m !== 'object') return null;
  const s = raw?.last_sim ?? null;

  const indoor = arr(s?.indoor_temp_c).filter(isNum);
  const hasSim = Boolean(s) && indoor.length > 0 && arr(s.hours).length === arr(s.indoor_temp_c).length;

  const sim = hasSim
    ? {
        hours: arr(s.hours),
        indoor: arr(s.indoor_temp_c),
        outdoor: arr(s.outdoor_temp_c).length === arr(s.hours).length ? arr(s.outdoor_temp_c) : [],
        minIndoorC: minOf(s.indoor_temp_c),
        maxIndoorC: maxOf(s.indoor_temp_c),
        meanIndoorC: mean(s.indoor_temp_c),
        minOutdoorC: minOf(s.outdoor_temp_c),
        maxOutdoorC: maxOf(s.outdoor_temp_c),
        meanOutdoorC: mean(s.outdoor_temp_c),
        achievedMinIndoorC: isNum(s.achieved_min_indoor_c) ? s.achieved_min_indoor_c : null,
        targetMinIndoorC: isNum(s.target_min_indoor_c) ? s.target_min_indoor_c : null,
        metTarget: typeof s.met_target === 'boolean' ? s.met_target : null,
        safetyPassed: typeof s.safety_passed === 'boolean' ? s.safety_passed : null,
        safetyReasons: arr(s.safety_reasons),
        surfaces: arr(s.surfaces),
        resolved: s.resolved_thicknesses && typeof s.resolved_thicknesses === 'object' ? s.resolved_thicknesses : {},
        // /shelter/design leaves this at 0.0 when nothing was auto-solved and
        // /optimize/instantiate overwrites it — treat 0 as "not computed".
        materialCostInr: isNum(s.estimated_material_cost_inr) && s.estimated_material_cost_inr > 0
          ? s.estimated_material_cost_inr
          : null,
      }
    : null;

  return {
    id: m.id ?? null,
    name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : null,
    siteId: m.site_id ?? null,
    createdAt: m.created_at ?? null,
    updatedAt: m.updated_at ?? null,
    lengthM: isNum(m.length_m) ? m.length_m : null,
    widthM: isNum(m.width_m) ? m.width_m : null,
    ceilingHeightM: isNum(m.ceiling_height_m) ? m.ceiling_height_m : null,
    orientationDeg: isNum(m.orientation_deg) ? m.orientation_deg : null,
    occupancy: m.occupancy
      ? {
          purpose: m.occupancy.purpose ?? null,
          headcount: isNum(m.occupancy.headcount) ? m.occupancy.headcount : null,
          stayDurationDays: isNum(m.occupancy.stay_duration_days) ? m.occupancy.stay_duration_days : null,
        }
      : null,
    walls: arr(m.walls),
    roof: m.roof ?? null,
    floor: m.floor ?? null,
    leakageAreaCm2: isNum(m.leakage_area_cm2) ? m.leakage_area_cm2 : null,
    nightGate: {
      enabled: typeof m.night_gate_enabled === 'boolean' ? m.night_gate_enabled : null,
      closeHour: isNum(m.night_gate_close_hour) ? m.night_gate_close_hour : null,
      openHour: isNum(m.night_gate_open_hour) ? m.night_gate_open_hour : null,
      closedLeakageCm2: isNum(m.night_gate_closed_leakage_area_cm2)
        ? m.night_gate_closed_leakage_area_cm2
        : null,
    },
    sim,
    rawModel: m,
    rawLastSim: s,
  };
}

/** id -> material record */
export function materialIndex(materials) {
  const idx = {};
  for (const mat of arr(materials)) {
    if (mat?.id) idx[mat.id] = mat;
  }
  return idx;
}

/**
 * Site information for the selected design. Coordinates/elevation are only
 * known when the design's site is the location currently picked in the app
 * (the backend has no "get site by id" endpoint) — otherwise they are null.
 */
export function buildSiteInfo(project, location, climateSites) {
  const siteId = project?.siteId ?? null;
  const loc = location && location.site_id === siteId ? location : null;
  const climate = arr(climateSites).find((s) => s.site_id === siteId) ?? null;
  return {
    siteId,
    label: loc?.label ?? null,
    lat: isNum(loc?.lat) ? loc.lat : null,
    lon: isNum(loc?.lon) ? loc.lon : null,
    elevationM: isNum(loc?.elevation_m) ? loc.elevation_m : null,
    climateCached: climate ? Boolean(climate.cached) : null,
    climateSourceFile: climate?.source_file ?? null,
    climateYearStart: climate?.year_start ?? null,
    climateYearEnd: climate?.year_end ?? null,
    climateCachedAt: climate?.cached_at ?? null,
    // Only the cache-file name is known from the backend; the fetch script and
    // loader in this repo read NASA POWER files, so we only name the source
    // when a cached POWER-style file is actually reported.
    climateSourceName: climate?.cached ? 'NASA POWER (cached hourly file)' : null,
  };
}

// ---------------------------------------------------------------------------
// Traceability block (printed on every output)
// ---------------------------------------------------------------------------

/**
 * @param {object} project   normalizeProject() result
 * @param {object} selection App-level selection meta (may be null), see App.jsx
 * @param {object} site      buildSiteInfo() result
 * @param {object} apiInfo   {title, version} | null
 * @param {object} validation buildValidationStatus() result (may be null)
 */
export function buildTrace(project, selection, site, apiInfo, validation) {
  const designName = project?.name ?? null;
  return {
    // The app has no separate "project name" field (a saved project IS the
    // design), so this stays null unless a selection supplies one.
    projectName: selection?.projectName ?? null,
    designName,
    designId: project?.id ?? null,
    siteId: site?.siteId ?? null,
    siteLabel: site?.label ?? null,
    location:
      isNum(site?.lat) && isNum(site?.lon)
        ? `${site.lat.toFixed(4)}°, ${site.lon.toFixed(4)}°`
        : null,
    generated: new Date().toISOString(),
    simulation: project?.sim
      ? `${project.sim.hours.length}-hour design-day simulation` +
        (isNum(selection?.dayOfYear) ? ` (day of year ${selection.dayOfYear})` : '')
      : null,
    modelVersion: apiInfo?.version ? `${apiInfo.title ?? 'API'} v${apiInfo.version}` : null,
    validationSummary: validation?.summaryLine ?? null,
  };
}

// ---------------------------------------------------------------------------
// Simulation CSV / project JSON
// ---------------------------------------------------------------------------

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV of the hourly data the simulation API actually returns for this design:
 *   hour, outdoor_temp_c, indoor_temp_c
 * (the API does not return solar radiation, heat gain/loss or heating demand
 * per hour, so those columns do not exist — nothing is filled in).
 * The optional header block uses '#' comment lines: read with
 * pandas.read_csv(path, comment='#').
 */
export function buildSimulationCsv(project, trace, { includeHeader = true } = {}) {
  const sim = project?.sim;
  if (!sim) return null;

  const cols = [{ key: 'hour', src: sim.hours }];
  if (sim.outdoor.length) cols.push({ key: 'outdoor_temp_c', src: sim.outdoor });
  cols.push({ key: 'indoor_temp_c', src: sim.indoor });

  const lines = [];
  if (includeHeader) {
    const meta = [
      ['Project', trace?.projectName],
      ['Design', trace?.designName],
      ['Design ID', trace?.designId],
      ['Site', trace?.siteLabel ? `${trace.siteLabel} (${trace.siteId})` : trace?.siteId],
      ['Location', trace?.location],
      ['Generated', trace?.generated],
      ['Simulation', trace?.simulation],
      ['Model/version', trace?.modelVersion],
      ['Source', 'HimKavach RC-network thermal solver via POST /shelter/design (saved project last_sim)'],
      ['Units', 'hour = hour of design day; temperatures in degC'],
    ];
    for (const [k, v] of meta) {
      lines.push(`# ${k}: ${v ?? (k === 'Project' ? 'Not specified' : 'Not available')}`);
    }
  }
  lines.push(cols.map((c) => c.key).join(','));
  const n = sim.hours.length;
  for (let i = 0; i < n; i += 1) {
    lines.push(cols.map((c) => csvCell(isNum(c.src[i]) ? c.src[i] : null)).join(','));
  }
  return { csv: lines.join('\n') + '\n', columns: cols.map((c) => c.key), rows: n };
}

export function buildProjectJson(project, trace, selection) {
  if (!project) return null;
  return JSON.stringify(
    {
      traceability: trace,
      selection: selection ?? null,
      model: project.rawModel,
      last_sim: project.rawLastSim,
      note:
        'Exported from the HimKavach prototype. last_sim is null if no simulation was saved for this design. No ANSYS data is included (ANSYS is not connected in this prototype).',
    },
    null,
    2,
  );
}
