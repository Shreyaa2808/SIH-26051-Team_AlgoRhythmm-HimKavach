const runtimeConfig = window.himkavachConfig || {};

export const API = (
  runtimeConfig.apiUrl ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000'
).replace(/\/$/, '');

export const IS_DESKTOP = Boolean(runtimeConfig.desktop);
export const IS_OFFLINE = Boolean(runtimeConfig.offline);

export function apiUrl(path) {
  return `${API}${path.startsWith('/') ? path : `/${path}`}`;
}
