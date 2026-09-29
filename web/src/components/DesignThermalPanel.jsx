import { useEffect, useState } from 'react';
import TemperatureChart from './TemperatureChart';
import HeatFlowPanel from './HeatFlowPanel';
import { simulateDesign } from '../project/actions';

const fmt = (v, digits = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : '—');

export default function DesignThermalPanel({ siteId, dayOfYear, design, context, compact = false }) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = JSON.stringify([siteId, dayOfYear, design, context]);

  useEffect(() => {
    if (!siteId || !design) return undefined;
    let cancelled = false;
    setState({ key, data: null, error: null });
    simulateDesign({ siteId, dayOfYear, design, context })
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, data: null, error: err.message });
      });
    return () => { cancelled = true; };
  }, [key]);

  const current = state.key === key ? state : null;
  const data = current?.data ?? null;

  if (!design) return null;
  if (current?.error) return <p className="form-error">Could not simulate this design: {current.error}</p>;
  if (!data) return <p className="form-note">Simulating this design with the same inputs used by the optimizer…</p>;

  const predicted = design.comfort_coldest_hour_c;
  const outdoor = data.outdoor_temp_c || [];
  const meanOutdoor = outdoor.length ? outdoor.reduce((a, b) => a + b, 0) / outdoor.length : null;
  const heatFlow = data.heat_flow_kwh || {};
  const totalHeatLoss = Object.entries(heatFlow)
    .filter(([k]) => /loss/i.test(k))
    .reduce((sum, [, v]) => sum + Math.abs(Number(v) || 0), 0);

  return (
    <div className="design-thermal-panel" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="thermal-summary-grid">
        <div><span>Indoor minimum</span><strong>{fmt(data.min_indoor_temp_c)}°C</strong></div>
        <div><span>Indoor maximum</span><strong>{fmt(data.max_indoor_temp_c)}°C</strong></div>
        <div><span>Outdoor mean</span><strong>{fmt(meanOutdoor)}°C</strong></div>
        <div><span>Solar absorbed</span><strong>{fmt(data.solar_absorbed_kwh)} kWh</strong></div>
        <div><span>Heat loss</span><strong>{fmt(totalHeatLoss)} kWh</strong></div>
        <div><span>Safety</span><strong>{data.safety_passed ? 'Passed' : 'Check'}</strong></div>
      </div>

      {!compact && (
        <TemperatureChart
          hours={data.hours}
          indoorTemps={data.indoor_temp_c}
          outdoorTemps={data.outdoor_temp_c}
        />
      )}

      {typeof predicted === 'number' && (
        <p className="form-note" style={{ margin: 0, lineHeight: 1.5 }}>
          Optimizer prediction: {predicted.toFixed(1)}°C coldest hour · independent simulation: {data.min_indoor_temp_c.toFixed(1)}°C.
          {Math.abs(predicted - data.min_indoor_temp_c) <= 0.5 ? ' The two results closely reproduce each other.' : ' Review the difference before treating the optimizer value as the final simulation result.'}
        </p>
      )}

      {!compact && (
        <HeatFlowPanel
          heatFlow={data.heat_flow_kwh}
          indoorTemps={data.indoor_temp_c}
          solarKwh={data.solar_absorbed_kwh}
          safetyPassed={data.safety_passed}
          safetyReasons={data.safety_reasons}
          coPpm={data.co_steady_state_ppm}
          meanAch={data.mean_ach}
        />
      )}
    </div>
  );
}
