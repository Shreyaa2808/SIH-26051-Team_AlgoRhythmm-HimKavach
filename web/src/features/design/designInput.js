/**
 * designInput — the single normalized object produced by the Person 2
 * (Shelter Design Wizard) and consumed by everyone else.
 *
 * Rules:
 *  - Plain JSON only (no functions, no Dates) so it can be saved / restored.
 *  - Field names here are FROZEN once Phase 0 is merged. Add fields freely;
 *    don't rename or remove without telling the other owners.
 *  - Units are in the field name (…M, …M2, …Deg, …W, …Cm2).
 *  - Derived values are never stored; call deriveGeometry()/deriveOperations().
 */

export const DESIGN_INPUT_VERSION = 1;

/* ------------------------------ option lists ------------------------------ */

export const SHELTER_TYPES = [
  { id: 'personnel', label: 'Personnel shelter' },
  { id: 'community', label: 'Community shelter' },
  { id: 'medical', label: 'Medical / aid post' },
  { id: 'storage', label: 'Storage / utility' },
  { id: 'other', label: 'Other' },
];

export const USAGES = [
  { id: 'seasonal', label: 'Seasonal (winter)' },
  { id: 'year_round', label: 'Year-round' },
  { id: 'emergency', label: 'Emergency / temporary' },
];

export const SEASONS = [
  { id: 'winter', label: 'Winter' },
  { id: 'summer', label: 'Summer' },
  { id: 'year_round', label: 'All seasons' },
];

export const OCCUPANCY_PATTERNS = [
  { id: 'night', label: 'Night-time', startHour: 18, endHour: 8 },
  { id: 'day', label: 'Daytime', startHour: 8, endHour: 18 },
  { id: 'continuous', label: 'Continuous (24 h)', startHour: 0, endHour: 24 },
  { id: 'custom', label: 'Custom hours', startHour: 18, endHour: 8 },
];

export const SHAPES = [
  { id: 'rectangular', label: 'Rectangular' },
  // Stored for blueprint/3D. The RC solver models a rectangular box only.
  { id: 'l_shaped', label: 'L-shaped (not simulated)' },
];

/** Metabolic sensible heat per person (W). Conservative round figures. */
export const ACTIVITIES = [
  { id: 'sleeping', label: 'Sleeping / resting', wPerPerson: 70 },
  { id: 'sedentary', label: 'Seated / light work', wPerPerson: 100 },
  { id: 'active', label: 'Moderate activity', wPerPerson: 150 },
];

export const HEATING_TYPES = [
  { id: 'none', label: 'No heating' },
  { id: 'stove', label: 'Stove / bukhari' },
  { id: 'electric', label: 'Electric heater' },
  { id: 'other', label: 'Other' },
];

export const VENTILATION_TYPES = [
  { id: 'infiltration', label: 'Infiltration only' },
  { id: 'natural', label: 'Natural (openable vents)' },
  { id: 'mechanical', label: 'Mechanical' },
];

export const WALLS = ['N', 'E', 'S', 'W']; // pre-rotation compass labels
export const GLAZING_IDS = ['double_glazed_low_e_window', 'triple_glazed_krypton_window'];
export const FRAMES = [
  { id: 'wood', label: 'Timber' },
  { id: 'upvc', label: 'uPVC' },
  { id: 'aluminium', label: 'Aluminium (thermal break)' },
];
export const DOOR_TYPES = [
  { id: 'timber', label: 'Timber' },
  { id: 'insulated', label: 'Insulated' },
  { id: 'steel', label: 'Steel' },
];

/**
 * How a component's material is chosen.
 *  recommend — user lets HimKavach decide (Person 5's optimizer can act on it;
 *              until then the baseline uses RECOMMENDED_DEFAULTS, labelled).
 *  select    — a material id from GET /materials.
 *  custom    — user-entered properties (k, rho, cp). Not yet accepted by the
 *              /simulate backend; toSimulatePayload() will say so.
 */
