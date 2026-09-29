/**
 * Design project store (Person 2 side).
 *
 * Person 1's shared project system does not exist in the repo yet, so this is
 * the wizard's own store behind a deliberately small interface. When Person 1
 * ships theirs, implement the same methods (see docs/design-project-store.md)
 * and pass it to <NewDesignPage store={...} /> — nothing else changes.
 *
 * Record shape (what is persisted):
 *   { id, name, mode, createdAt, updatedAt, step, design, baseline }
 *   baseline = { data, key, notes } | null
 *     data  /simulate response
 *     key   JSON.stringify(design) at the time it ran (used to detect stale results)
 *     notes what the solver did / didn't use
 *
 * `toProjectShape(record)` flattens a record into the shared project schema
 * (projectId, projectName, mode, site, shelter, envelope, openings, operations,
 * baseline) so Person 1 can adopt it directly.
 */
import { createDefaultDesignInput, hydrateDesignInput } from './designInput.js';

export const PROJECTS_KEY = 'himkavach.designProjects.v1';
export const LEGACY_DRAFT_KEY = 'himkavach.designDraft.v1';
export const MAX_NAME_LENGTH = 60;
export const DEFAULT_NAME = 'Untitled shelter design';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function browserStorage() {
  try {
    const s = window.localStorage;
    const probe = '__himkavach_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);

const newProjectId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function normalizeRecord(id, r) {
  if (!isObj(r) || !isObj(r.design)) return null;
  const now = Date.now();
  const baseline = isObj(r.baseline) && isObj(r.baseline.data) && typeof r.baseline.key === 'string'
    ? { data: r.baseline.data, key: r.baseline.key, notes: Array.isArray(r.baseline.notes) ? r.baseline.notes : [] }
    : null;
  return {
    id,
    name: cleanName(r.name) || DEFAULT_NAME,
    mode: r.mode === 'retrofit' ? 'retrofit' : 'new-build',
    createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now,
    updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : now,
    step: Number.isInteger(r.step) && r.step >= 0 ? r.step : 0,
    design: r.design,
    baseline,
  };
}

/**
 * @param {Storage|null} [storage] injectable for tests; defaults to localStorage
 *        (null → in-memory only, `isPersistent()` reports false)
 */
export function createProjectStore(storage = browserStorage()) {
  let memory = { currentId: null, projects: {} }; // authoritative when storage is missing/failing
  let persistent = Boolean(storage);
  let lastError = null;

  function load() {
    if (!storage || !persistent) return memory; // last write failed: memory holds the newest data
    let raw = null;
    try {
      raw = storage.getItem(PROJECTS_KEY);
      if (!raw) return { currentId: null, projects: {} };
      const parsed = JSON.parse(raw);
      const projects = {};
      for (const [id, r] of Object.entries(isObj(parsed?.projects) ? parsed.projects : {})) {
        const rec = normalizeRecord(id, r);
        if (rec) projects[id] = rec;
      }
      return { currentId: typeof parsed?.currentId === 'string' ? parsed.currentId : null, projects };
    } catch (err) {
      // Unreadable JSON: keep a copy so nothing is silently lost, then start clean.
      lastError = err;
      try { if (raw) storage.setItem(`${PROJECTS_KEY}.corrupt`, raw); } catch { /* ignore */ }
      return { currentId: null, projects: {} };
    }
  }

  /** Returns true when the data reached storage. */
  function persist(db) {
    memory = db;
    if (!storage) return false;
    try {
      storage.setItem(PROJECTS_KEY, JSON.stringify(db));
      persistent = true;
      lastError = null;
      return true;
    } catch (err) {
      persistent = false; // quota / private mode: keep working from memory
      lastError = err;
      return false;
    }
  }

  const sorted = (db) => Object.values(db.projects).sort((a, b) => b.updatedAt - a.updatedAt);

  function uniqueName(base, db, mode) {
    const taken = new Set(sorted(db).filter((p) => p.mode === mode).map((p) => p.name));
    const start = cleanName(base) || DEFAULT_NAME;
    if (!taken.has(start)) return start;
    let n = 2;
    while (taken.has(`${start.slice(0, MAX_NAME_LENGTH - 5)} ${n}`)) n += 1;
    return `${start.slice(0, MAX_NAME_LENGTH - 5)} ${n}`;
  }

  function takeLegacyDraft() {
    if (!storage) return null;
    try {
      const raw = storage.getItem(LEGACY_DRAFT_KEY);
      if (!raw) return null;
      storage.removeItem(LEGACY_DRAFT_KEY);
      const draft = JSON.parse(raw);
      return isObj(draft?.design) ? draft : null;
    } catch {
      return null;
    }
  }

  const api = {
    isPersistent: () => persistent,
    lastError: () => lastError,

    list(mode) {
      return sorted(load())
        .filter((p) => !mode || p.mode === mode)
        .map((p) => ({
          id: p.id,
          name: p.name,
          mode: p.mode,
          siteLabel: p.design?.site?.label || '',
          updatedAt: p.updatedAt,
          hasBaseline: Boolean(p.baseline),
        }));
    },

    get(id) {
      const rec = load().projects[id];
      return rec ? clone(rec) : null;
    },

    currentId: () => load().currentId,

    setCurrent(id) {
      const db = load();
      if (!db.projects[id]) return false;
      persist({ ...db, currentId: id });
      return true;
    },

    create({ name, design, mode = 'new-build', step = 0 } = {}) {
      const db = load();
      const now = Date.now();
      const id = newProjectId();
      const base = design ? hydrateDesignInput(design) : createDefaultDesignInput({ mode });
      const rec = {
        id,
        name: uniqueName(name || DEFAULT_NAME, db, mode),
        mode,
        createdAt: now,
        updatedAt: now,
        step,
        design: { ...base, mode },
        baseline: null,
      };
      persist({ currentId: id, projects: { ...db.projects, [id]: rec } });
      return clone(rec);
    },

    /** patch: { name?, design?, step?, baseline? }. Returns { record, persisted } or null if the id is gone. */
    update(id, patch = {}) {
      const db = load();
      const cur = db.projects[id];
      if (!cur) return null;
      const next = { ...cur, updatedAt: Date.now() };
      if ('name' in patch) next.name = cleanName(patch.name) || cur.name;
      if ('design' in patch && isObj(patch.design)) next.design = patch.design;
      if ('step' in patch && Number.isInteger(patch.step)) next.step = Math.max(0, patch.step);
      if ('baseline' in patch) next.baseline = normalizeRecord(id, { ...next, baseline: patch.baseline })?.baseline ?? null;
      const persisted = persist({ ...db, projects: { ...db.projects, [id]: next } });
      return { record: clone(next), persisted };
    },

    rename: (id, name) => api.update(id, { name }),

    duplicate(id) {
      const db = load();
      const src = db.projects[id];
      if (!src) return null;
      const now = Date.now();
      const newId = newProjectId();
      const rec = {
        ...clone(src),
        id: newId,
        name: uniqueName(`${src.name} (copy)`, db, src.mode),
        createdAt: now,
        updatedAt: now,
      };
      persist({ currentId: newId, projects: { ...db.projects, [newId]: rec } });
      return clone(rec);
    },

    remove(id) {
      const db = load();
      if (!db.projects[id]) return false;
      const projects = { ...db.projects };
      delete projects[id];
      let currentId = db.currentId;
      if (currentId === id) currentId = sorted({ projects })[0]?.id ?? null;
      persist({ currentId, projects });
      return true;
    },

    /**
     * The project to show when the page opens: the current one, else the most
     * recent, else a migrated Phase 1–5 draft, else a brand-new project.
     */
    ensureCurrent({ mode = 'new-build' } = {}) {
      const db = load();
      const cur = db.projects[db.currentId];
      if (cur && cur.mode === mode) return clone(cur);
      const recent = sorted(db).find((p) => p.mode === mode);
      if (recent) {
        persist({ ...db, currentId: recent.id });
        return clone(recent);
      }
      const legacy = takeLegacyDraft();
      if (legacy) {
        const rec = api.create({ name: DEFAULT_NAME, design: legacy.design, mode, step: Number.isInteger(legacy.step) ? legacy.step : 0 });
        return rec;
      }
      return api.create({ mode });
    },
  };

  return api;
}

/* ------------------------------ shared helpers ----------------------------- */

let defaultStore = null;
/** Lazily created so importing this file never touches `window`. */
export function getDefaultStore() {
  if (!defaultStore) defaultStore = createProjectStore();
  return defaultStore;
}

/**
 * Baseline result to restore for a record, or null when the inputs changed
 * after it ran (a result only counts while the design still matches).
 * Returns the key for the *hydrated* design so the wizard's staleness check
 * (JSON.stringify(design)) keeps matching.
 */
export function restoreRun(record) {
  if (!record?.baseline) return null;
  if (record.baseline.key !== JSON.stringify(record.design)) return null;
  const hydrated = hydrateDesignInput(record.design);
  return { data: record.baseline.data, key: JSON.stringify(hydrated), notes: record.baseline.notes || [] };
}

/** Build a designInput.site from an App-level resolved location (LocationPicker shape). */
export function siteFromLocation(location, designDay) {
  if (!location?.site_id) return null;
  return {
    siteId: location.site_id,
    label: location.label,
    latitude: location.lat,
    longitude: location.lon,
    elevationM: location.elevation_m,
    climateCached: location.climate_cached ?? null,
    ...(designDay ? { designDay } : {}),
  };
}

/** The inverse: an App-level location object from a saved designInput.site. */
export function locationFromSite(site) {
  if (!site?.siteId) return null;
  return {
    site_id: site.siteId,
    label: site.label,
    lat: site.latitude,
    lon: site.longitude,
    elevation_m: site.elevationM,
    climate_cached: site.climateCached ?? null,
  };
}

/** Flatten a record into the shared project schema Person 1 planned. */
export function toProjectShape(record) {
  const d = hydrateDesignInput(record.design);
  return {
    projectId: record.id,
    projectName: record.name,
    mode: record.mode,
    site: d.site,
    shelter: { ...d.shelter, geometry: d.geometry },
    envelope: d.envelope,
    openings: d.openings,
    operations: d.operations,
    baseline: restoreRun(record)?.data ?? null,
    optimizedDesigns: [],
    selectedDesign: null,
    validation: {},
    outputs: {},
    updatedAt: record.updatedAt,
  };
}

