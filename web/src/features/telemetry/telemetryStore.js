// Tiny in-memory store for measured-data logs imported in the Field Monitoring
// page, keyed by design (project) id, so the Export Center and the validation
// status can see them. Deliberately NOT a project-state system: it holds only
// user-imported / demo measurement series and is lost on reload.
import { useSyncExternalStore } from 'react';

const byDesign = new Map();
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function setTelemetry(designId, payload) {
  if (!designId) return;
  byDesign.set(designId, { ...payload, designId, setAt: new Date().toISOString() });
  emit();
}

export function clearTelemetry(designId) {
  if (byDesign.delete(designId)) emit();
}

export function getTelemetry(designId) {
  return designId ? byDesign.get(designId) ?? null : null;
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTelemetry(designId) {
  return useSyncExternalStore(
    subscribe,
    () => getTelemetry(designId),
    () => null,
  );
}
