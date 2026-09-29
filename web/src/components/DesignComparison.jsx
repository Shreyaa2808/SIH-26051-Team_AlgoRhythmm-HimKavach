import { useMemo, useState } from 'react';
import ParetoChart from './ParetoChart';
import DesignThermalPanel from './DesignThermalPanel';
import { simulateDesign } from '../project/actions';

const money = (v) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const materialName = (v) => (v ? v.replaceAll('_', ' ') : '—');
const designKey = (d) => [
  d?.wall_material_id, d?.insulation_material_id,
  Number(d?.wall_thickness_m ?? 0).toFixed(5),
  Number(d?.insulation_thickness_m ?? 0).toFixed(5),
  Number(d?.leakage_area_cm2 ?? 0).toFixed(3),
  Number(d?.roof_slope_deg ?? 0).toFixed(3),
  Number(d?.ceiling_height_m ?? 0).toFixed(3),
].join('|');

function metricRows(designs) {
  return [
    { label: 'Material cost', key: 'cost_inr', format: money },
    { label: 'Coldest indoor hour', key: 'comfort_coldest_hour_c', format: (v) => `${Number(v).toFixed(1)} °C` },
    { label: 'Envelope weight', key: 'weight_kg', format: (v) => `${Number(v).toFixed(0)} kg` },
    {
      label: 'Embodied carbon',
      key: 'carbon_kgco2e',
      format: (v) => (v == null ? 'Unknown' : `${Number(v).toFixed(0)} kgCO₂e`),
    },
    { label: 'Wall U-value', key: 'wall_u_value_wm2k', format: (v) => `${Number(v).toFixed(2)} W/m²K` },
    { label: 'Wall thickness', key: 'wall_thickness_m', format: (v) => `${Number(v).toFixed(2)} m` },
    { label: 'Insulation thickness', key: 'insulation_thickness_m', format: (v) => `${Number(v).toFixed(2)} m` },
    { label: 'Roof slope', key: 'roof_slope_deg', format: (v) => `${Number(v ?? 0).toFixed(0)}°` },
  ].filter(() => designs.length);
}

