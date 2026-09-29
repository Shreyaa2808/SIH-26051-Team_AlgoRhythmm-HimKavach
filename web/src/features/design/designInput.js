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
};

/* --------------------------------- factory -------------------------------- */

let _idCounter = 0;
export const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${(_idCounter++).toString(36)}`;

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

export function deriveOperations(input) {
  const occupants = num(input?.shelter?.occupants);
  const act = ACTIVITIES.find((a) => a.id === input?.operations?.activity) || ACTIVITIES[0];
  const metabolicW = occupants * act.wPerPerson;
  const internalW = num(input?.operations?.internalLoadsW);
  const heatingW = num(input?.operations?.heatingW);
  return {
    metabolicW,
    internalLoadsW: internalW,
    heatingW,
    sensibleHeatW: metabolicW + internalW + heatingW,
  };
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
  if (!inRange(o.leakageAreaCm2, LIMITS.leakageCm2)) errors.openings.push('Leakage area must be 0–2000 cm².');
  for (const w of o.windows || []) {
    if (!WALLS.includes(w.wall)) errors.openings.push('Every window needs a wall (N/E/S/W).');
    if (!inRange(w.widthM, LIMITS.windowDimM) || !inRange(w.heightM, LIMITS.windowDimM))
      errors.openings.push('Window width/height must be 0.2–4 m.');
    if (!GLAZING_IDS.includes(w.glazingId)) errors.openings.push('Every window needs a glazing type.');
  }
  for (const dr of o.doors || []) {
    if (!WALLS.includes(dr.wall)) errors.openings.push('Every door needs a wall (N/E/S/W).');
    if (!inRange(dr.widthM, LIMITS.doorDimM) || !inRange(dr.heightM, LIMITS.doorDimM))
      errors.openings.push('Door width/height must be 0.6–3 m.');
  }
  // Openings must physically fit their wall
  const byWall = { N: 0, E: 0, S: 0, W: 0 };
  for (const it of [...(o.windows || []), ...(o.doors || [])])
    if (byWall[it.wall] !== undefined) byWall[it.wall] += num(it.widthM) * num(it.heightM);
  for (const wl of WALLS)
    if (byWall[wl] > geo.wallAreaByLabelM2[wl] * 0.8)
      errors.openings.push(`Openings on the ${wl} wall take over 80% of its area.`);

  // Operations
  const ops = deriveOperations(d);
  if (!inRange(ops.sensibleHeatW, LIMITS.sensibleHeatW)) errors.operations.push('Internal heat gain is out of range.');
  const ng = d.operations?.nightGate;
  if (ng?.enabled && (ng.closeHour < 0 || ng.closeHour > 24 || ng.openHour < 0 || ng.openHour > 24))
    errors.operations.push('Night Gate hours must be between 0 and 24.');
  if (d.operations?.heatingType === 'none' && ops.heatingW > 0) warnings.push('Heating power is set but heating type is "No heating".');

  const ready = Object.values(errors).every((a) => a.length === 0);
  return { ready, errors, warnings };
}
