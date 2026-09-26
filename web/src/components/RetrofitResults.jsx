export default function RetrofitResults({ data }) {
  if (!data) return null;

  const { baseline, ranked_interventions, rejected_interventions, unavailable_interventions } = data;

  return (
    <div className="retrofit-results">
      <h2>Current Baseline</h2>
      <div className="baseline-card">
        <p>Coldest indoor hour: <strong>{baseline.comfort_coldest_hour_c.toFixed(1)}°C</strong></p>
        <p>Wall U-value: <strong>{baseline.wall_u_value_wm2k.toFixed(3)} W/m²K</strong></p>
        <p>
          Safety: {baseline.safety_passed
            ? <span className="pass">✅ Passed</span>
            : <span className="fail">❌ Failed — {baseline.safety_reasons.join(', ')}</span>}
        </p>
      </div>

      <h2>Ranked Upgrade Options</h2>
      {ranked_interventions.length === 0 && <p>No viable upgrades found.</p>}
      <div className="intervention-grid">
        {ranked_interventions.map((r, i) => (
          <div key={i} className="intervention-card ranked">
            <h3>{r.label}</h3>
            <p>New coldest hour: <strong>{r.comfort_coldest_hour_c.toFixed(1)}°C</strong></p>
            <p className="delta">+{r.delta_comfort_c.toFixed(1)}°C improvement</p>
            {r.added_cost_inr != null && <p>Added cost: ₹{r.added_cost_inr.toLocaleString()}</p>}
            {r.cost_per_degree_inr != null && (
              <p>₹{r.cost_per_degree_inr.toFixed(0)} per °C improved</p>
            )}
            <p className="uvalue">New wall U-value: {r.wall_u_value_wm2k.toFixed(3)} W/m²K</p>
          </div>
        ))}
      </div>

      {rejected_interventions.length > 0 && (
        <>
          <h3>Rejected (failed safety)</h3>
          <ul className="rejected-list">
            {rejected_interventions.map((r, i) => (
              <li key={i}><strong>{r.label}</strong>: {r.reason}</li>
            ))}
          </ul>
        </>
      )}

      {unavailable_interventions.length > 0 && (
        <>
          <h3>Unavailable (missing data)</h3>
          <ul className="unavailable-list">
            {unavailable_interventions.map((u, i) => (
              <li key={i}><strong>{u.label}</strong>: {u.reason}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}