export default function DesignComparison({
  data,
  siteId,
  onOpenDesign,
  instantiating,
  instantiateError,
}) {
  const candidates = useMemo(() => {
    const curated = (data?.curated_designs || []).map((x) => ({
      label: x.label,
      why: x.why,
      design: x.design,
    }));
    const extra = (data?.explore_more || []).map((design, i) => ({
      label: `Design ${i + 1}`,
      why: 'Additional feasible design from the same optimization run.',
      design,
    }));
    return [...curated, ...extra];
  }, [data]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [thermalIndex, setThermalIndex] = useState(null);
  const [thermalResults, setThermalResults] = useState({});
  const [thermalRunning, setThermalRunning] = useState(false);
  const [thermalError, setThermalError] = useState(null);
  const selected = candidates[selectedIndex] || candidates[0];

  if (!candidates.length) {
    return (
      <section className="config-form">
        <h3>No optimized designs yet</h3>
        <p className="form-note">Run the optimizer first. Its physics-verified candidates will appear here.</p>
      </section>
    );
  }

  const run = data;
  const selectedDesign = selected.design;
  const paretoPoints = data.pareto_front || [];
  const selectedPareto = paretoPoints.find((d) => designKey(d) === designKey(selectedDesign)) || selectedDesign;
  const rows = metricRows(candidates);

  const runThermalComparison = async () => {
    if (!run?.context || !siteId || !candidates.length) return;
    setThermalRunning(true);
    setThermalError(null);
    try {
      const results = await Promise.all(
        candidates.map((item) => simulateDesign({
          siteId,
          dayOfYear: run.day_of_year,
          design: item.design,
          context: run.context,
        }))
      );
      const next = {};
      results.forEach((result, index) => {
        next[designKey(candidates[index].design)] = result;
      });
      setThermalResults(next);
    } catch (err) {
      setThermalError(err.message || 'Thermal comparison failed.');
    } finally {
      setThermalRunning(false);
    }
  };

  return (
    <div className="comparison-page">
      <section className="comparison-hero">
        <div>
          <div className="eyebrow">Decision workspace</div>
          <h2>Compare the generated designs</h2>
          <p>
            Compare the same engineering metrics across the generated candidates, inspect a thermal
            simulation for any design, then instantiate one design for the Digital Twin.
          </p>
        </div>
        <div className="comparison-count">
          <strong>{candidates.length}</strong>
          <span>candidate designs</span>
        </div>
      </section>

      <section className="comparison-cards">
        {candidates.map((item, index) => {
          const d = item.design;
          const isSelected = index === selectedIndex;
          return (
            <article className={`comparison-card ${isSelected ? 'is-selected' : ''}`} key={`${item.label}-${index}`}>
              <div className="comparison-card-head">
                <div>
                  <span className="pareto-tag balanced-tag">{item.label}</span>
                  <h3>{item.label} design</h3>
                </div>
                {isSelected && <span className="design-selected-pill">Selected</span>}
              </div>

              <p className="form-note comparison-why">{item.why}</p>

              <div className="comparison-mini-stats">
                <div><span>Cost</span><strong>{money(d.cost_inr)}</strong></div>
                <div><span>Coldest hour</span><strong>{Number(d.comfort_coldest_hour_c).toFixed(1)}°C</strong></div>
                <div><span>Weight</span><strong>{Number(d.weight_kg).toFixed(0)} kg</strong></div>
                <div><span>Carbon</span><strong>{d.carbon_kgco2e == null ? 'Unknown' : `${Number(d.carbon_kgco2e).toFixed(0)} kgCO₂e`}</strong></div>
              </div>

              <div className="comparison-actions">
                <button
                  type="button"
                  className={isSelected ? 'primary-btn' : 'export-btn'}
                  onClick={() => setSelectedIndex(index)}
                >
                  {isSelected ? 'Selected' : 'Compare this'}
                </button>
                <button
                  type="button"
                  className="export-btn"
                  onClick={() => setThermalIndex(thermalIndex === index ? null : index)}
                >
                  {thermalIndex === index ? 'Hide thermal' : 'Thermal simulation'}
                </button>
              </div>

              {thermalIndex === index && (
                <DesignThermalPanel
                  siteId={siteId}
                  dayOfYear={run.day_of_year}
                  design={d}
                  context={run.context}
                />
              )}
            </article>
          );
        })}
      </section>

      <section className="config-form comparison-table-wrap">
        <div className="module-header" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Thermal verification</div>
            <h3 style={{ margin: '0.25rem 0 0' }}>Compare simulated performance</h3>
            <p className="form-note" style={{ margin: '0.35rem 0 0' }}>
              Runs the same 24-hour simulation for every generated design. These values are measured from the
              simulation response, not copied from optimizer objectives.
            </p>
          </div>
          <button type="button" className="primary-btn" onClick={runThermalComparison} disabled={thermalRunning}>
            {thermalRunning ? 'Simulating all designs…' : 'Run thermal comparison'}
          </button>
        </div>
        {thermalError && <p className="form-error">{thermalError}</p>}
        {Object.keys(thermalResults).length > 0 && (
          <div className="comparison-table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Thermal metric</th>
                  {candidates.map((item, index) => (
                    <th key={index} className={index === selectedIndex ? 'active-col' : ''}>{item.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Indoor minimum', 'min_indoor_temp_c', (v) => `${Number(v).toFixed(1)} °C`],
                  ['Indoor maximum', 'max_indoor_temp_c', (v) => `${Number(v).toFixed(1)} °C`],
                  ['Outdoor mean', '__outdoor_mean', (v) => `${Number(v).toFixed(1)} °C`],
                  ['Solar absorbed', 'solar_absorbed_kwh', (v) => `${Number(v).toFixed(1)} kWh`],
                  ['Total heat loss', '__heat_loss', (v) => `${Number(v).toFixed(1)} kWh`],
                  ['Wall U-value', 'wall_u_value_wm2k', (v) => `${Number(v).toFixed(2)} W/m²K`],
                  ['Safety', 'safety_passed', (v) => v ? 'Passed' : 'Check'],
                ].map(([label, key, format]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {candidates.map((item, index) => {
                      const result = thermalResults[designKey(item.design)];
                      let value = result?.[key];
                      if (key === '__outdoor_mean') {
                        const values = result?.outdoor_temp_c || [];
                        value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
                      }
                      if (key === '__heat_loss') {
                        value = Object.entries(result?.heat_flow_kwh || {})
                          .filter(([k]) => /loss/i.test(k))
                          .reduce((sum, [, v]) => sum + Math.abs(Number(v) || 0), 0);
                      }
                      return (
                        <td key={index} className={index === selectedIndex ? 'active-col' : ''}>
                          {value == null ? '—' : format(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="config-form comparison-table-wrap">
        <div className="module-header" style={{ marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Ready comparison</div>
            <h3 style={{ margin: '0.25rem 0 0' }}>Engineering metrics side by side</h3>
          </div>
          <span className="form-note">Click a design above to change the active selection.</span>
        </div>

        <div className="comparison-table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                {candidates.map((item, index) => (
                  <th key={index} className={index === selectedIndex ? 'active-col' : ''}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th>{row.label}</th>
                  {candidates.map((item, index) => (
                    <td key={index} className={index === selectedIndex ? 'active-col' : ''}>
                      {row.format(item.design[row.key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>Wall material</th>
                {candidates.map((item, index) => (
                  <td key={index} className={index === selectedIndex ? 'active-col' : ''}>
                    {materialName(item.design.wall_material_id)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Insulation</th>
                {candidates.map((item, index) => (
                  <td key={index} className={index === selectedIndex ? 'active-col' : ''}>
                    {materialName(item.design.insulation_material_id)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="config-form">
        <div className="eyebrow">Trade-off explorer</div>
        <h3 style={{ margin: '0.25rem 0 0.35rem' }}>Explore the full Pareto set</h3>
        <p className="form-note">
          This chart is an advanced view of the same physics-verified candidates. It is intentionally
          separated from the main Optimize screen so users can make a decision from cards and tables first.
        </p>
        <ParetoChart
          points={paretoPoints}
          selected={selectedPareto}
          onSelect={(design) => {
            const index = candidates.findIndex((x) => designKey(x.design) === designKey(design));
            if (index >= 0) setSelectedIndex(index);
          }}
        />
      </section>

      <section className="selected-design-strip">
        <div>
          <div className="eyebrow">Final candidate</div>
          <strong>{selected.label}</strong>
          <span>
            {money(selectedDesign.cost_inr)} · {Number(selectedDesign.comfort_coldest_hour_c).toFixed(1)}°C coldest hour ·
            {` ${Number(selectedDesign.weight_kg).toFixed(0)} kg`}
          </span>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={instantiating}
          onClick={() => onOpenDesign(selectedDesign, 'twin', selected.label)}
        >
          {instantiating ? 'Building model…' : 'Use this design →'}
        </button>
      </section>

      {instantiateError && <p className="form-error">{instantiateError}</p>}
    </div>
  );
}
