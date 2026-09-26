export default function OptimizeResults({ data }) {
  if (!data) return null;

  const cheapest = [...data.pareto_front].sort((a, b) => a.cost_inr - b.cost_inr)[0];
  const warmest = [...data.pareto_front].sort(
    (a, b) => b.comfort_coldest_hour_c - a.comfort_coldest_hour_c
  )[0];
  const lightest = [...data.pareto_front].sort((a, b) => a.weight_kg - b.weight_kg)[0];

  return (
    <div className="results">
      <h2>Ranked Design Options</h2>
      <p className="form-note">{data.note}</p>

      <div className="intervention-grid" style={{ marginBottom: '1.5rem' }}>
        {cheapest && (
          <div className="intervention-card highlight">
            <h3>💰 Cheapest</h3>
            <p>₹{cheapest.cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="delta">{cheapest.comfort_coldest_hour_c.toFixed(1)}°C coldest hour</p>
          </div>
        )}
        {warmest && (
          <div className="intervention-card highlight">
            <h3>🔥 Warmest</h3>
            <p className="delta">{warmest.comfort_coldest_hour_c.toFixed(1)}°C coldest hour</p>
            <p>₹{warmest.cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        )}
        {lightest && (
          <div className="intervention-card highlight">
            <h3>🪶 Lightest (deployable)</h3>
            <p>{lightest.weight_kg.toFixed(0)} kg</p>
            <p>₹{lightest.cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        )}
      </div>

      <h3>Full Pareto Front</h3>
      <div className="intervention-grid">
        {data.pareto_front.map((d, i) => (
          <div key={i} className="intervention-card">
            <h3>Design {i + 1}</h3>
            <p>Wall: {d.wall_material_id.replaceAll('_', ' ')}</p>
            <p>Insulation: {d.insulation_material_id.replaceAll('_', ' ')}</p>
            <p>Wall thickness: {d.wall_thickness_m.toFixed(2)} m</p>
            <p>Insulation thickness: {d.insulation_thickness_m.toFixed(2)} m</p>
            <p className="delta">Coldest hour: {d.comfort_coldest_hour_c.toFixed(1)}°C</p>
            <p>Cost: ₹{d.cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p>Weight: {d.weight_kg.toFixed(0)} kg</p>
            <p className="uvalue">
              U-value: {d.wall_u_value_wm2k.toFixed(3)} W/m²K ·{' '}
              {d.safety_passed ? '✅ Safe' : '❌ Unsafe'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}