export const MATERIAL_MODES = ['recommend', 'select', 'custom'];

/** Baseline defaults used when mode === 'recommend' (labelled in the UI). */
export const RECOMMENDED_DEFAULTS = {
  wall: { materialId: 'local_stone_masonry', thicknessM: 0.3 },
  roof: { materialId: 'local_stone_masonry', thicknessM: 0.3 },
  floor: { materialId: 'local_stone_masonry', thicknessM: 0.3 },
  insulation: { materialId: 'expanded_polystyrene_eps', thicknessM: 0.1 },
};

/* --------------------------------- limits --------------------------------- */

export const LIMITS = {
  lengthM: [1.5, 30],
  widthM: [1.5, 30],
  heightM: [1.8, 6],
  orientationDeg: [0, 359],
  roofSlopeDeg: [0, 45],
  occupants: [0, 100],
  wallThicknessM: [0.05, 1.5],
  insulationThicknessM: [0, 0.5],
  windowDimM: [0.2, 4],
  doorDimM: [0.6, 3],
  leakageCm2: [0, 2000],
  sensibleHeatW: [0, 20000],
  sillM: [0, 3],
  heatingW: [0, 20000],
  internalLoadsW: [0, 10000],
  coGenerationLpm: [0, 10],
  gateLeakageCm2: [1, 2000],
};

/* --------------------------------- factory -------------------------------- */

