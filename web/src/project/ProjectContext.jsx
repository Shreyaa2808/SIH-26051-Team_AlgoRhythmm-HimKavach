/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { API } from '../api';
import { createEmptyProject } from './projectSchema';

const Ctx = createContext(null);

export function useProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject must be used inside <ProjectProvider>');
  return v;
}

async function request(path, options = {}) {
  const res = await fetch(`${API}/design-projects${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    throw new Error(typeof d === 'string' ? d : `Request failed: ${res.status}`);
  }
  return body;
}

export const projectApi = {
  list: () => request(''),
  get: (id) => request(`/${id}`),
  save: (p) => request(`/${p.projectId}`, { method: 'PUT', body: JSON.stringify(p) }),
  rename: (id, name) => request(`/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  remove: (id) => request(`/${id}`, { method: 'DELETE' }),
};

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(null);
  // 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState('idle');
  const dirty = useRef(false);
  const latest = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    latest.current = project;
  }, [project]);

  const persist = useCallback(async () => {
    const p = latest.current;
    if (!p || !dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await projectApi.save(p);
      setSaveState(dirty.current ? 'saving' : 'saved');
    } catch (e) {
      console.error(e);
      dirty.current = true;
      setSaveState('error');
    }
  }, []);

  // Autosave 800 ms after the last change.
  useEffect(() => {
    if (!project || !dirty.current) return undefined;
    setSaveState('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 800);
    return () => clearTimeout(timer.current);
  }, [project, persist]);

  /** Merge a patch into the project. Optional history label adds a timeline entry. */
  const update = useCallback((patch, historyLabel) => {
    dirty.current = true;
    setProject((prev) => {
      if (!prev) return prev;
      const now = new Date().toISOString();
      const history = historyLabel
        ? [...(prev.meta.history ?? []), { ts: now, event: historyLabel }].slice(-100)
        : prev.meta.history;
      return { ...prev, ...patch, meta: { ...prev.meta, updatedAt: now, history } };
    });
  }, []);

  const setStep = useCallback((step) => {
    dirty.current = true;
    setProject((prev) => (prev ? { ...prev, meta: { ...prev.meta, step } } : prev));
  }, []);

  const rename = useCallback((name) => {
    const clean = name.trim();
    if (!clean) return;
    update({ projectName: clean }, `Renamed to "${clean}"`);
  }, [update]);

  const create = useCallback(async (name, mode) => {
    const p = createEmptyProject(name.trim(), mode);
    p.meta.step = 'site';
    await projectApi.save(p); // fail loudly if backend is down
    dirty.current = false;
    setSaveState('saved');
    setProject(p);
    return p;
  }, []);

  const open = useCallback(async (id) => {
    const p = await projectApi.get(id);
    dirty.current = false;
    setSaveState('saved');
    setProject(p);
    return p;
  }, []);

  const close = useCallback(async () => {
    clearTimeout(timer.current);
    await persist();
    dirty.current = false;
    setProject(null);
    setSaveState('idle');
  }, [persist]);

  return (
    <Ctx.Provider
      value={{
        project,
        saveState,
        step: (project?.meta?.step === 'compare' ? 'optimize' : project?.meta?.step) ?? 'project',
        update,
        setStep,
        rename,
        create,
        open,
        close,
        saveNow: persist,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}