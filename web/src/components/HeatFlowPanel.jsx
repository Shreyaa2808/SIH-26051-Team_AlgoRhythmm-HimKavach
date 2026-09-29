const TARGET_C = 10; // change this to your project's comfort target

const LABELS = {
  walls: 'Walls',
  roof: 'Roof',
  floor: 'Floor',
  window: 'Window',
  ventilation: 'Air leakage',
};

export default function HeatFlowPanel({
  heatFlow,
  indoorTemps,
  solarKwh,
  safetyPassed,
  safetyReasons,
  coPpm,
  meanAch,
}) {
  if (!heatFlow || !indoorTemps) return null;

  const mean = indoorTemps.reduce((a, b) => a + b, 0) / indoorTemps.length;
  const min = Math.min(...indoorTemps);
  const max = Math.max(...indoorTemps);
  const hoursBelow = indoorTemps.filter((t) => t < TARGET_C).length;

  const losses = Object.entries(heatFlow)
    .filter(([key, value]) => key !== 'internal' && value < 0)
    .map(([key, value]) => ({ key, label: LABELS[key] || key, kwh: -value }))
    .sort((a, b) => b.kwh - a.kwh);
  const totalLoss = losses.reduce((sum, item) => sum + item.kwh, 0);
  const top = losses[0];

  return (
    <div className="config-form" style={{ marginTop: '1.5rem' }}>
      <h2>Thermal Diagnosis</h2>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Average Indoor</div>
          <div className="stat-value">{mean.toFixed(1)}°C</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Indoor Range</div>
          <div className="stat-value">{(max - min).toFixed(1)}°C</div>
          <div className="stat-note">{min.toFixed(1)} to {max.toFixed(1)}°C</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hours Below {TARGET_C}°C</div>
          <div className="stat-value">{hoursBelow} / {indoorTemps.length}</div>
        </div>
      </div>

            {typeof safetyPassed === 'boolean' && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.8rem 1rem',
            borderRadius: 10,
            background: safetyPassed ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${safetyPassed ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div style={{ fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
  {safetyPassed ? '✅ Safety checks passed' : '⚠️ Safety checks failed'}
</div>
<div className="form-note" style={{ margin: 0, lineHeight: 1.5 }}>
  Air changes per hour: {meanAch?.toFixed(2)} · CO level: {coPpm?.toFixed(0)} ppm
</div>
          {!safetyPassed && safetyReasons?.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0 1.2rem' }}>
              {safetyReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3 style={{ marginTop: '1rem' }}>Where the heat escapes</h3>
      {losses.map((item) => {
        const pct = totalLoss > 0 ? (item.kwh / totalLoss) * 100 : 0;
        return (
          <div key={item.key} style={{ marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.label}</span>
              <span>{pct.toFixed(0)}% ({item.kwh.toFixed(2)} kWh)</span>
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: 6, height: 10 }}>
              <div style={{ width: `${pct}%`, background: '#3b82f6', height: 10, borderRadius: 6 }} />
            </div>
          </div>
        );
      })}

      {top && (
        <p style={{ marginTop: '1rem', fontWeight: 600 }}>
          Main improvement opportunity: {top.label.toLowerCase()}
        </p>
      )}
      {typeof solarKwh === 'number' && (
        <p className="form-note">
          Sunlight hitting the outer surfaces: {solarKwh.toFixed(0)} kWh (most of it returns to the outside air).
        </p>
      )}
    </div>
  );
}