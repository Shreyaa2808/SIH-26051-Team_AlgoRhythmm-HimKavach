import { useState, useEffect } from 'react';

export default function BenchmarkModule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/validation/ansys-benchmark')
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
          <p>{data?.note || 'Comparing the fast RC-network solver against ANSYS reference runs.'}</p>
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
              <div className="stat-label">Complete Runs</div>
              <div className="stat-value">{data.n_complete}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending Runs</div>
              <div className="stat-value">{data.n_pending}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Mean Absolute Error</div>
              <div className="stat-value">{data.mae_c != null ? `${data.mae_c.toFixed(2)}°C` : '—'}</div>
            </div>
          </div>

          <div className="pareto-grid">
            {data.runs.map((r) => (
              <div key={r.id} className="pareto-card">
                <span className={`pareto-tag ${r.status === 'complete' ? 'cheapest' : 'max'}`}>
                  {r.status}
                </span>
                <h3>{r.label}</h3>
                {r.status === 'complete' ? (
                  <div className="pareto-stats">
                    <div><span>Our Min Indoor</span><strong>{r.ours_min_indoor_temp_c?.toFixed(1)}°C</strong></div>
                    <div><span>ANSYS Min Indoor</span><strong>{r.ansys_min_indoor_temp_c?.toFixed(1)}°C</strong></div>
                    <div><span>Abs Error</span><strong>{r.abs_error_c?.toFixed(2)}°C</strong></div>
                    <div><span>Speedup</span><strong>{r.speedup_x?.toFixed(0)}×</strong></div>
                  </div>
                ) : (
                  <p className="spec-line">{r.note}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}