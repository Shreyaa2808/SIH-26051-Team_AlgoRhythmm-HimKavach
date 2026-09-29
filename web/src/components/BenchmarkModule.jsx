import { useEffect, useState } from 'react';

import { projectApi, useProject } from '../project/ProjectContext';

const fmt = (v, digits = 1) => (typeof v === 'number' ? `${v.toFixed(digits)}°C` : '—');
const modeLabel = (m) => (m === 'retrofit' ? 'Retrofit' : 'New build');

/** Pull the numbers we can show out of a project's baseline result. */
function summarise(doc) {
  const b = doc.baseline;
  return {
    id: doc.projectId,
    name: doc.projectName,
    mode: doc.mode,
    site: doc.site?.label ?? null,
    hasBaseline: Boolean(b),
    minTemp: b?.min_indoor_temp_c ?? null,
    maxTemp: b?.max_indoor_temp_c ?? null,
    safety: b?.safety_passed ?? null,
    designs: doc.optimizedDesigns?.length ?? 0,
  };
}

export default function BenchmarkModule() {
  const { project } = useProject();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await projectApi.list();
        const docs = await Promise.all(
          list.map((p) => (p.id === project?.projectId ? project : projectApi.get(p.id)))
        );
        // The open project may not be saved yet - always include it.
        if (project && !docs.some((d) => d.projectId === project.projectId)) docs.unshift(project);
        if (!cancelled) setCases(docs.map(summarise));
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const withBaseline = cases?.filter((c) => c.hasBaseline).length ?? 0;

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">High-Fidelity ANSYS Validation</div>
          <h2>Physics Validation Benchmark</h2>
          <p>
            Every case you have created is listed below with the result from our RC-network
            solver. Each case will be marked validated once its ANSYS run is complete and the two
            minimum indoor temperatures agree within 1°C.
          </p>
        </div>
      </div>

      {!cases && !error && <p className="form-note">Loading your cases...</p>}
      {error && <p className="form-error">Could not load cases: {error}</p>}

      {cases && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Total cases</div>
              <div className="stat-value">{cases.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Solver result available</div>
              <div className="stat-value">{withBaseline}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Waiting for ANSYS</div>
              <div className="stat-value">{withBaseline}</div>
            </div>
          </div>

          {cases.length === 0 && <p className="form-note">No cases yet.</p>}

          <div className="pareto-grid">
            {cases.map((c) => (
              <div key={c.id} className="pareto-card">
                <span className={`pareto-tag ${c.hasBaseline ? 'waiting' : 'max'}`}>
                  {c.hasBaseline ? 'Waiting for ANSYS' : 'No baseline yet'}
                </span>
                <h3>{c.name}</h3>
                <p className="spec-line">
                  {modeLabel(c.mode)} · {c.site || 'No site yet'}
                </p>

                {c.hasBaseline && (
                  <div className="pareto-stats">
                    <div>
                      <span>Our Min Indoor (RC solver)</span>
                      <strong>{fmt(c.minTemp)}</strong>
                    </div>
                    <div>
                      <span>Our Max Indoor (RC solver)</span>
                      <strong>{fmt(c.maxTemp)}</strong>
                    </div>
                    <div>
                      <span>ANSYS Min Indoor</span>
                      <strong>Waiting for ANSYS</strong>
                    </div>
                    <div>
                      <span>Abs Error</span>
                      <strong>—</strong>
                    </div>
                  </div>
                )}
                {c.hasBaseline && c.safety != null && (
                  <p className="spec-line">Safety check: {c.safety ? 'Passed' : 'Failed'}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
