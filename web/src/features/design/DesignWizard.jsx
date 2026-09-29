import { useState, useEffect, useMemo } from 'react';
import './DesignWizard.css';
import {
  createDefaultDesignInput, hydrateDesignInput, mergeDesignInput, validateDesignInput,
} from './designInput.js';
import { runBaseline } from './runBaseline.js';
import { loadDraft, saveDraft, clearDraft } from './draftStorage.js';
import { STEPS } from './steps/index.js';

/**
 * New-shelter design wizard (Person 2).
 *
 * Props
 *  location            resolved location from LocationPicker (optional prefill)
 *  designDay           current design-day id (optional prefill)
 *  onLocationChange    (resolvedLocation) => void   keeps the app's site in sync
 *  onDesignDayChange   (id) => void
 *  onBaselineResult    (simulateResponse | null) => void
 *  Design mode comes from value.mode ('new-build' | 'retrofit'); steps read it and relabel themselves.
 *  value / onChange    optional controlled designInput (Person 1's store, later)
 */
function initialState(location, designDay) {
  const draft = loadDraft();
  let design = hydrateDesignInput(draft?.design);
  let step = Number.isInteger(draft?.step) ? draft.step : 0;

  if (location?.site_id && design.site.siteId !== location.site_id) {
    design = mergeDesignInput(design, {
      site: {
        siteId: location.site_id,
        label: location.label,
        latitude: location.lat,
        longitude: location.lon,
        elevationM: location.elevation_m,
        climateCached: location.climate_cached ?? null,
      },
    });
    step = Math.min(step, 1);
  }
  if (designDay) design = mergeDesignInput(design, { site: { designDay } });
  return { design, step: Math.min(Math.max(step, 0), STEPS.length - 1) };
}

export default function DesignWizard({
  location, designDay, onLocationChange, onDesignDayChange, onBaselineResult, value, onChange,
}) {
  const [init] = useState(() => (value ? { design: value, step: 0 } : initialState(location, designDay)));
  const [internal, setInternal] = useState(init.design);
  const [stepIndex, setStepIndex] = useState(init.step);
  const [visited, setVisited] = useState(() => new Set([init.step]));
  const [showErrors, setShowErrors] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const [runNotes, setRunNotes] = useState(null);
  const [lastRun, setLastRun] = useState(null); // { data, key } — key is the design it was run for

  const design = value ?? internal;
  const setDesign = (next) => {
    if (onChange) onChange(next);
    else setInternal(next);
  };
  const update = (section, patch) => setDesign(mergeDesignInput(design, { [section]: patch }));

  useEffect(() => {
    saveDraft({ design, step: stepIndex });
  }, [design, stepIndex]);

  const validation = useMemo(() => validateDesignInput(design), [design]);
  const step = STEPS[stepIndex];
  const stepErrors = validation.errors[step.section] || [];
  const isLast = stepIndex === STEPS.length - 1;

  const goTo = (i) => {
    setStepIndex(i);
    setVisited((v) => new Set(v).add(i));
    setShowErrors(false);
  };

  const next = () => {
    if (stepErrors.length) {
      setShowErrors(true);
      return;
    }
    goTo(Math.min(stepIndex + 1, STEPS.length - 1));
  };

  const jump = (i) => {
    // going back is always free; going forward requires the steps before it to be valid
    if (i <= stepIndex) return goTo(i);
    const blocking = STEPS.slice(0, i).some((s) => (validation.errors[s.section] || []).length);
    if (blocking) return setShowErrors(true);
    return goTo(i);
  };

  const handleRun = async () => {
    if (!validation.ready) {
      setShowErrors(true);
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const { data, notes } = await runBaseline(design);
      setRunNotes(notes);
      setLastRun({ data, key: JSON.stringify(design) });
      onBaselineResult?.(data);
    } catch (err) {
      setRunError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const startOver = () => {
    if (!window.confirm('Discard this design and start again? Your location is kept.')) return;
    clearDraft();
    const fresh = createDefaultDesignInput({ site: design.site });
    setDesign(fresh);
    setRunNotes(null);
    setRunError(null);
    setLastRun(null);
    setVisited(new Set([0]));
    setStepIndex(0);
    setShowErrors(false);
    onBaselineResult?.(null);
  };

  const handleLocationChange = (data) => {
    setRunNotes(null);
    setLastRun(null);
    onBaselineResult?.(null);
    onLocationChange?.(data);
  };

  // a result only counts while the design still matches what was simulated
  const result = lastRun && lastRun.key === JSON.stringify(design) ? lastRun.data : null;
  const goToId = (id) => {
    const i = STEPS.findIndex((x) => x.id === id);
    if (i < 0) return;
    goTo(i);
    if ((validation.errors[STEPS[i].section] || []).length) setShowErrors(true);
  };
  const StepComponent = step.Component;

  return (
    <div className="dw">
      <nav className="dw-stepper-nav" aria-label="Design steps">
        {STEPS.map((s, i) => {
          const hasErr = visited.has(i) && i !== stepIndex && (validation.errors[s.section] || []).length > 0;
          return (
            <button
              key={s.id}
              type="button"
              className={`dw-nav-item ${i === stepIndex ? 'active' : ''} ${visited.has(i) && !hasErr && i < stepIndex ? 'done' : ''} ${hasErr ? 'error' : ''}`}
              aria-current={i === stepIndex ? 'step' : undefined}
              onClick={() => jump(i)}
            >
              <span className="dw-nav-num">{hasErr ? '!' : i < stepIndex ? '✓' : i + 1}</span>
              <span className="dw-nav-label">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <StepComponent
        stepId={step.id}
        design={design}
        update={update}
        errors={stepErrors}
        showErrors={showErrors}
        onLocationChange={handleLocationChange}
        onDesignDayChange={onDesignDayChange}
        mode={design.mode}
        validation={validation}
        onEdit={goToId}
        onRun={handleRun}
        running={running}
        runError={runError}
        runNotes={result ? runNotes : null}
        result={result}
      />

      <footer className="dw-footer">
        <button type="button" className="dw-btn dw-btn-ghost" onClick={startOver}>Start over</button>
        <div className="dw-footer-nav">
          <button type="button" className="dw-btn dw-btn-ghost" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
            ← Back
          </button>
          {!isLast && (
            <button type="button" className="dw-btn dw-btn-primary" onClick={next}>
              Next: {STEPS[stepIndex + 1].label} →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
