import { useState, useEffect } from 'react';

const API = 'http://localhost:8000';

export default function SandboxModule({ seed }) {
  const [form, setForm] = useState({
    unit_cost_inr: seed?.cost_inr ?? 250000,
    unit_weight_kg: seed?.weight_kg ?? 3500,
    unit_floor_area_m2: seed?.floor_area_m2 ?? 16,
    unit_carbon_kgco2e: seed?.carbon_kgco2e ?? '',
    occupancy_total: 24,
    budget_total_inr: 3000000,
    occupancy_per_unit: 4,
    spacing_multiplier: 2.5,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Re-seed the form whenever a design is sent over from the Optimize tab.
  useEffect(() => {
    if (!seed) return;
    setForm((prev) => ({
      ...prev,
      unit_cost_inr: seed.cost_inr,
      unit_weight_kg: seed.weight_kg,
      unit_floor_area_m2: seed.floor_area_m2 ?? prev.unit_floor_area_m2,
      unit_carbon_kgco2e: seed.carbon_kgco2e ?? '',
    }));
    setResult(null);
  }, [seed]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/sandbox/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          unit_carbon_kgco2e: form.unit_carbon_kgco2e === '' ? null : Number(form.unit_carbon_kgco2e),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed: ${res.status}`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Scale the returned positions_m into a fixed-size SVG canvas.
  const renderGrid = () => {
    if (!result || result.units_built <= 0) return null;
    const pad = 20;
    const scale = 18; // px per meter
    const maxX = Math.max(...result.positions_m.map((p) => p[0]), 0) + result.unit_footprint_side_m;
    const maxY = Math.max(...result.positions_m.map((p) => p[1]), 0) + result.unit_footprint_side_m;
    const w = maxX * scale + pad * 2;
    const h = maxY * scale + pad * 2;
    const side = result.unit_footprint_side_m * scale;

    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="sandbox-grid-svg">
        {result.positions_m.map(([x, y], i) => (
          <g key={i}>
            <rect
              x={pad + x * scale - side / 2}
              y={pad + y * scale - side / 2}
              width={side}
              height={side}
              rx="4"
              className="sandbox-unit-rect"
            />
            <text
              x={pad + x * scale}
              y={pad + y * scale + 4}
              textAnchor="middle"
              className="sandbox-unit-label"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 6 · Bulk / Sandbox Settlement Layout</div>
          <h2>Multi-Unit Settlement Sizing</h2>
          <p>
            Sizes N copies of ONE already-optimized unit design against a total occupancy and
            budget. Send a design over from the Multi-Objective tab, or fill in the numbers
            directly.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="config-form">
        <h3 className="form-subhead">Unit design (from Multi-Objective, or entered manually)</h3>
        <label>
          Unit cost (₹)
          <input type="number" value={form.unit_cost_inr} onChange={(e) => handleChange('unit_cost_inr', Number(e.target.value))} />
        </label>
        <label>
          Unit weight (kg)
          <input type="number" value={form.unit_weight_kg} onChange={(e) => handleChange('unit_weight_kg', Number(e.target.value))} />
        </label>
        <label>
          Unit floor area (m²)
          <input type="number" value={form.unit_floor_area_m2} onChange={(e) => handleChange('unit_floor_area_m2', Number(e.target.value))} />
        </label>
        <label>
          Unit embodied carbon (kgCO₂e, optional)
          <input type="number" value={form.unit_carbon_kgco2e} onChange={(e) => handleChange('unit_carbon_kgco2e', e.target.value)} />
        </label>

        <h3 className="form-subhead">Settlement constraints</h3>
        <label>
          Total occupancy (people)
          <input type="number" value={form.occupancy_total} onChange={(e) => handleChange('occupancy_total', Number(e.target.value))} />
        </label>
        <label>
          Total budget (₹, 0 = ignore budget)
          <input type="number" value={form.budget_total_inr} onChange={(e) => handleChange('budget_total_inr', Number(e.target.value))} />
        </label>
        <label>
          Occupancy per unit
          <input type="number" value={form.occupancy_per_unit} onChange={(e) => handleChange('occupancy_per_unit', Number(e.target.value))} />
        </label>
        <label>
          Spacing multiplier (× unit footprint side)
          <input type="number" step="0.1" value={form.spacing_multiplier} onChange={(e) => handleChange('spacing_multiplier', Number(e.target.value))} />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Sizing settlement...' : 'Suggest Layout'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </form>

      {result && (
        <div className="results">
          <h2>Suggested Layout</h2>
          <p className="form-note">
            Binding constraint: <strong>{result.binding_constraint}</strong>
          </p>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Units Built</div>
              <div className="stat-value">{result.units_built}</div>
              <div className="stat-note">{result.grid_rows}×{result.grid_cols} grid</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Occupancy Covered</div>
              <div className="stat-value">{result.occupancy_covered}/{result.occupancy_total}</div>
              {result.occupancy_shortfall > 0 && (
                <div className="stat-note">Short by {result.occupancy_shortfall}</div>
              )}
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Cost</div>
              <div className="stat-value">₹{result.total_cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="stat-note">
                {result.budget_total_inr > 0
                  ? `₹${result.budget_remaining_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })} remaining`
                  : 'No budget cap set'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Weight</div>
              <div className="stat-value">{result.total_weight_kg.toFixed(0)} kg</div>
              <div className="stat-note">
                {result.total_carbon_kgco2e != null ? `${result.total_carbon_kgco2e.toFixed(0)} kgCO₂e` : 'Carbon unknown'}
              </div>
            </div>
          </div>

          <div className="location-map-wrap" style={{ marginTop: '1rem', padding: '1rem', background: 'var(--glass)' }}>
            {renderGrid()}
          </div>

          {result.notes.length > 0 && (
            <ul className="sandbox-notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
