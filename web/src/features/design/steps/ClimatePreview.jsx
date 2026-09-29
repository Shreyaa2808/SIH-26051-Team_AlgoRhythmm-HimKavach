import { useState, useEffect } from 'react';
import { API } from '../../../api';

/** Outdoor temperature for the chosen site + design day (real cached climate). */
export default function ClimatePreview({ siteId, designDay }) {
  const requestKey = siteId && designDay ? `${siteId}|${designDay}` : null;
  const [result, setResult] = useState({ key: null, temps: null, error: null });

  useEffect(() => {
    if (!requestKey) return undefined;
    let cancelled = false;
    fetch(`${API}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, design_day: designDay }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setResult({ key: requestKey, temps: d.outdoor_temp_c, error: null });
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, temps: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, siteId, designDay]);

  const current = result.key === requestKey ? result : null;
  if (!requestKey) return null;
  if (!current) return <p className="dw-muted">Loading climate preview…</p>;
  if (current.error) return <p className="dw-error">Could not load climate preview: {current.error}</p>;

  const t = current.temps;
  const min = Math.min(...t);
  const max = Math.max(...t);
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  const W = 300;
  const H = 70;
  const span = max - min || 1;
  const pts = t
    .map((v, i) => `${((i / (t.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * (H - 8) - 4).toFixed(1)}`)
    .join(' ');

  return (
    <div className="dw-climate">
      <div className="dw-stats">
        <div><span>Min</span><strong>{min.toFixed(1)}°C</strong></div>
        <div><span>Mean</span><strong>{mean.toFixed(1)}°C</strong></div>
        <div><span>Max</span><strong>{max.toFixed(1)}°C</strong></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="dw-spark" role="img" aria-label="24-hour outdoor temperature">
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <p className="dw-muted">
        24-hour outdoor temperature for this design day. Solar, wind and humidity series are not exposed by the API yet, so
        they are not shown.
      </p>
    </div>
  );
}
