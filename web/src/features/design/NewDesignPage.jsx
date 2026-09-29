import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DesignWizard from './DesignWizard.jsx';
import ProjectBar from './ProjectBar.jsx';
import WizardErrorBoundary from './WizardErrorBoundary.jsx';
import { mergeDesignInput, createDefaultDesignInput, hydrateDesignInput } from './designInput.js';
import {
  getDefaultStore, restoreRun, siteFromLocation, locationFromSite,
} from './projectStore.js';

const SAVE_DELAY_MS = 350;

/** Pick the record to show and reconcile it with the app's current location. */
function boot(store, mode, location, designDay) {
  let rec = store.ensureCurrent({ mode });
  const appSite = siteFromLocation(location, designDay);
  const differs = appSite && rec.design?.site?.siteId !== appSite.siteId;
  if (differs) {
    // The person picked a different place on the map: the app is the authority at open time.
    const design = mergeDesignInput(rec.design, { site: appSite });
    rec = store.update(rec.id, { design, step: Math.min(rec.step, 1), baseline: null })?.record ?? rec;
  }
  return rec;
}

/**
 * Store-backed home of the new-shelter wizard (Person 2, Phase 6).
 *
 * Props
 *  location / designDay / onLocationChange / onDesignDayChange   app-level site state
 *  currentResult       the app's current /simulate result (avoids clobbering it on remount)
 *  onBaselineResult    (simulateResponse | null) => void
 *  mode                'new-build' (default) | 'retrofit' (Person 3 reuses the page)
 *  store               optional project store (Person 1's, later). Defaults to localStorage.
 */
export default function NewDesignPage({
  location, designDay, onLocationChange, onDesignDayChange, onBaselineResult, currentResult = null,
  mode = 'new-build', store: storeProp,
}) {
  const store = useMemo(() => storeProp ?? getDefaultStore(), [storeProp]);
  const [rec, setRec] = useState(() => boot(store, mode, location, designDay));
  const [design, setDesign] = useState(() => hydrateDesignInput(rec.design)); // fills fields older saves lack
  const [name, setName] = useState(rec.name);
  const [rev, setRev] = useState(0); // bumps to remount the wizard when the project changes
  const [projects, setProjects] = useState(() => store.list(mode));
  const [status, setStatus] = useState('saved');
  const [savedAt, setSavedAt] = useState(rec.updatedAt);
  const [persistent, setPersistent] = useState(() => store.isPersistent());
  const [initialRun, setInitialRun] = useState(() => restoreRun(rec));

  const idRef = useRef(rec.id);
  const pending = useRef({});
  const timer = useRef(null);
  const cbs = useRef({});
  useEffect(() => { cbs.current = { onLocationChange, onDesignDayChange, onBaselineResult }; });

  const refreshList = useCallback(() => setProjects(store.list(mode)), [store, mode]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    const res = store.update(idRef.current, patch);
    if (res) {
      setStatus(res.persisted ? 'saved' : 'error');
      setSavedAt(res.record.updatedAt);
      setPersistent(store.isPersistent());
      refreshList();
    }
  }, [store, refreshList]);

  const schedule = useCallback((patch) => {
    pending.current = { ...pending.current, ...patch };
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [flush]);

  // never lose the last edit: flush on unmount, tab close and tab hide
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      flush();
    };
  }, [flush]);

  // On first mount: push the project's site/day-of-year/result up to the app.
  useEffect(() => {
    const site = rec.design?.site;
    if (site?.siteId && site.siteId !== location?.site_id) cbs.current.onLocationChange?.(locationFromSite(site));
    if (site?.designDay && site.designDay !== designDay) cbs.current.onDesignDayChange?.(site.designDay);
    // don't wipe results the app is already showing (e.g. after switching tabs and back)
    if (initialRun && !currentResult) cbs.current.onBaselineResult?.(initialRun.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Show another record: remount the wizard on it and sync the app around it. */
  const activate = (next) => {
    idRef.current = next.id;
    store.setCurrent(next.id);
    const run = restoreRun(next);
    setRec(next);
    setDesign(hydrateDesignInput(next.design));
    setName(next.name);
    setInitialRun(run);
    setStatus('saved');
    setSavedAt(next.updatedAt);
    setRev((r) => r + 1);
    refreshList();
    const site = next.design?.site;
    if (site?.siteId && site.siteId !== location?.site_id) cbs.current.onLocationChange?.(locationFromSite(site));
    if (site?.designDay) cbs.current.onDesignDayChange?.(site.designDay);
    cbs.current.onBaselineResult?.(run ? run.data : null);
  };

  const handleOpen = (id) => {
    flush();
    const next = store.get(id);
    if (next) activate(next);
  };

  const handleNew = () => {
    flush();
    // a new design in the same place is the common case, so keep the site
    const fresh = createDefaultDesignInput({ mode, site: design.site });
    const next = store.create({ design: fresh, mode, step: fresh.site.siteId ? 1 : 0 });
    activate(next);
  };

  const handleDuplicate = (id) => {
    flush();
    const next = store.duplicate(id);
    if (next) activate(next);
  };

  const handleDelete = (id, label) => {
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    flush();
    store.remove(id);
    if (id === idRef.current) activate(store.ensureCurrent({ mode }));
    else refreshList();
  };

  const handleRename = (next) => {
    setName(next);
    pending.current = { ...pending.current, name: next };
    flush();
  };

  return (
    <div className="dw-page">
      <ProjectBar
        name={name}
        status={status}
        savedAt={savedAt}
        persistent={persistent}
        projects={projects}
        activeId={rec.id}
        onRename={handleRename}
        onNew={handleNew}
        onOpen={handleOpen}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
      <WizardErrorBoundary resetKey={`${rec.id}:${rev}`} onReset={handleNew}>
        <DesignWizard
          key={`${rec.id}:${rev}`}
          location={location}
          designDay={designDay}
          onLocationChange={onLocationChange}
          onDesignDayChange={onDesignDayChange}
          onBaselineResult={onBaselineResult}
          value={design}
          onChange={(d) => { setDesign(d); schedule({ design: d }); }}
          initialStep={rec.step}
          onStepChange={(i) => schedule({ step: i })}
          initialRun={initialRun}
          onRunChange={(run) => schedule({ baseline: run })}
        />
      </WizardErrorBoundary>
    </div>
  );
}