let _idCounter = 0;
export const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${(_idCounter++).toString(36)}`;

/** New window. `offsetM: null` = auto-spaced along its wall. Sensible defaults; caller overrides. */
export function createWindow(overrides = {}) {
  return {
    id: newId('win'), wall: 'S', widthM: 1.2, heightM: 1.0, sillM: 0.9,
    glazingId: 'double_glazed_low_e_window', frame: 'wood', operable: false, offsetM: null,
    ...overrides,
  };
}

/** New door (height is capped so it always fits under the ceiling). */
export function createDoor(overrides = {}, ceilingM = 2.4) {
  return {
    id: newId('door'), wall: 'N', widthM: 0.9, heightM: Math.max(0.6, Math.min(2.0, Number(ceilingM) - 0.1)),
    type: 'insulated', offsetM: null,
    ...overrides,
  };
}

const envelopePart = (key) => ({
  mode: 'recommend',
  materialId: RECOMMENDED_DEFAULTS[key].materialId,
  thicknessM: RECOMMENDED_DEFAULTS[key].thicknessM,
  custom: { name: '', k: null, rho: null, cp: null, costPerM3: null },
});

export function createDefaultDesignInput(overrides = {}) {
  const base = {
    version: DESIGN_INPUT_VERSION,
    mode: 'new-build', // 'new-build' | 'retrofit' (Person 3 reuses steps)

    site: {
      siteId: null, // id from POST /location/resolve, or a preset
      label: '',
      latitude: null,
      longitude: null,
      elevationM: null,
      climateCached: null, // from POST /location/resolve
      designDay: 'coldest_winter_night',
    },

    shelter: {
      type: 'personnel',
      usage: 'seasonal',
      season: 'winter',
      occupants: 4,
      occupancyPattern: 'night',
      scheduleStartHour: 18,
      scheduleEndHour: 8,
    },

    geometry: {
      shape: 'rectangular',
      lengthM: 4,
      widthM: 4,
      heightM: 2.4,
      orientationDeg: 0,
      roofSlopeDeg: 0,
    },

    envelope: {
      wall: envelopePart('wall'),
      roof: envelopePart('roof'),
      floor: envelopePart('floor'),
      insulation: envelopePart('insulation'),
    },

    openings: {
      windows: [], // { id, wall, widthM, heightM, sillM, glazingId, frame, operable }
      doors: [], //   { id, wall, widthM, heightM, type }
      leakageAreaCm2: 200,
    },

    operations: {
      activity: 'sleeping',
      heatingType: 'none',
      heatingW: 0,
      ventilationType: 'infiltration',
      internalLoadsW: 0, // lighting + equipment
      sensibleHeatOverrideW: null, // null = computed (occupants x activity + loads + heater)
      coGenerationLpm: 0,
      nightGate: { enabled: false, closeHour: 19, openHour: 7, closedLeakageCm2: 60 },
    },
  };
  return mergeDesignInput(base, overrides);
}

/** Deep-merge plain objects; arrays and scalars in `patch` replace. */
export function mergeDesignInput(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  const out = Array.isArray(target) ? [...target] : { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target?.[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      out[k] = mergeDesignInput(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Restore a saved (possibly older) input, filling any missing fields. */
export function hydrateDesignInput(saved) {
  return mergeDesignInput(createDefaultDesignInput(), saved || {});
}

/* --------------------------------- derived -------------------------------- */

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function deriveGeometry(geometry) {
  const L = num(geometry?.lengthM);
  const W = num(geometry?.widthM);
  const H = num(geometry?.heightM);
  const slope = num(geometry?.roofSlopeDeg);
  const floorAreaM2 = L * W;
  const perimeterM = 2 * (L + W);
  const wallGrossAreaM2 = perimeterM * H;
  const roofAreaM2 = floorAreaM2 / Math.cos((slope * Math.PI) / 180 || 0);
  return {
    floorAreaM2,
    volumeM3: floorAreaM2 * H,
    perimeterM,
    wallGrossAreaM2,
    roofAreaM2,
    envelopeAreaM2: wallGrossAreaM2 + roofAreaM2 + floorAreaM2,
    isSquare: Math.abs(L - W) < 0.05,
    /** Gross wall area by pre-rotation label: N/S span the length, E/W the width. */
    wallAreaByLabelM2: { N: L * H, S: L * H, E: W * H, W: W * H },
  };
}

/* ------------------------------ envelope maths ----------------------------- */

/** ASHRAE film resistances, same defaults as engine/solver/rc_network.py. */
export const SURFACE_R = { outside: 0.04, inside: 0.13 };

/** Whole-assembly U-value (W/m²K) from layers [{ k, thicknessM }]; null if any layer is unusable. */
export function uValueOf(layers) {
  if (!layers.length) return null;
  let r = SURFACE_R.outside + SURFACE_R.inside;
  for (const l of layers) {
    if (!(Number(l.k) > 0)) return null;
    r += Number(l.thicknessM || 0) / Number(l.k);
  }
  return 1 / r;
}

/** Per-m² figures for one layer. Cost/carbon are null when the data is missing (never 0). */
export function layerMetrics(material, thicknessM) {
  if (!material) return { rValue: null, costPerM2: null, carbonPerM2: null };
  const t = Number(thicknessM) || 0;
  return {
    rValue: Number(material.k) > 0 ? t / Number(material.k) : null,
    costPerM2: material.cost_per_m3_inr != null ? material.cost_per_m3_inr * t : null,
    carbonPerM2:
      material.carbon_kgco2e_per_kg != null && material.rho != null
        ? material.carbon_kgco2e_per_kg * material.rho * t
        : null,
  };
}

/**
 * The layers of wall | roof | floor as the user defined them: that component's
 * structural layer + the shared insulation layer. `materialsById` comes from GET /materials.
 */
export function buildAssembly(envelope, key, materialsById) {
  const eff = resolveEnvelope(envelope);
  const toLayer = (part, label) => {
    if (part.source === 'custom') {
      const c = part.custom || {};
      return { label, name: c.name || 'Custom material', k: Number(c.k) || null, rho: c.rho, cp: c.cp,
        thicknessM: part.thicknessM, source: 'custom', material: { ...c, cost_per_m3_inr: c.costPerM3 ?? null, carbon_kgco2e_per_kg: null } };
    }
    const m = materialsById?.[part.materialId];
    return { label, name: m?.name || part.materialId, k: m?.k ?? null, rho: m?.rho, cp: m?.cp,
      thicknessM: part.thicknessM, source: part.source, material: m || null };
  };
  const layers = [toLayer(eff[key], key), toLayer(eff.insulation, 'insulation')];
  const usable = layers.filter((l) => l.thicknessM > 0);
  return { layers, uValue: uValueOf(usable.map((l) => ({ k: l.k, thicknessM: l.thicknessM }))) };
}

/** Rough, indicative rating for a cold-climate opaque assembly. */
export function uValueBand(u) {
  if (u == null) return { id: 'unknown', label: 'Unknown' };
  if (u <= 0.25) return { id: 'very-good', label: 'Very good' };
  if (u <= 0.45) return { id: 'good', label: 'Good' };
  if (u <= 1.0) return { id: 'fair', label: 'Fair' };
  return { id: 'poor', label: 'Poor' };
}

/** Compass bearing (deg) each pre-rotation wall label faces, given orientation. */
export function wallBearings(orientationDeg) {
  const o = num(orientationDeg);
  return { N: (0 + o) % 360, E: (90 + o) % 360, S: (180 + o) % 360, W: (270 + o) % 360 };
}

/** Which wall label faces closest to true south, and how far off (deg). */
export function southFacingWall(orientationDeg) {
  const b = wallBearings(orientationDeg);
  let best = 'N';
  let off = 360;
  for (const [label, bearing] of Object.entries(b)) {
    const d = Math.abs(((bearing - 180 + 540) % 360) - 180);
    if (d < off) { off = d; best = label; }
  }
  return { wall: best, offsetDeg: off };
}

/** Orientation that points the LONGER side's wall due south (0 if square). */
export function orientationLongSideSouth(geometry) {
  return num(geometry?.widthM) > num(geometry?.lengthM) ? 90 : 0;
}

/** Hours per day the shelter is occupied (handles overnight ranges). */
export function occupiedHours(start, end) {
  const s = Number(start);
  const e = Number(end);
  if (s === 0 && e === 24) return 24;
  return (e - s + 24) % 24;
}

export function deriveOperations(input) {
  const occupants = num(input?.shelter?.occupants);
  const act = ACTIVITIES.find((a) => a.id === input?.operations?.activity) || ACTIVITIES[0];
  const metabolicW = occupants * act.wPerPerson;
  const internalW = num(input?.operations?.internalLoadsW);
  const heatingW = num(input?.operations?.heatingW);
  const computedW = metabolicW + internalW + heatingW;
  const ov = input?.operations?.sensibleHeatOverrideW;
  const overridden = ov !== null && ov !== undefined && ov !== '' && Number.isFinite(Number(ov));
  return {
    metabolicW,
    internalLoadsW: internalW,
    heatingW,
    computedW,
    overridden,
    sensibleHeatW: overridden ? Number(ov) : computedW,
  };
}

/* -------------------------------- openings -------------------------------- */

export const WALL_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };

/** Length (m) of the wall carrying a pre-rotation label: N/S span the length, E/W the width. */
export function wallLengthM(geometry, label) {
  return num(label === 'N' || label === 'S' ? geometry?.lengthM : geometry?.widthM);
}

const hasOffset = (it) => it.offsetM !== null && it.offsetM !== undefined && it.offsetM !== '' && Number.isFinite(Number(it.offsetM));

/**
 * Place openings along ONE wall. Positions are measured in metres from the
 * wall's LEFT edge as seen from OUTSIDE the shelter (counter-clockwise when
 * viewed from above). Items with a numeric `offsetM` stay where the user put
 * them; the rest are packed with equal gaps. Reports overlaps and items that
 * stick out past the wall ends.
 */
export function layoutWall(wallLenM, items) {
  const len = num(wallLenM);
  const autos = items.filter((it) => !hasOffset(it));
  const gap = Math.max(0, (len - autos.reduce((a, it) => a + num(it.widthM), 0)) / (autos.length + 1));
  let cursor = gap;
  const placed = items.map((it) => {
    const w = num(it.widthM);
    let x0;
    if (hasOffset(it)) x0 = Number(it.offsetM);
    else { x0 = cursor; cursor += w + gap; }
    return { id: it.id, x0, x1: x0 + w, auto: !hasOffset(it) };
  });
  const EPS = 1e-6;
  const sorted = placed.slice().sort((a, b) => a.x0 - b.x0);
  const overlaps = [];
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i - 1].x1 > sorted[i].x0 + EPS) overlaps.push([sorted[i - 1].id, sorted[i].id]);
  const outOfBounds = placed.filter((p) => p.x0 < -EPS || p.x1 > len + EPS).map((p) => p.id);
  return { placed, overlaps, outOfBounds };
}

/** Per-wall openings summary + placement, plus totals. Pure; no materials needed. */
export function deriveOpenings(input) {
  const g = input?.geometry || {};
  const H = num(g.heightM);
  const wins = input?.openings?.windows || [];
  const drs = input?.openings?.doors || [];
  const walls = {};
  let windowM2 = 0;
  let doorM2 = 0;
  for (const label of WALLS) {
    const lengthM = wallLengthM(g, label);
    const items = [
      ...drs.filter((d) => d.wall === label).map((d) => ({ ...d, kind: 'door' })),
      ...wins.filter((w) => w.wall === label).map((w) => ({ ...w, kind: 'window' })),
    ];
    const layout = layoutWall(lengthM, items);
    const wArea = items.filter((i) => i.kind === 'window').reduce((a, i) => a + num(i.widthM) * num(i.heightM), 0);
    const dArea = items.filter((i) => i.kind === 'door').reduce((a, i) => a + num(i.widthM) * num(i.heightM), 0);
    windowM2 += wArea;
    doorM2 += dArea;
    const grossM2 = lengthM * H;
    walls[label] = {
      label, lengthM, heightM: H, grossM2, windowM2: wArea, doorM2: dArea,
      openingsM2: wArea + dArea,
      openingRatio: grossM2 > 0 ? (wArea + dArea) / grossM2 : 0,
      netOpaqueM2: Math.max(0, grossM2 - wArea - dArea),
      items, ...layout,
    };
  }
  const grossAll = Object.values(walls).reduce((a, w) => a + w.grossM2, 0);
  return {
    walls,
    windowM2,
    doorM2,
    windowToWallRatio: grossAll > 0 ? windowM2 / grossAll : 0,
    netOpaqueWallM2: Math.max(0, grossAll - windowM2 - doorM2),
  };
}

/** Glazing supply cost (INR) from materials' cost_per_m2_inr; null if any glazing type has no price. */
export function glazingCostInr(windows, materialsById) {
  if (!windows?.length) return 0;
  let total = 0;
  for (const w of windows) {
    const price = materialsById?.[w.glazingId]?.cost_per_m2_inr;
    if (price == null) return null;
    total += price * num(w.widthM) * num(w.heightM);
  }
  return total;
}

/** Resolve each envelope component to what will actually be simulated. */
export function resolveEnvelope(envelope) {
  const out = {};
  for (const key of ['wall', 'roof', 'floor', 'insulation']) {
    const part = envelope?.[key] || envelopePart(key);
    if (part.mode === 'select' && part.materialId) {
      out[key] = { source: 'selected', materialId: part.materialId, thicknessM: num(part.thicknessM) };
    } else if (part.mode === 'custom') {
      out[key] = { source: 'custom', custom: part.custom, thicknessM: num(part.thicknessM) };
    } else {
      out[key] = { source: 'recommended-default', ...RECOMMENDED_DEFAULTS[key] };
    }
  }
  return out;
}

/* ------------------------------- validation ------------------------------- */

const inRange = (v, [lo, hi]) => Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi;

/**
 * Returns { ready, errors: {site,shelter,geometry,envelope,openings,operations},
 * warnings: [...] }. `ready` means: everything a baseline simulation needs
 * exists. Errors are per-section arrays of human-readable strings.
 */
export function validateDesignInput(input) {
  const errors = { site: [], shelter: [], geometry: [], envelope: [], openings: [], operations: [] };
  const warnings = [];
  const d = input || {};

  // Site
  if (!d.site?.siteId) errors.site.push('Choose a location on the map.');
  if (!d.site?.designDay) errors.site.push('Choose a design-day scenario.');

  // Shelter brief
  const sh = d.shelter || {};
  if (!SHELTER_TYPES.some((t) => t.id === sh.type)) errors.shelter.push('Choose a shelter type.');
  if (!inRange(sh.occupants, LIMITS.occupants)) errors.shelter.push('Occupants must be 0–100.');
  if (![sh.scheduleStartHour, sh.scheduleEndHour].every((h) => Number.isFinite(Number(h)) && h >= 0 && h <= 24))
    errors.shelter.push('Schedule hours must be between 0 and 24.');

  // Geometry
  const g = d.geometry || {};
  if (!inRange(g.lengthM, LIMITS.lengthM)) errors.geometry.push(`Length must be ${LIMITS.lengthM[0]}–${LIMITS.lengthM[1]} m.`);
  if (!inRange(g.widthM, LIMITS.widthM)) errors.geometry.push(`Width must be ${LIMITS.widthM[0]}–${LIMITS.widthM[1]} m.`);
  if (!inRange(g.heightM, LIMITS.heightM)) errors.geometry.push(`Height must be ${LIMITS.heightM[0]}–${LIMITS.heightM[1]} m.`);
  if (!inRange(g.orientationDeg, LIMITS.orientationDeg)) errors.geometry.push('Orientation must be 0–359°.');
  if (!inRange(g.roofSlopeDeg, LIMITS.roofSlopeDeg)) errors.geometry.push('Roof slope must be 0–45°.');
  const geo = deriveGeometry(g);
  if (!geo.isSquare) warnings.push('The solver models a square footprint of the same floor area; your length × width is used for blueprint/3D only.');
  if (g.shape && g.shape !== 'rectangular') warnings.push('Non-rectangular shapes are stored but simulated as a rectangular box.');

  // Envelope
  for (const key of ['wall', 'roof', 'floor', 'insulation']) {
    const p = d.envelope?.[key];
    if (!p || !MATERIAL_MODES.includes(p.mode)) { errors.envelope.push(`Choose how to define the ${key}.`); continue; }
    if (p.mode === 'select' && !p.materialId) errors.envelope.push(`Select a ${key} material.`);
    if (p.mode === 'custom') {
      const c = p.custom || {};
      if (!c.name) errors.envelope.push(`Name your custom ${key} material.`);
      if (!(num(c.k) > 0) || !(num(c.rho) > 0) || !(num(c.cp) > 0))
        errors.envelope.push(`Custom ${key} material needs k, density and specific heat > 0.`);
    }
    if (p.mode !== 'recommend') {
      const range = key === 'insulation' ? LIMITS.insulationThicknessM : LIMITS.wallThicknessM;
      if (!inRange(p.thicknessM, range)) errors.envelope.push(`${key} thickness must be ${range[0]}–${range[1]} m.`);
    }
  }

  // Openings
  const o = d.openings || {};
  const H = num(g.heightM);
  if (!inRange(o.leakageAreaCm2, LIMITS.leakageCm2)) errors.openings.push('Leakage area must be 0–2000 cm².');
  (o.windows || []).forEach((w, i) => {
    const n = `Window ${i + 1}`;
    if (!WALLS.includes(w.wall)) errors.openings.push(`${n}: choose a wall (N/E/S/W).`);
    if (!inRange(w.widthM, LIMITS.windowDimM) || !inRange(w.heightM, LIMITS.windowDimM))
      errors.openings.push(`${n}: width and height must be 0.2–4 m.`);
    const sill = w.sillM ?? 0; // older drafts have no sill; treat as floor level
    if (!inRange(sill, LIMITS.sillM)) errors.openings.push(`${n}: sill height must be 0–3 m.`);
    else if (num(sill) + num(w.heightM) > H + 1e-9)
      errors.openings.push(`${n}: sill + height (${(num(sill) + num(w.heightM)).toFixed(2)} m) is taller than the wall (${H} m).`);
    if (!GLAZING_IDS.includes(w.glazingId)) errors.openings.push(`${n}: choose a glazing type.`);
  });
  (o.doors || []).forEach((dr, i) => {
    const n = `Door ${i + 1}`;
    if (!WALLS.includes(dr.wall)) errors.openings.push(`${n}: choose a wall (N/E/S/W).`);
    if (!inRange(dr.widthM, LIMITS.doorDimM) || !inRange(dr.heightM, LIMITS.doorDimM))
      errors.openings.push(`${n}: width and height must be 0.6–3 m.`);
    else if (num(dr.heightM) > H + 1e-9) errors.openings.push(`${n}: height ${num(dr.heightM)} m is taller than the wall (${H} m).`);
  });
  const od = deriveOpenings(d);
  for (const wl of WALLS) {
    const w = od.walls[wl];
    if (w.openingsM2 > w.grossM2 * 0.8) errors.openings.push(`Openings on the ${wl} wall take over 80% of its area.`);
    if (w.outOfBounds.length) errors.openings.push(`An opening on the ${wl} wall sticks out past the wall ends — reduce its size or position.`);
    if (w.overlaps.length) errors.openings.push(`Openings overlap on the ${wl} wall — move one or use Auto-space.`);
  }

  // Operations
  const ops = deriveOperations(d);
  const op = d.operations || {};
  if (!inRange(ops.sensibleHeatW, LIMITS.sensibleHeatW)) errors.operations.push('Internal heat gain must be 0–20,000 W.');
  if (!inRange(op.heatingW ?? 0, LIMITS.heatingW)) errors.operations.push('Heater output must be 0–20,000 W.');
  if (!inRange(op.internalLoadsW ?? 0, LIMITS.internalLoadsW)) errors.operations.push('Lighting and equipment load must be 0–10,000 W.');
  if (!inRange(op.coGenerationLpm ?? 0, LIMITS.coGenerationLpm)) errors.operations.push('CO generation must be 0–10 L/min.');
  const ng = op.nightGate;
  if (ng?.enabled) {
    const hourOk = (h) => Number.isFinite(Number(h)) && Number(h) >= 0 && Number(h) < 24;
    if (!hourOk(ng.closeHour) || !hourOk(ng.openHour)) errors.operations.push('Night Gate close and open hours must be 0–23.');
    if (!inRange(ng.closedLeakageCm2, LIMITS.gateLeakageCm2)) errors.operations.push('Night Gate closed leakage must be 1–2000 cm² (a sealed shelter still needs some air).');
    else if (num(ng.closedLeakageCm2) >= num(o.leakageAreaCm2))
      warnings.push('Night Gate closed leakage is not lower than the normal leakage area, so the gate will have no effect.');
    if (ng.closeHour === ng.openHour) warnings.push('Night Gate close and open hours are equal, so it never closes.');
  }
  if (op.heatingType === 'none' && ops.heatingW > 0) warnings.push('Heating power is set but heating type is "No heating".');
  if (op.heatingType === 'stove' && !(num(op.coGenerationLpm) > 0))
    warnings.push('A stove burns fuel and releases CO. CO generation is 0, so the safety check assumes none. Enter an estimate if the stove is not flued outdoors.');

  for (const k of Object.keys(errors)) errors[k] = [...new Set(errors[k])];

  const ready = Object.values(errors).every((a) => a.length === 0);
  return { ready, errors, warnings };
}
