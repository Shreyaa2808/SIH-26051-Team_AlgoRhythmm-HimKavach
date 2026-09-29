import { useState, useEffect } from 'react';

import { API } from '../api';

const fmt = (v, digits = 1) => (v != null ? `${v.toFixed(digits)}°C` : null);

function tagFor(run) {
  if (run.status === 'complete') {
    return run.validated
      ? { cls: 'cheapest', text: 'Validated' }
      : { cls: 'max', text: 'Outside tolerance' };
  }
  if (run.status === 'awaiting_ansys') return { cls: 'waiting', text: 'Waiting for ANSYS' };
  return { cls: 'max', text: 'Could not run' };
}

export default function BenchmarkModule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/validation/ansys-benchmark`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Request failed: ${res.status}`);
        }
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 6 · High-Fidelity ANSYS Validation Suite</div>
          <h2>Physics Validation Benchmark</h2>
          <p>
            Our RC-network solver's result for each reference design is compared against a
            high-fidelity ANSYS run. A design is marked validated when the two minimum indoor
            temperatures agree within {data?.tolerance_c ?? 1}°C. ANSYS runs are time-consuming,
            so in this prototype they are still to be run — our solver's computed values are
            shown below and the ANSYS column shows "Waiting for ANSYS".
          </p>
        </div>
        {data?.mean_speedup_x && (
          <span className="pill pill-live">⚡ {data.mean_speedup_x.toFixed(0)}× faster than ANSYS</span>
        )}
      </div>

      {loading && <p className="form-note">Loading benchmark data...</p>}

      {error && (
        <p className="form-error">
          Could not load benchmark data: {error}. Make sure the backend has
          been restarted after pulling the latest changes.
        </p>
      )}

      {data && data.runs && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Validated by ANSYS</div>
              <div className="stat-value">{data.n_complete}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Waiting for ANSYS</div>
              <div className="stat-value">{data.n_awaiting_ansys}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Mean Absolute Error</div>
              <div className="stat-value">{data.mae_c != null ? fmt(data.mae_c, 2) : '—'}</div>
              {data.mae_c == null && (
                <div className="stat-note">Available once ANSYS results arrive</div>
              )}
            </div>
          </div>

          <div className="pareto-grid">
            {data.runs.map((r) => {
              const tag = tagFor(r);
              return (
                <div key={r.id} className="pareto-card">
                  <span className={`pareto-tag ${tag.cls}`}>{tag.text}</span>
                  <h3>{r.label}</h3>

                  {r.ours_min_indoor_temp_c != null && (
                    <div className="pareto-stats">
                      <div>
                        <span>Our Min Indoor (RC solver)</span>
                        <strong>{fmt(r.ours_min_indoor_temp_c)}</strong>
                      </div>
                      <div>
                        <span>ANSYS Min Indoor</span>
                        <strong>
                          {r.ansys_min_indoor_temp_c != null
                            ? fmt(r.ansys_min_indoor_temp_c)
                            : 'Waiting for ANSYS'}
                        </strong>
                      </div>
                      <div>
                        <span>Abs Error</span>
                        <strong>{r.abs_error_c != null ? fmt(r.abs_error_c, 2) : '—'}</strong>
                      </div>
                      <div>
                        <span>Speedup</span>
                        <strong>{r.speedup_x != null ? `${r.speedup_x.toFixed(0)}×` : '—'}</strong>
                      </div>
                    </div>
                  )}

                  {r.note && <p className="spec-line">{r.note}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
