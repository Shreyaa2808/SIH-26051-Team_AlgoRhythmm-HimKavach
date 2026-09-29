// Pure geometry / schedule computation for the architectural drawings.
// Input: normalizeProject() result (+ material index). Output: plain data.
//
// Conventions (stated on every drawing):
//  * All lengths in metres. Plan has North up.
//  * length_m = footprint along the N/S walls, width_m = along the E/W walls
//    (same meaning as engine/shelter_model.py).
//  * Opening offset_x_m is measured from the LEFT edge of the wall as seen
//    from OUTSIDE the building; offset_z_m from the floor (sill height).
//  * Wall / roof / floor layers are listed outside -> inside, i.e. structural
//    layer first, insulation second — the same order the thermal solver uses
//    (engine/shelter_model.py::_assembly).
//  * Nothing that is not in the model is drawn: thicknesses that were never
//    set or resolved stay `null` and are annotated "not resolved".
import { isNum } from '../../common/format';

const CARD = ['N', 'E', 'S', 'W'];

function pickThickness(explicit, key, resolved) {
  if (isNum(explicit)) return { value: explicit, source: 'model' };
  if (resolved && isNum(resolved[key])) return { value: resolved[key], source: 'solver-resolved' };
  return { value: null, source: null };
}

export function assessGeometry(project) {
  const issues = [];
  if (!project) return { ok: false, issues: ['No design loaded.'] };
  if (!isNum(project.lengthM) || project.lengthM <= 0) issues.push('Footprint length is missing.');
  if (!isNum(project.widthM) || project.widthM <= 0) issues.push('Footprint width is missing.');
  if (!isNum(project.ceilingHeightM) || project.ceilingHeightM <= 0) issues.push('Ceiling height is missing.');
  for (const c of CARD) {
    if (!project.walls.find((w) => w?.cardinal === c)) issues.push(`Wall ${c} is not defined.`);
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Downslope-facing roof geometry in the building frame.
 * Building frame: x = west->east (0..L), y = south->north (0..W), both
 * BEFORE the building's rotation (orientation_deg rotates the whole building).
 */
function roofFrame(L, W, slopeDeg, roofBearingDeg, buildingOrientationDeg) {
  const beta = (slopeDeg * Math.PI) / 180;
  const rel = (((roofBearingDeg - buildingOrientationDeg) % 360) + 360) % 360;
  const relRad = (rel * Math.PI) / 180;
  const d = { x: Math.sin(relRad), y: Math.cos(relRad) }; // downslope unit vector
  const corners = [
    { x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W },
  ];
  const s = corners.map((c) => c.x * d.x + c.y * d.y);
  const sMax = Math.max(...s);
  const sMin = Math.min(...s);
  const tanB = Math.tan(beta);
  // Height above the lowest roof corner (metres) at any footprint point.
  const heightAt = (x, y) => tanB * (sMax - (x * d.x + y * d.y));
  return {
    slopeDeg,
    relBearingDeg: rel,
    downslope: d,
    totalRiseM: tanB * (sMax - sMin),
    heightAt,
  };
}

export function buildDrawingModel(project, materialsById = {}) {
  const check = assessGeometry(project);
  if (!check.ok) return { ok: false, issues: check.issues };

  const L = project.lengthM;
  const W = project.widthM;
  const H = project.ceilingHeightM;
  const orientationDeg = project.orientationDeg ?? 0;
  const resolved = project.sim?.resolved ?? {};

  const matName = (id) => (id ? materialsById[id]?.name ?? id : null);

  let wi = 0; let di = 0; let vi = 0;
  const openings = [];
  const walls = {};
  for (const c of CARD) {
    const w = project.walls.find((x) => x?.cardinal === c);
    const struct = pickThickness(w.structural_thickness_m, `${c}_structural`, resolved);
    const hasIns = Boolean(w.insulation_material_id);
    const ins = hasIns
      ? pickThickness(w.insulation_thickness_m, `${c}_insulation`, resolved)
      : { value: 0, source: 'model' };
    const total = isNum(struct.value) && isNum(ins.value) ? struct.value + ins.value : null;
    const list = [];
    const srcOpenings = Array.isArray(w.openings) ? w.openings : [];
    for (let srcIndex = 0; srcIndex < srcOpenings.length; srcIndex += 1) {
      const o = srcOpenings[srcIndex];
      if (!isNum(o?.width_m) || !isNum(o?.height_m)) continue;
      const type = o.type === 'door' || o.type === 'vent' ? o.type : 'window';
      let id;
      if (type === 'window') { wi += 1; id = `W${wi}`; }
      else if (type === 'door') { di += 1; id = `D${di}`; }
      else { vi += 1; id = `V${vi}`; }
      const op = {
        id, type, wall: c,
        widthM: o.width_m, heightM: o.height_m,
        offsetXM: isNum(o.offset_x_m) ? o.offset_x_m : 0,
        sillM: isNum(o.offset_z_m) ? o.offset_z_m : 0,
        glazingId: o.glazing_material_id ?? null,
        // index in the model's wall.openings array == the solver's surface
        // name suffix ("window_<wall>_<index>")
        srcIndex,
      };
      list.push(op);
      openings.push(op);
    }
    walls[c] = {
      cardinal: c,
      lengthM: c === 'N' || c === 'S' ? L : W,
      structMaterialId: w.structural_material_id ?? null,
      insMaterialId: w.insulation_material_id ?? null,
      structT: struct.value, structSource: struct.source,
      insT: hasIns ? ins.value : 0, insSource: hasIns ? ins.source : null,
      hasInsulation: hasIns,
      totalT: total,
      openings: list,
    };
  }

  const roofSpec = project.roof;
  let roof = null;
  if (roofSpec) {
    const st = pickThickness(roofSpec.structural_thickness_m, 'roof_structural', resolved);
    const hasIns = Boolean(roofSpec.insulation_material_id);
    const it = hasIns
      ? pickThickness(roofSpec.insulation_thickness_m, 'roof_insulation', resolved)
      : { value: 0, source: 'model' };
    const slope = isNum(roofSpec.slope_deg) ? roofSpec.slope_deg : 0;
    const bearing = isNum(roofSpec.orientation_deg) ? roofSpec.orientation_deg : 180;
    roof = {
      structMaterialId: roofSpec.structural_material_id ?? null,
      insMaterialId: roofSpec.insulation_material_id ?? null,
      structT: st.value, structSource: st.source,
      insT: hasIns ? it.value : 0, insSource: hasIns ? it.source : null,
      hasInsulation: hasIns,
      slopeDeg: slope,
      bearingDeg: bearing,
      frame: roofFrame(L, W, slope, bearing, orientationDeg),
    };
  }

  const floorSpec = project.floor;
  let floor = null;
  if (floorSpec) {
    const hasIns = Boolean(floorSpec.insulation_material_id);
    const it = hasIns
      ? pickThickness(floorSpec.insulation_thickness_m, 'floor_insulation', resolved)
      : { value: 0, source: 'model' };
    floor = {
      structMaterialId: floorSpec.structural_material_id ?? null,
      insMaterialId: floorSpec.insulation_material_id ?? null,
      structT: isNum(floorSpec.structural_thickness_m) ? floorSpec.structural_thickness_m : null,
      insT: hasIns ? it.value : 0, insSource: hasIns ? it.source : null,
      hasInsulation: hasIns,
      groundTempC: isNum(floorSpec.ground_temp_c) ? floorSpec.ground_temp_c : null,
    };
  }

  return {
    ok: true, issues: [],
    L, W, H, orientationDeg,
    walls, roof, floor, openings,
    matName,
  };
}

/**
 * Outline of the roof as seen in an elevation from outside a given wall.
 * Returns points [u, y] in metres above wall top (y>=0), u = horizontal
 * coordinate left->right for a viewer standing outside that wall.
 */
export function roofSilhouette(model, cardinal) {
  if (!model?.roof) return null;
  const { L, W } = model;
  const f = model.roof.frame;
  const pts = [
    { x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W },
  ];
  // viewer outside wall `cardinal`, u increases to the viewer's right
  const toU = {
    N: (p) => L - p.x, // looking south: left = east
    S: (p) => p.x, // looking north: left = west
    E: (p) => p.y, // looking west: left = south
    W: (p) => W - p.y, // looking east: left = north
  }[cardinal];
  const raw = [];
  for (const p of pts) {
    const u = toU(p);
    const h = f.heightAt(p.x, p.y);
    raw.push([u, 0], [u, h]);
  }
  return convexHull(raw);
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (uniq.length <= 2) return uniq;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-9) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i -= 1) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-9) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Roof height (metres above wall top) along the N–S line through mid-length. */
export function roofProfileNS(model) {
  if (!model?.roof) return null;
  const { L, W } = model;
  const f = model.roof.frame;
  // u = y (south -> north), viewer looking west (S left, N right)
  return { south: f.heightAt(L / 2, 0), north: f.heightAt(L / 2, W) };
}

