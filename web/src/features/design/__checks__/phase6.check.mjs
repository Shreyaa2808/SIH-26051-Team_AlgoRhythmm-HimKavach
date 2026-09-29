// Run:  node web/src/features/design/__checks__/phase6.check.mjs
import assert from 'node:assert/strict';
import { createDefaultDesignInput, validateDesignInput, hydrateDesignInput } from '../designInput.js';
import { toSimulatePayload } from '../toSimulatePayload.js';
import { isFeatureOn, setFeature, FLAGS_KEY } from '../featureFlags.js';
import {
  createProjectStore, restoreRun, toProjectShape, siteFromLocation, locationFromSite,
  PROJECTS_KEY, LEGACY_DRAFT_KEY, DEFAULT_NAME, MAX_NAME_LENGTH,
} from '../projectStore.js';

class MemStorage {
  constructor() { this.m = new Map(); this.failWrites = false; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw new Error('QuotaExceededError'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const LEH = { site_id: 'leh', label: 'Leh', lat: 34.1526, lon: 77.5771, elevation_m: 3500, climate_cached: true };

/* ------------------------------ feature flags ------------------------------ */
{
  const none = { search: '', storage: new MemStorage(), env: {} };
  assert.equal(isFeatureOn('newDesignWizard', none), true, 'default is on');
  assert.equal(isFeatureOn('newDesignWizard', { ...none, env: { VITE_NEW_DESIGN_WIZARD: '0' } }), false, 'env off');
  const st = new MemStorage();
  st.setItem(FLAGS_KEY, JSON.stringify({ newDesignWizard: false }));
  assert.equal(isFeatureOn('newDesignWizard', { search: '', storage: st, env: {} }), false, 'storage off');
  assert.equal(isFeatureOn('newDesignWizard', { search: '?newDesignWizard=1', storage: st, env: { VITE_NEW_DESIGN_WIZARD: '0' } }), true, 'URL beats storage and env');
  assert.equal(isFeatureOn('newDesignWizard', { search: '?newDesignWizard=off', storage: new MemStorage(), env: {} }), false, 'URL off');
  assert.equal(isFeatureOn('newDesignWizard', { search: '?newDesignWizard=banana', storage: new MemStorage(), env: {} }), true, 'junk falls through');
  const st2 = new MemStorage();
  assert.equal(setFeature('newDesignWizard', false, st2), true);
  assert.equal(isFeatureOn('newDesignWizard', { search: '', storage: st2, env: {} }), false);
  setFeature('newDesignWizard', null, st2);
  assert.equal(isFeatureOn('newDesignWizard', { search: '', storage: st2, env: {} }), true, 'cleared override');
  assert.equal(isFeatureOn('newDesignWizard', { search: '', storage: null, env: {} }), true, 'no storage is fine');
}

/* ----------------------- journey: new -> inputs -> simulate ----------------------- */
const storage = new MemStorage();
let store = createProjectStore(storage);
assert.equal(store.list('new-build').length, 0);

let rec = store.ensureCurrent({ mode: 'new-build' });
assert.equal(rec.name, DEFAULT_NAME);
assert.equal(rec.step, 0);
assert.equal(validateDesignInput(rec.design).ready, false, 'no site yet -> not ready');

// pick a site (what boot() does from the app's location)
let design = { ...rec.design, site: { ...rec.design.site, ...siteFromLocation(LEH, 'coldest_winter_night') } };
design = { ...design, shelter: { ...design.shelter, occupants: 6 } };
assert.equal(validateDesignInput(design).ready, true);
const { payload, notes } = toSimulatePayload(design);
assert.equal(payload.site_id, 'leh');
assert.equal(payload.sensible_heat_w, 6 * 70);

// "run baseline" and save
const fakeResult = { site_id: 'leh', hours: [0, 1], indoor_temp_c: [1, 2], outdoor_temp_c: [-5, -6], min_indoor_temp_c: 1, max_indoor_temp_c: 2, safety_passed: true };
let out = store.update(rec.id, { design, step: 6, baseline: { data: fakeResult, key: JSON.stringify(design), notes } });
assert.equal(out.persisted, true);

/* ------------------------- save -> refresh -> reopen ------------------------- */
store = createProjectStore(storage); // "refresh": brand-new store object over the same storage
const reopened = store.ensureCurrent({ mode: 'new-build' });
assert.equal(reopened.id, rec.id);
assert.equal(reopened.step, 6);
assert.equal(hydrateDesignInput(reopened.design).shelter.occupants, 6);
assert.equal(hydrateDesignInput(reopened.design).site.siteId, 'leh');
const run = restoreRun(reopened);
assert.ok(run, 'baseline restored while inputs unchanged');
assert.deepEqual(run.data, fakeResult);
assert.equal(run.key, JSON.stringify(hydrateDesignInput(reopened.design)), 'key matches what the wizard compares against');
assert.deepEqual(locationFromSite(reopened.design.site), { ...LEH });

// changing an input makes the saved baseline stale
const edited = { ...reopened.design, shelter: { ...reopened.design.shelter, occupants: 7 } };
store.update(rec.id, { design: edited });
assert.equal(restoreRun(store.get(rec.id)), null, 'stale baseline is not restored');

// flattened shared-schema view
const shape = toProjectShape(store.get(rec.id));
assert.equal(shape.projectName, DEFAULT_NAME);
assert.equal(shape.site.siteId, 'leh');
assert.equal(shape.baseline, null);
assert.ok('geometry' in shape.shelter);

/* ----------------------------- project management ----------------------------- */
const two = store.create({ mode: 'new-build' });
assert.equal(two.name, `${DEFAULT_NAME} 2`, 'names stay unique');
assert.equal(store.currentId(), two.id);
store.rename(two.id, '   Nubra   Personnel   Shelter  ');
assert.equal(store.get(two.id).name, 'Nubra Personnel Shelter');
store.rename(two.id, '   '); // blank keeps the old name
assert.equal(store.get(two.id).name, 'Nubra Personnel Shelter');
store.rename(two.id, 'x'.repeat(200));
assert.equal(store.get(two.id).name.length, MAX_NAME_LENGTH);
store.rename(two.id, 'Nubra Personnel Shelter');
const copy = store.duplicate(two.id);
assert.equal(copy.name, 'Nubra Personnel Shelter (copy)');
assert.notEqual(copy.id, two.id);
assert.equal(store.list('new-build').length, 3);
assert.equal(store.list('retrofit').length, 0, 'modes are listed separately');
assert.equal(store.remove(copy.id), true);
assert.equal(store.currentId() !== copy.id, true, 'current moves off a deleted project');
assert.equal(store.remove('nope'), false);
assert.equal(store.update('nope', { name: 'x' }), null);
assert.equal(store.list('new-build').length, 2);

/* --------------------------------- error states --------------------------------- */
{
  // corrupt saved data: kept aside, store starts clean
  const bad = new MemStorage();
  bad.setItem(PROJECTS_KEY, '{not json');
  const s = createProjectStore(bad);
  assert.equal(s.list().length, 0);
  assert.equal(bad.getItem(`${PROJECTS_KEY}.corrupt`), '{not json');
  assert.ok(s.ensureCurrent({ mode: 'new-build' }).id);

  // junk records are dropped, good ones kept
  const mixed = new MemStorage();
  mixed.setItem(PROJECTS_KEY, JSON.stringify({ currentId: 'a', projects: { a: { name: 'ok', design: createDefaultDesignInput() }, b: 'junk', c: { name: 'no design' } } }));
  assert.deepEqual(createProjectStore(mixed).list().map((p) => p.id), ['a']);

  // storage full: keeps working from memory and says so
  const full = new MemStorage();
  const fs = createProjectStore(full);
  const r = fs.ensureCurrent({ mode: 'new-build' });
  full.failWrites = true;
  const res = fs.update(r.id, { name: 'Still here' });
  assert.equal(res.persisted, false);
  assert.equal(fs.isPersistent(), false);
  assert.equal(fs.get(r.id).name, 'Still here', 'newest data served from memory');
  full.failWrites = false;
  assert.equal(fs.update(r.id, { name: 'Recovered' }).persisted, true);
  assert.equal(fs.isPersistent(), true);
  assert.equal(JSON.parse(full.getItem(PROJECTS_KEY)).projects[r.id].name, 'Recovered');

  // no storage at all (private mode)
  const ns = createProjectStore(null);
  const nr = ns.ensureCurrent({ mode: 'new-build' });
  assert.equal(ns.isPersistent(), false);
  assert.equal(ns.update(nr.id, { step: 3 }).record.step, 3);
  assert.equal(ns.get(nr.id).step, 3);
}

/* ------------------------- Phase 1-5 draft migration ------------------------- */
{
  const s = new MemStorage();
  const old = createDefaultDesignInput({ site: siteFromLocation(LEH) });
  old.shelter.occupants = 9;
  s.setItem(LEGACY_DRAFT_KEY, JSON.stringify({ design: old, step: 3 }));
  const migrated = createProjectStore(s).ensureCurrent({ mode: 'new-build' });
  assert.equal(migrated.design.shelter.occupants, 9);
  assert.equal(migrated.step, 3);
  assert.equal(s.getItem(LEGACY_DRAFT_KEY), null, 'legacy draft removed after migration');
  const again = createProjectStore(s);
  again.remove(migrated.id);
  assert.notEqual(again.ensureCurrent({ mode: 'new-build' }).design.shelter.occupants, 9, 'does not resurrect');
}

console.log('Phase 6 checks passed');
