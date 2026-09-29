/**
 * Tiny feature-flag helper.
 *
 * Precedence (first hit wins):
 *   1. URL query      ?newDesignWizard=0   (or 1)   — handy for demos / A-B checks
 *   2. localStorage   himkavach.flags = {"newDesignWizard": false}
 *   3. build env      VITE_NEW_DESIGN_WIZARD=0      (in web/.env)
 *   4. DEFAULTS below
 *
 * Every lookup is wrapped so a blocked storage / missing window never throws.
 */
export const FLAGS_KEY = 'himkavach.flags';

export const DEFAULTS = {
  newDesignWizard: true,
};

const ENV_NAMES = {
  newDesignWizard: 'VITE_NEW_DESIGN_WIZARD',
};

const OFF = new Set(['0', 'false', 'off', 'no']);
const ON = new Set(['1', 'true', 'on', 'yes']);

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (ON.has(s)) return true;
  if (OFF.has(s)) return false;
  return null;
}

function readStorage(storage) {
  try {
    const raw = storage?.getItem(FLAGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function defaultEnv() {
  try {
    return import.meta.env ?? {};
  } catch {
    return {};
  }
}

/**
 * @param {string} name flag name (key of DEFAULTS)
 * @param {{search?: string, storage?: Storage, env?: object}} [ctx] injectable for tests
 */
export function isFeatureOn(name, ctx = {}) {
  const search = ctx.search ?? (typeof window !== 'undefined' ? window.location?.search : '') ?? '';
  const storage = ctx.storage ?? (typeof window !== 'undefined' ? safeStorage() : null);
  const env = ctx.env ?? defaultEnv();

  try {
    const fromUrl = parseBool(new URLSearchParams(search).get(name));
    if (fromUrl !== null) return fromUrl;
  } catch { /* ignore */ }

  const fromStore = parseBool(readStorage(storage)[name]);
  if (fromStore !== null) return fromStore;

  const fromEnv = parseBool(env[ENV_NAMES[name]]);
  if (fromEnv !== null) return fromEnv;

  return Boolean(DEFAULTS[name]);
}

/** Persist an override (pass null to clear it). Returns true when stored. */
export function setFeature(name, value, storage = typeof window !== 'undefined' ? safeStorage() : null) {
  try {
    const cur = readStorage(storage);
    if (value === null || value === undefined) delete cur[name];
    else cur[name] = Boolean(value);
    storage.setItem(FLAGS_KEY, JSON.stringify(cur));
    return true;
  } catch {
    return false;
  }
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