// ---------------------------------------------------------------------------
// Material schedule
// ---------------------------------------------------------------------------

function props(mat) {
  if (!mat) return null;
  return {
    k: isNum(mat.k) ? mat.k : null,
    rho: isNum(mat.rho) ? mat.rho : null,
    cp: isNum(mat.cp) ? mat.cp : null,
    category: mat.category ?? null,
    availability: mat.availability ?? null,
  };
}

function uFor(project, surfaceName) {
  const s = project?.sim?.surfaces?.find((x) => x?.name === surfaceName);
  return s && isNum(s.u_value_wm2k) ? s.u_value_wm2k : null;
}

/**
 * Rows for the schedule: {component, layer, materialId, materialName,
 * thicknessM, thicknessNote, props, uValue}. Values come from the design and
 * the materials database only; anything else stays null.
 */
export function buildMaterialSchedule(project, drawing, materialsById = {}) {
  if (!project || !drawing?.ok) return [];
  const rows = [];
  const mat = (id) => (id ? materialsById[id] ?? null : null);
  const add = (component, layer, id, thicknessM, source, uValue) => {
    const m = mat(id);
    rows.push({
      component, layer,
      materialId: id ?? null,
      materialName: id ? (m?.name ?? id) : null,
      inDatabase: Boolean(m),
      thicknessM: isNum(thicknessM) ? thicknessM : null,
      thicknessNote: source === 'solver-resolved' ? 'resolved by auto-thickness solver' : null,
      props: props(m),
      uValue: uValue ?? null,
    });
  };

  for (const c of CARD) {
    const w = drawing.walls[c];
    const u = uFor(project, `wall_${c}`);
    add(`Wall ${c}`, 'Structural (outside)', w.structMaterialId, w.structT, w.structSource, u);
    if (w.hasInsulation) add(`Wall ${c}`, 'Insulation (inside)', w.insMaterialId, w.insT, w.insSource, null);
  }
  if (drawing.roof) {
    const r = drawing.roof;
    const u = uFor(project, 'roof');
    add('Roof', 'Structural (outside)', r.structMaterialId, r.structT, r.structSource, u);
    if (r.hasInsulation) add('Roof', 'Insulation (inside)', r.insMaterialId, r.insT, r.insSource, null);
  }
  if (drawing.floor) {
    const f = drawing.floor;
    const u = uFor(project, 'floor');
    add('Floor', 'Structural (ground side)', f.structMaterialId, f.structT, 'model', u);
    if (f.hasInsulation) add('Floor', 'Insulation (inside)', f.insMaterialId, f.insT, f.insSource, null);
  }
  for (const o of drawing.openings) {
    if (o.type === 'window') {
      const u = uFor(project, `window_${o.wall}_${o.srcIndex}`);
      add(`Window ${o.id} (wall ${o.wall})`, 'Glazing', o.glazingId, null, null, u);
    } else if (o.type === 'door') {
      add(`Door ${o.id} (wall ${o.wall})`, 'Leaf', null, null, null, null);
    } else {
      add(`Vent ${o.id} (wall ${o.wall})`, 'Vent', null, null, null, null);
    }
  }
  return rows;
}
