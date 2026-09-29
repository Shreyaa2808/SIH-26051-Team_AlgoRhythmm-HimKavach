import { useState } from 'react';
import { API } from '../api';

const money = (v) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);

const DEFAULTS = {
  floor_area_m2: '16',
  ceiling_height_m: '2.4',
  leakage_area_cm2: '150',
  wall_material_id: 'strawclay_block',
  wall_thickness_m: '0.2',
  insulation_material_id: '',
  insulation_thickness_m: '0',
  sensible_heat_w: '200',
};

const FIELDS = [
  ['floor_area_m2', 'Floor area (m²)'],
  ['ceiling_height_m', 'Ceiling height (m)'],
  ['leakage_area_cm2', 'Air leakage (cm²)'],
  ['wall_material_id', 'Wall material ID'],
  ['wall_thickness_m', 'Wall thickness (m)'],
  ['insulation_material_id', 'Insulation material ID (blank if none)'],
  ['insulation_thickness_m', 'Insulation thickness (m, 0 if none)'],
  ['sensible_heat_w', 'Occupant heat (W)'],
];

export default function RetrofitPanel({ siteId, designDay = 'coldest_winter_night', initial }) {
  const [form, setForm] = useState({ ...DEFAULTS, ...initial });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const insThick = Number(form.insulation_thickness_m) || 0;
      const res = await fetch(`${API}/retrofit/rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          design_day: designDay,
          floor_area_m2: Number(form.floor_area_m2),
          ceiling_height_m: Number(form.ceiling_height_m),
          leakage_area_cm2: Number(form.leakage_area_cm2),
          wall_material_id: form.wall_material_id,
          wall_thickness_m: Number(form.wall_thickness_m),
          insulation_material_id: insThick > 0 ? form.insulation_material_id || null : null,
          insulation_thickness_m: insThick,
          sensible_heat_w: Number(form.sensible_heat_w),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `Request failed: ${res.status}`);
      setResult(body);
    } catch (e) {
      setResult(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const base = result?.baseline;
  const cell = { padding: '0.5rem 0.6rem', textAlign: 'left' };

  return (
    <div className="config-form" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Retrofit an existing shelter</h2>
      <p className="form-note">
        Describe the shelter as it is today. We simulate each possible upgrade and rank them.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {FIELDS.map(([key, label]) => (
          <label key={key}>
            {label}
            <br />
            <input
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button type="button" className="primary-btn" onClick={run} disabled={loading || !siteId}>
          {loading ? 'Ranking upgrades…' : 'Rank upgrades'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {base && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Current coldest hour</div>
              <div className="stat-value">{base.comfort_coldest_hour_c.toFixed(1)}°C</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Wall U-value</div>
              <div className="stat-value">{base.wall_u_value_wm2k.toFixed(2)}</div>
              <div className="stat-note">W/m²K</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Safety</div>
              <div className="stat-value">{base.safety_passed ? '✅ Passed' : '⚠️ Failed'}</div>
            </div>
          </div>
          {!base.safety_passed && base.safety_reasons?.length > 0 && (
            <ul className="form-error">
              {base.safety_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: '1.5rem' }}>Recommended upgrades (best first)</h3>
          {result.ranked_interventions.length === 0 ? (
            <p className="form-note">No upgrade improves this shelter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={cell}>#</th>
                    <th style={cell}>Upgrade</th>
                    <th style={cell}>Coldest hour</th>
                    <th style={cell}>Gain</th>
                    <th style={cell}>Added cost</th>
                    <th style={cell}>Cost per °C</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ranked_interventions.map((r, i) => (
                    <tr key={r.kind + i} style={{ borderTop: '1px solid rgba(150,170,210,0.3)' }}>
                      <td style={cell}>{i + 1}</td>
                      <td style={cell}>{r.label}</td>
                      <td style={cell}>{r.comfort_coldest_hour_c.toFixed(1)}°C</td>
                      <td style={cell}>+{r.delta_comfort_c.toFixed(1)}°C</td>
                      <td style={cell}>{money(r.added_cost_inr)}</td>
                      <td style={cell}>{money(r.cost_per_degree_inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(result.rejected_interventions.length > 0 || result.unavailable_interventions.length > 0) && (
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Upgrades that were not ranked</summary>
              <ul className="form-note" style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                {[...result.rejected_interventions, ...result.unavailable_interventions].map((r, i) => (
                  <li key={r.kind + i}>
                    <strong>{r.label}:</strong> {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}