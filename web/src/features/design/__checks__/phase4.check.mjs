// Run:  node web/src/features/design/__checks__/phase4.check.mjs
import assert from 'node:assert/strict';
import {
  createDefaultDesignInput, createWindow, createDoor, layoutWall, deriveOpenings, wallLengthM,
  deriveOperations, validateDesignInput, glazingCostInr,
} from '../designInput.js';
import { toSimulatePayload } from '../toSimulatePayload.js';

const base = (o = {}) => createDefaultDesignInput({ site: { siteId: 'leh' }, ...o });

// wall lengths: N/S span length, E/W span width
assert.equal(wallLengthM({ lengthM: 5, widthM: 3 }, 'N'), 5);
assert.equal(wallLengthM({ lengthM: 5, widthM: 3 }, 'E'), 3);

// auto layout: equal gaps, no overlap
let lay = layoutWall(4, [{ id: 'a', widthM: 1 }, { id: 'b', widthM: 1 }]);
assert.deepEqual(lay.placed.map((p) => +p.x0.toFixed(6)), [0.666667, 2.333333]);
assert.equal(lay.overlaps.length, 0);
assert.equal(lay.outOfBounds.length, 0);

// explicit positions: overlap + out of bounds are reported
lay = layoutWall(4, [{ id: 'a', widthM: 1, offsetM: 0.5 }, { id: 'b', widthM: 1, offsetM: 1 }, { id: 'c', widthM: 1, offsetM: 3.5 }]);
assert.deepEqual(lay.overlaps, [['a', 'b']]);
assert.deepEqual(lay.outOfBounds, ['c']);

// per-wall summary
let d = base({ openings: { windows: [createWindow({ wall: 'S', widthM: 1, heightM: 1 })], doors: [createDoor({ wall: 'S', widthM: 1, heightM: 2 })] } });
let od = deriveOpenings(d);
assert.equal(od.walls.S.windowM2, 1);
assert.equal(od.walls.S.doorM2, 2);
assert.equal(od.walls.S.grossM2, 4 * 2.4);
assert.ok(Math.abs(od.windowToWallRatio - 1 / (16 * 2.4)) < 1e-12);
assert.equal(validateDesignInput(d).ready, true);

// validation
const bad = (openings) => validateDesignInput(base({ openings })).errors.openings;
assert.ok(bad({ windows: [createWindow({ sillM: 1.9, heightM: 1 })] }).some((e) => /taller than the wall/.test(e)));
assert.ok(bad({ doors: [createDoor({ heightM: 2.9 })] }).some((e) => /taller than the wall/.test(e)));
assert.ok(bad({ windows: [createWindow({ offsetM: 0 }), createWindow({ offsetM: 0.5 })] }).some((e) => /overlap/.test(e)));
assert.ok(bad({ windows: [createWindow({ offsetM: 3.5 })] }).some((e) => /sticks out/.test(e)));
const many = bad({ windows: [createWindow({ wall: 'X' }), createWindow({ wall: 'X' })] });
assert.equal(new Set(many).size, many.length); // no duplicate messages (React keys)
// older saves without a sill still validate
assert.equal(validateDesignInput(base({ openings: { windows: [{ id: 'w', wall: 'S', widthM: 1, heightM: 1, glazingId: 'double_glazed_low_e_window' }] } })).ready, true);

// glazing cost
const mats = { double_glazed_low_e_window: { cost_per_m2_inr: 6500 }, triple_glazed_krypton_window: { cost_per_m2_inr: 14000 } };
assert.equal(glazingCostInr([createWindow({ widthM: 1, heightM: 2 })], mats), 13000);
assert.equal(glazingCostInr([createWindow()], {}), null);
assert.equal(glazingCostInr([], mats), 0);

// operations: computed vs manual heat gain
let o = base({ shelter: { occupants: 4 }, operations: { activity: 'sedentary', internalLoadsW: 50, heatingW: 500 } });
assert.equal(deriveOperations(o).sensibleHeatW, 4 * 100 + 50 + 500);
assert.equal(deriveOperations(o).overridden, false);
o = base({ operations: { sensibleHeatOverrideW: 900 } });
assert.equal(deriveOperations(o).sensibleHeatW, 900);
assert.equal(toSimulatePayload(o).payload.sensible_heat_w, 900);
assert.ok(toSimulatePayload(o).notes.some((n) => n.field === 'operations.heat'));

// night gate: backend rejects hour 24 and closed leakage <= 0
const gate = (ng) => validateDesignInput(base({ operations: { nightGate: { enabled: true, ...ng } } }));
assert.equal(gate({ closeHour: 24 }).ready, false);
assert.equal(gate({ closedLeakageCm2: 0 }).ready, false);
assert.equal(gate({ closedLeakageCm2: 300 }).ready, true);
assert.ok(gate({ closedLeakageCm2: 300 }).warnings.some((w) => /no effect/.test(w)));
assert.ok(toSimulatePayload(base({ operations: { nightGate: { enabled: true } } })).payload.night_gate_enabled);

// stove without a CO figure warns; sealed/no heater does not
assert.ok(validateDesignInput(base({ operations: { heatingType: 'stove', heatingW: 1000 } })).warnings.some((w) => /releases CO/.test(w)));
assert.ok(!validateDesignInput(base()).warnings.some((w) => /CO/.test(w)));
assert.equal(validateDesignInput(base({ operations: { coGenerationLpm: -1 } })).ready, false);

// ventilation note
assert.ok(toSimulatePayload(base({ operations: { ventilationType: 'mechanical' } })).notes.some((n) => n.field === 'operations.ventilation'));

console.log('Phase 4 checks passed');
