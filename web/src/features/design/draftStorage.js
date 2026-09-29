// Temporary draft persistence for the wizard. Phase 6 replaces this with
// Person 1's project store; the wizard only touches these three functions.
const KEY = 'himkavach.designDraft.v1';

export function loadDraft() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable or full — the wizard still works, just unsaved */
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
