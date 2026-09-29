import { useEffect, useState } from 'react';
import TemperatureChart from './TemperatureChart';
import HeatFlowPanel from './HeatFlowPanel';
import { API } from '../api';

export default function DesignThermalPanel({ siteId, dayOfYear, design, context }) {
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = JSON.stringify([siteId, dayOfYear, design, context]);

  useEffect(() => {
    if (!siteId || !design) return undefined;
    let cancelled = false;
    fetch(`${API}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: siteId,
        day_of_year: dayOfYear,
        wall_material_id: design.wall_material_id,
        insulation_material_id: design.insulation_material_id,
        wall_thickness_m: design.wall_thickness_m,
        insulation_thickness_m: design.insulation_thickness_m,
        leakage_area_cm2: design.leakage_area_cm2,
        floor_area_m2: context?.floor_area_m2 ?? 16,
        ceiling_height_m: design.ceiling_height_m || context?.ceiling_height_m || 2.4,
        roof_slope_deg: design.roof_slope_deg ?? context?.roof_slope_deg ?? 0,
        sensible_heat_w: context?.sensible_heat_w ?? 200,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ key, data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state.key === key ? state : null;
  const data = current?.data ?? null;

  if (!design) return null;
  if (current?.error) return <p className="form-error">Could not simulate this design: {current.error}</p>;
  if (!data) return <p className="form-note">Simulating this design...</p>;

  const predicted = design.comfort_coldest_hour_c;

      return (
    <div
      className="design-thermal-panel"
      style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <TemperatureChart
        hours={data.hours}
        indoorTemps={data.indoor_temp_c}
        outdoorTemps={data.outdoor_temp_c}
      />

      {typeof predicted === 'number' && (
        <p className="form-note" style={{ margin: 0, lineHeight: 1.5 }}>
          Coldest hour: optimizer predicted {predicted.toFixed(1)}°C, this simulation gives{' '}
          {data.min_indoor_temp_c.toFixed(1)}°C.
        </p>
      )}

      <HeatFlowPanel
        heatFlow={data.heat_flow_kwh}
        indoorTemps={data.indoor_temp_c}
        solarKwh={data.solar_absorbed_kwh}
        safetyPassed={data.safety_passed}
        safetyReasons={data.safety_reasons}
        coPpm={data.co_steady_state_ppm}
        meanAch={data.mean_ach}
      />
    </div>
  );
}