/**
 * Person 1: the shared project schema + journey steps.
 *
 * EVERY teammate reads/writes only their own slice of this object:
 *   Person 2 -> site, shelter, envelope, openings, operations
 *   Person 3 -> baseline
 *   Person 4 -> optimizedDesigns, optimizerRun, selectedDesign
 *   Person 5 -> reads selectedDesign
 *   Person 6 -> validation, outputs
 */

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createEmptyProject(name, mode = 'new') {
  const now = new Date().toISOString();
  return {
    projectId: newId(),
    projectName: name,
    mode, // 'new' | 'retrofit'

    scenario: { designDay: 'coldest_winter_night' },

    site: null, // location object from LocationPicker (site_id, label, elevation_m ...)
    shelter: {},
    envelope: {},
    openings: {},
    operations: {},

    baseline: null, // simulation result (new) or retrofit analysis (retrofit)
    optimizedDesigns: [], // list of candidate designs
    optimizerRun: null, // full raw optimizer response (used by OptimizeModule)
    selectedDesign: null, // design chosen for the 3D twin

    validation: {},
    outputs: {},

    meta: {
      createdAt: now,
      updatedAt: now,
      step: 'project',
      history: [{ ts: now, event: `Project created (${mode === 'retrofit' ? 'Retrofit' : 'New build'})` }],
    },
  };
}

// The guided journey, in order.
export const JOURNEY = [
  { id: 'project', label: 'Project', icon: '📁' },
  { id: 'site', label: 'Site', icon: '📍' },
  { id: 'shelter', label: 'Shelter', icon: '🏠' },
  { id: 'design', label: 'Design', icon: '🧱' },
  { id: 'baseline', label: 'Baseline', icon: '📈' },
  { id: 'optimize', label: 'Optimize', icon: '🔥' },
  { id: 'compare', label: 'Compare', icon: '⚖️' },
  { id: 'twin', label: 'Digital Twin', icon: '🧊' },
  { id: 'validate', label: 'Validate', icon: '✅' },
  { id: 'output', label: 'Output', icon: '📐' },
];

// Extra utilities that are not journey steps.
export const TOOLS = [
  { id: 'climate', label: 'Climate Engine', icon: '🌡️' },
  { id: 'sandbox', label: 'Bulk / Sandbox', icon: '🏘️' },
];

/**
 * Returns { stepId: 'done' | 'available' | 'locked' } for every step and tool.
 * A step unlocks only when the data it needs really exists.
 */
export function getStepStatus(project) {
  const has = {
    site: Boolean(project?.site?.site_id),
    baseline: Boolean(project?.baseline),
    designs: (project?.optimizedDesigns?.length ?? 0) > 0,
    selected: Boolean(project?.selectedDesign),
    blueprint: Boolean(project?.outputs?.blueprintProjectId),
  };
  const s = (unlocked, done) => (!unlocked ? 'locked' : done ? 'done' : 'available');

  return {
    project: 'done',
    site: s(true, has.site),
    shelter: s(has.site, has.baseline),
    design: s(has.site, has.baseline),
    baseline: s(has.baseline, has.baseline),
    optimize: s(has.baseline, has.designs),
    compare: s(has.designs, has.selected),
    twin: s(has.site, has.selected),
    validate: s(has.site, Object.keys(project?.validation ?? {}).length > 0),
    output: s(has.site, has.blueprint),
    climate: s(has.site, false),
    sandbox: 'available',
  };
}

export function progressPercent(status) {
  const done = JOURNEY.filter((j) => status[j.id] === 'done').length;
  return Math.round((done / JOURNEY.length) * 100);
}