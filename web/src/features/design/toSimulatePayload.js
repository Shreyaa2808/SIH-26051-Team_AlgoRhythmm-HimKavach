/**
 * designInput -> POST /simulate request.
 *
 * This file is the ONLY place that knows the /simulate field names, so if the
 * backend contract changes only this adapter changes.
 *
 * /simulate today (api/routes/simulate.py) cannot represent everything the
 * wizard collects. Instead of silently dropping data, every gap is returned in
 * `notes` so the UI can show "not simulated" honestly:
 *   - footprint is a square of the same floor area (no separate L x W)
 *   - one window on one wall (largest total window area wins)
 *   - no doors
 *   - one wall+insulation build-up for all surfaces (roof/floor not separate)
 *   - custom materials are not accepted
 *   - occupancy schedule is not applied (internal gain is continuous)
 *   - window frame / operable flag, ventilation type and heater type are not
 *     modelled (only glazing area+material, leakage area, heat W and CO rate are)
 */
import { deriveGeometry, deriveOperations, resolveEnvelope, WALLS } from './designInput.js';

const note = (level, field, message) => ({ level, field, message });
const round = (v, dp = 3) => Math.round(Number(v) * 10 ** dp) / 10 ** dp;

export function toSimulatePayload(input) {
  const notes = [];
  const geo = deriveGeometry(input.geometry);
  const ops = deriveOperations(input);
  const env = resolveEnvelope(input.envelope);

  /* ---- wall + insulation (the only build-up the solver takes) ---- */
  let wallId = env.wall.materialId;
  let wallT = env.wall.thicknessM;
  if (env.wall.source === 'custom') {
    wallId = 'local_stone_masonry';
    wallT = env.wall.thicknessM || 0.3;
    notes.push(note('warn', 'envelope.wall', 'Custom wall materials are not supported by the solver yet; local stone masonry was simulated instead.'));
  }
  let insId = env.insulation.materialId;
  let insT = env.insulation.thicknessM;
  if (env.insulation.source === 'custom') {
    insId = 'expanded_polystyrene_eps';
    insT = env.insulation.thicknessM || 0.1;
    notes.push(note('warn', 'envelope.insulation', 'Custom insulation is not supported by the solver yet; EPS was simulated instead.'));
  }
  if (insT < 0.001) {
    insT = 0.001;
    notes.push(note('warn', 'envelope.insulation', 'The solver needs an insulation layer, so "no insulation" is modelled as a 1 mm layer (negligible effect).'));
  }
  for (const key of ['wall', 'insulation']) {
    if (env[key].source === 'recommended-default')
      notes.push(note('info', `envelope.${key}`, `${key} uses HimKavach's baseline default until optimization picks one.`));
  }
  for (const key of ['roof', 'floor']) {
    const sameAsWall = env[key].materialId === env.wall.materialId && env[key].thicknessM === env.wall.thicknessM;
    if (!sameAsWall)
      notes.push(note('info', `envelope.${key}`, `The solver uses the wall build-up for the ${key}; your ${key} choice is kept for blueprint/3D only.`));
  }

  /* ---- geometry ---- */
  if (!geo.isSquare)
    notes.push(note('info', 'geometry', `Solver footprint is a square of ${round(geo.floorAreaM2, 1)} m²; ${input.geometry.lengthM} × ${input.geometry.widthM} m is kept for blueprint/3D.`));

  /* ---- windows: one wall, summed area ---- */
  const windows = input.openings?.windows || [];
  let windowWall = null;
  let windowArea = 0;
  let windowMat = 'double_glazed_low_e_window';
  if (windows.length) {
    const areaByWall = Object.fromEntries(WALLS.map((w) => [w, 0]));
    for (const w of windows) if (areaByWall[w.wall] !== undefined) areaByWall[w.wall] += w.widthM * w.heightM;
    windowWall = WALLS.reduce((best, w) => (areaByWall[w] > areaByWall[best] ? w : best), WALLS[0]);
    if (areaByWall[windowWall] > 0) {
      const onWall = windows.filter((w) => w.wall === windowWall);
      windowArea = Math.min(areaByWall[windowWall], geo.wallAreaByLabelM2[windowWall] * 0.8);
      windowMat = onWall.slice().sort((a, b) => b.widthM * b.heightM - a.widthM * a.heightM)[0].glazingId;
      const dropped = windows.length - onWall.length;
      if (dropped > 0)
        notes.push(note('warn', 'openings.windows', `The solver supports windows on one wall only; ${dropped} window(s) on other walls are kept for blueprint/3D but not simulated.`));
      if (new Set(onWall.map((w) => w.glazingId)).size > 1)
        notes.push(note('info', 'openings.windows', `Mixed glazing on the ${windowWall} wall; the largest window's glazing was simulated.`));
    } else {
      windowWall = null;
    }
  }
  if (windows.length)
    notes.push(note('info', 'openings.frames', 'Window frames, sill heights and positions, and the operable flag are kept for blueprint/3D; the solver models glazing area and type only.'));
  if ((input.openings?.doors || []).length)
    notes.push(note('info', 'openings.doors', 'Doors are not modelled by the solver yet; they are kept for blueprint/3D and the air-leakage estimate is yours to set.'));

  /* ---- operations ---- */
  if (input.shelter?.occupancyPattern && input.shelter.occupancyPattern !== 'continuous')
    notes.push(note('warn', 'shelter.schedule', 'The solver applies internal heat gain for all 24 hours; your occupancy schedule is not applied yet, so night-time results may be optimistic.'));
  if (ops.heatingW > 0)
    notes.push(note('info', 'operations.heating', 'Heater output is added to internal heat gain continuously.'));
  if (ops.overridden)
    notes.push(note('info', 'operations.heat', `Internal heat gain is your manual value (${round(ops.sensibleHeatW, 0)} W), not occupants × activity + loads + heater (${round(ops.computedW, 0)} W).`));
  const vent = input.operations?.ventilationType;
  if (vent && vent !== 'infiltration')
    notes.push(note('info', 'operations.ventilation', `The solver has no separate ${vent === 'mechanical' ? 'mechanical' : 'natural'} ventilation; air exchange comes from the leakage area (and wind/stack effect). Raise the leakage area to represent vents.`));
  if (input.operations?.heatingType === 'stove' && !(Number(input.operations?.coGenerationLpm) > 0))
    notes.push(note('warn', 'operations.co', 'A stove is selected but CO generation is 0, so the CO safety check assumes no combustion gases.'));

  const ng = input.operations?.nightGate || {};
  if (ng.enabled) {
    notes.push(note('info', 'operations.nightGate', 'The Night Gate is modelled as lower air leakage during its closed hours; it adds no insulation value.'));
    if (!(Number(ng.closedLeakageCm2) < Number(input.openings?.leakageAreaCm2)))
      notes.push(note('warn', 'operations.nightGate', 'Night Gate closed leakage is not lower than normal leakage, so it changes nothing.'));
  }

  const payload = {
    site_id: input.site.siteId,
    design_day: input.site.designDay,
    wall_material_id: wallId,
    insulation_material_id: insId,
    wall_thickness_m: round(wallT),
    insulation_thickness_m: round(insT),
    floor_area_m2: round(geo.floorAreaM2),
    ceiling_height_m: round(input.geometry.heightM),
    leakage_area_cm2: Number(input.openings?.leakageAreaCm2 ?? 200),
    sensible_heat_w: round(ops.sensibleHeatW, 1),
    co_generation_rate_lpm: Number(input.operations?.coGenerationLpm || 0),
    night_gate_enabled: Boolean(ng.enabled),
    night_gate_close_hour: Number(ng.closeHour ?? 19) % 24,
    night_gate_open_hour: Number(ng.openHour ?? 7) % 24,
    night_gate_closed_leakage_area_cm2: Math.max(1, Number(ng.closedLeakageCm2 ?? 60)),
    orientation_deg: Number(input.geometry.orientationDeg) % 360,
    roof_slope_deg: Math.min(60, Math.max(0, Number(input.geometry.roofSlopeDeg) || 0)),
    window_wall: windowArea > 0 ? windowWall : null,
    window_area_m2: windowArea > 0 ? round(windowArea) : 0,
    window_material_id: windowMat,
  };

  return { payload, notes };
}
