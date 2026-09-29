/**
 * Temporary baseline runner: designInput -> POST /simulate.
 * Person 4 owns the real simulationService; when it exists, swap the fetch
 * below for it. Keep using toSimulatePayload() so the wizard stays decoupled.
 */
import { API } from '../../api';
import { toSimulatePayload } from './toSimulatePayload.js';

export async function runBaseline(designInput) {
  const { payload, notes } = toSimulatePayload(designInput);
  const res = await fetch(`${API}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const d = body?.detail;
    throw new Error(typeof d === 'string' ? d : d ? JSON.stringify(d) : `Request failed: ${res.status}`);
  }
  return { data: await res.json(), notes, payload };
}
