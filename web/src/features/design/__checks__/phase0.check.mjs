// Run:  node web/src/features/design/__checks__/phase0.check.mjs
import assert from 'node:assert/strict';
import {
  createDefaultDesignInput, deriveGeometry, deriveOperations, validateDesignInput,
  hydrateDesignInput, newId, wallBearings, southFacingWall, orientationLongSideSouth, occupiedHours, uValueOf, buildAssembly, layerMetrics, uValueBand,
} from '../designInput.js';
import { toSimulatePayload } from '../toSimulatePayload.js';

let d = createDefaultDesignInput({ site: { siteId: 'leh', label: 'Leh' } });

// derived
const g = deriveGeometry(d.geometry);
assert.equal(g.floorAreaM2, 16);
assert.equal(g.volumeM3, 38.4);
assert.ok(g.isSquare);
assert.equal(deriveOperations(d).sensibleHeatW, 4 * 70);

// ready by default once site is set
assert.equal(validateDesignInput(d).ready, true);
assert.equal(validateDesignInput(createDefaultDesignInput()).ready, false);

// default payload reproduces the current ConfigForm defaults (except heat: 280 W vs 200 W)
let { payload, notes } = toSimulatePayload(d);
assert.equal(payload.wall_material_id, 'local_stone_masonry');
assert.equal(payload.insulation_material_id, 'expanded_polystyrene_eps');
assert.equal(payload.floor_area_m2, 16);
assert.equal(payload.window_wall, null);
assert.equal(payload.window_area_m2, 0);
assert.ok(notes.some((n) => n.field === 'shelter.schedule'));

// non-square + windows on two walls + door + custom wall
d = createDefaultDesignInput({
  site: { siteId: 'leh' },
  geometry: { lengthM: 5, widthM: 3, orientationDeg: 180 },
  openings: {
    windows: [
      { id: newId('w'), wall: 'S', widthM: 1.2, heightM: 1, glazingId: 'triple_glazed_krypton_window' },
      { id: newId('w'), wall: 'S', widthM: 1, heightM: 1, glazingId: 'double_glazed_low_e_window' },
      { id: newId('w'), wall: 'E', widthM: 0.5, heightM: 0.5, glazingId: 'double_glazed_low_e_window' },
    ],
    doors: [{ id: newId('d'), wall: 'N', widthM: 0.9, heightM: 2, type: 'timber' }],
  },
  envelope: { wall: { mode: 'custom', thicknessM: 0.25, custom: { name: 'X', k: 0.5, rho: 1000, cp: 900 } } },
});
({ payload, notes } = toSimulatePayload(d));
assert.equal(payload.floor_area_m2, 15);
assert.equal(payload.window_wall, 'S');
assert.equal(payload.window_area_m2, 2.2);
assert.equal(payload.window_material_id, 'triple_glazed_krypton_window');
assert.equal(payload.wall_material_id, 'local_stone_masonry'); // custom fallback
assert.equal(payload.orientation_deg, 180);
for (const f of ['geometry', 'openings.windows', 'openings.doors', 'envelope.wall'])
  assert.ok(notes.some((n) => n.field === f), `missing note ${f}`);
assert.equal(validateDesignInput(d).ready, true);

// validation catches bad input
const bad = createDefaultDesignInput({ site: { siteId: 'leh' }, geometry: { lengthM: 0.5 } });
assert.equal(validateDesignInput(bad).ready, false);
const tooBig = createDefaultDesignInput({ site: { siteId: 'leh' }, openings: { windows: [{ wall: 'N', widthM: 4, heightM: 2.4, glazingId: 'double_glazed_low_e_window' }] } });
assert.equal(validateDesignInput(tooBig).ready, false);

// hydrate fills missing fields from an old save
const old = hydrateDesignInput({ site: { siteId: 'leh' }, shelter: { occupants: 6 } });
assert.equal(old.shelter.occupants, 6);
assert.equal(old.geometry.heightM, 2.4);

// Phase 2 helpers
assert.deepEqual(wallBearings(90), { N: 90, E: 180, S: 270, W: 0 });
assert.deepEqual(southFacingWall(0), { wall: 'S', offsetDeg: 0 });
assert.equal(southFacingWall(90).wall, 'E');
assert.equal(orientationLongSideSouth({ lengthM: 6, widthM: 3 }), 0);
assert.equal(orientationLongSideSouth({ lengthM: 3, widthM: 6 }), 90);
assert.equal(occupiedHours(18, 8), 14);
assert.equal(occupiedHours(0, 24), 24);

// Phase 3: envelope maths (0.3242393475911309 = value the real backend returns for the default build-up)
const mats = {
  local_stone_masonry: { id: 'local_stone_masonry', name: 'Stone', k: 2.2, rho: 2500, cost_per_m3_inr: 3000, carbon_kgco2e_per_kg: 0.08 },
  expanded_polystyrene_eps: { id: 'expanded_polystyrene_eps', name: 'EPS', k: 0.036, rho: 20, cost_per_m3_inr: 4500, carbon_kgco2e_per_kg: 3.29 },
};
const asm = buildAssembly(createDefaultDesignInput().envelope, 'wall', mats);
assert.ok(Math.abs(asm.uValue - 0.3242393475911309) < 1e-12);
assert.equal(uValueBand(asm.uValue).id, 'good');
assert.equal(layerMetrics(mats.expanded_polystyrene_eps, 0.1).costPerM2, 450);
assert.equal(layerMetrics({ k: 1, rho: 1 }, 0.1).costPerM2, null); // missing data is null, not 0
assert.equal(uValueOf([{ k: 0, thicknessM: 0.1 }]), null);
const noIns = createDefaultDesignInput({ site: { siteId: 'leh' }, envelope: { insulation: { mode: 'select', materialId: 'mineral_wool', thicknessM: 0 } } });
assert.equal(validateDesignInput(noIns).ready, true);
assert.equal(toSimulatePayload(noIns).payload.insulation_thickness_m, 0.001);

console.log('Phase 0-3 checks passed');
