import { useState, useEffect } from 'react';
import TemperatureChart from './TemperatureChart';
import DesignDayPicker from './DesignDayPicker';

export default function ClimateModule({ siteId, designDay, onScenarioChange }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!siteId || !designDay) return;
    setLoading(true);
    setError(null);
    fetch('http://localhost:8000/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, design_day: designDay }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setPreview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [siteId, designDay]);

  const minAmbient = preview ? Math.min(...preview.outdoor_temp_c).toFixed(0) : '—';
  const peakAmbient = preview ? Math.max(...preview.outdoor_temp_c).toFixed(0) : '—';
  const avgAmbient = preview
    ? (preview.outdoor_temp_c.reduce((a, b) => a + b, 0) / preview.outdoor_temp_c.length).toFixed(1)
    : '—';

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 2 · Climate Intelligence Engine</div>
          <h2>High-Altitude Meteorological Time-Series</h2>
          <p>Grounded in real NASA POWER climate data, cached locally per site.</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Min Ambient</div>
          <div className="stat-value">{minAmbient}°C</div>
          <div className="stat-note">Extreme night low</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Peak Daytime</div>
          <div className="stat-value">{peakAmbient}°C</div>
          <div className="stat-note">Solar noon peak</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average Temp</div>
          <div className="stat-value">{avgAmbient}°C</div>
          <div className="stat-note">Diurnal 24-hr mean</div>
        </div>
      </div>

      <div className="config-form" style={{ marginBottom: '1.5rem' }}>
        <h2>Select Engineering Design Scenario</h2>
        <DesignDayPicker value={designDay} onChange={onScenarioChange} />
      </div>

      {error && <p className="form-error">Could not load preview: {error}</p>}
      {loading && <p className="form-note">Loading climate data...</p>}

      {preview && (
        <TemperatureChart
          hours={preview.hours}
          indoorTemps={preview.indoor_temp_c}
          outdoorTemps={preview.outdoor_temp_c}
        />
      )}
    </div>
  );
}