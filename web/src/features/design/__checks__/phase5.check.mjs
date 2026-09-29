// Run:  node web/src/features/design/__checks__/phase5.check.mjs
import assert from 'node:assert/strict';
import { createDefaultDesignInput, validateDesignInput, isExisting } from '../designInput.js';

const base = (o = {}) => createDefaultDesignInput({ site: { siteId: 'leh' }, ...o });

// new-build: "recommend" is a valid choice
assert.equal(validateDesignInput(base()).ready, true);
assert.equal(isExisting(base()), false);

// retrofit: an existing shelter must say what it is made of
const r = base({ mode: 'retrofit' });
assert.equal(isExisting(r), true);
const v = validateDesignInput(r);
assert.equal(v.ready, false);
assert.equal(v.errors.envelope.length, 4);
assert.ok(v.errors.envelope[0].startsWith('Existing wall'));

// ...and is ready once every component is selected
const sel = (id, t) => ({ mode: 'select', materialId: id, thicknessM: t });
const ok = base({ mode: 'retrofit', envelope: {
  wall: sel('local_stone_masonry', 0.4), roof: sel('local_stone_masonry', 0.3),
  floor: sel('local_stone_masonry', 0.3), insulation: sel('expanded_polystyrene_eps', 0),
} });
assert.equal(validateDesignInput(ok).ready, true);

console.log('Phase 5 checks passed');
