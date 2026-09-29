import { useState, useEffect } from 'react';
import { API } from '../../../api';

let cache = null; // materials rarely change during a session
let inflight = null;

/** GET /materials once per session. Returns { materials, byId, loading, error }. */
export default function useMaterials() {
  const [state, setState] = useState(() => (cache ? { materials: cache, error: null } : { materials: null, error: null }));

  useEffect(() => {
    if (cache) return undefined;
    let cancelled = false;
    inflight ??= fetch(`${API}/materials`).then((res) => {
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    });
    inflight
      .then((list) => {
        cache = list;
        if (!cancelled) setState({ materials: list, error: null });
      })
      .catch((err) => {
        inflight = null;
        if (!cancelled) setState({ materials: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = state.materials ? Object.fromEntries(state.materials.map((m) => [m.id, m])) : null;
  return { materials: state.materials, byId, loading: !state.materials && !state.error, error: state.error };
}
