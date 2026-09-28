import { useMemo, useState } from 'react';
import ParetoChart from './ParetoChart';

const money = (v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

function Card({ tag, tagClass, title, d, selected, onSelect, onUseInSandbox }) {
  return (
    <div
      className={`pareto-card ${tagClass === 'balanced-tag' ? 'balanced' : ''}`}
      onClick={() => onSelect(d)}
      style={{
        cursor: 'pointer',
        outline: selected ? '2px solid var(--text)' : 'none',
        outlineOffset: 2,
      }}
    >
      <span className={`pareto-tag ${tagClass}`}>{tag}</span>
      <h3>{title}</h3>
      <div className="pareto-stats">
        <div><span>Capital Cost</span><strong>{money(d.cost_inr)}</strong></div>
        <div><span>Weight</span><strong>{d.weight_kg.toFixed(0)} kg</strong></div>
        <div><span>Coldest Hour</span><strong>{d.comfort_coldest_hour_c.toFixed(1)}°C</strong></div>
        <div>
          <span>Carbon</span>
          <strong>{d.carbon_kgco2e != null ? `${d.carbon_kgco2e.toFixed(0)} kgCO₂e` : '—'}</strong>
        </div>
      </div>
      <p className="spec-line"><strong>Wall:</strong> {d.wall_material_id.replaceAll('_', ' ')} ({d.wall_thickness_m.toFixed(2)}m)</p>
      <p className="spec-line"><strong>Insulation:</strong> {d.insulation_material_id.replaceAll('_', ' ')} ({d.insulation_thickness_m.toFixed(2)}m)</p>
      <p className="spec-line">{d.safety_passed ? '✅ Safety passed' : '❌ Safety failed'}</p>
      {onUseInSandbox && (
        <button
          type="button"
          className="use-in-sandbox-btn"
          onClick={(e) => {
            e.stopPropagation();
            onUseInSandbox(d);
          }}
        >
          🏘️ Use in Bulk / Sandbox →
        </button>
      )}
    </div>
  );
}

function SearchOptions({ options, onOptionsChange, onRerun, running, canRun }) {
  const set = (patch) => onOptionsChange({ ...options, ...patch });
  return (
    <div className="config-form" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginTop: 0 }}>Search options</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', alignItems: 'flex-end' }}>
        <label>
          <input
            type="checkbox"
            checked={options.optimizeRoofSlope}
            onChange={(e) => set({ optimizeRoofSlope: e.target.checked })}
          />{' '}
          Let optimizer choose roof slope (5–45°)
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.optimizeCeilingHeight}
            onChange={(e) => set({ optimizeCeilingHeight: e.target.checked })}
          />{' '}
          Let optimizer choose ceiling height (2.2–3.0 m)
        </label>
        <label>
          Ground snow load (kPa)
          <br />
          <input
            type="number"
            min="0"
            step="0.1"
            value={options.groundSnowKpa}
            onChange={(e) => set({ groundSnowKpa: e.target.value })}
            style={{ width: 110 }}
          />
        </label>
        <label>
          Max roof snow load (kPa)
          <br />
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="no limit"
            value={options.maxSnowKpa}
            onChange={(e) => set({ maxSnowKpa: e.target.value })}
            style={{ width: 110 }}
          />
        </label>
        <button
          type="button"
          className="primary-btn"
          onClick={onRerun}
          disabled={running || !canRun}
        >
          {running ? 'Optimizing…' : 'Run optimizer'}
        </button>
      </div>
      <p className="form-note" style={{ marginBottom: 0 }}>
        Snow load uses the simple IS 875 (Part 4) monopitch shape coefficient (0.8 up to 30°, tapering to
        0 at 60°) applied to the ground snow load you enter. It is a screening check, not a structural
        design — verify against the current code edition. With no limit set, snow load is reported but
        never rejects a design.
      </p>
    </div>
  );
}

export default function OptimizeModule({
  data,
  error,
  running,
  canRun,
  options,
  onOptionsChange,
  onRerun,
  onExportCSV,
  onExportPDF,
  onUseInSandbox,
  onOpenDesign,
  instantiating,
  instantiateError,
}) {
  const [picked, setPicked] = useState(null);

  const analysis = useMemo(() => {
    if (!data?.pareto_front?.length) return null;
    const front = data.pareto_front;
    const sorted = [...front].sort((a, b) => a.cost_inr - b.cost_inr);
    const cheapest = sorted[0];
    const maxPerf = [...front].sort(
      (a, b) => b.comfort_coldest_hour_c - a.comfort_coldest_hour_c
    )[0];
    const withCarbon = front.filter((d) => d.carbon_kgco2e != null);
    const lowestCarbon = withCarbon.length
      ? [...withCarbon].sort((a, b) => a.carbon_kgco2e - b.carbon_kgco2e)[0]
      : null;
    const balanced =
      front.find((d) => d !== cheapest && d !== maxPerf && d !== lowestCarbon) ||
      front[Math.floor(front.length / 2)];
    return { sorted, cheapest, maxPerf, lowestCarbon, balanced };
  }, [data]);

  const controls = (
    <SearchOptions
      options={options}
      onOptionsChange={onOptionsChange}
      onRerun={onRerun}
      running={running}
      canRun={canRun}
    />
  );

  if (!data || !analysis) {
    return (
      <div>
        {error && <p className="form-error">{error}</p>}
        {!data && !error && (
          <p className="form-note">
            {canRun
              ? 'Set your search options below and run the optimizer, or use "Optimize This Design" from the Simulate tab.'
              : 'Pick a location on the Micro-Siting tab first, then run the optimizer.'}
          </p>
        )}
        {controls}
      </div>
    );
  }

  const { sorted, cheapest, maxPerf, lowestCarbon, balanced } = analysis;
  // a stale pick from a previous run is not in this front → fall back
  const selected = picked && data.pareto_front.includes(picked) ? picked : balanced;

  const labelFor = (d) => {
    if (d === cheapest) return 'Cheapest';
    if (d === balanced) return 'Balanced';
    if (d === maxPerf) return 'Max Performance';
    if (d === lowestCarbon) return 'Lowest Carbon';
    return 'Custom pick';
  };

  const showSlope = data.context?.optimize_roof_slope || selected.roof_slope_deg > 0;
  const showHeight = data.context?.optimize_ceiling_height;
  const snowLimit = data.context?.max_roof_snow_load_kpa;

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 5 · Multi-Objective Pareto Results</div>
          <h2>Pareto-Optimized Shelter Designs</h2>
          <p>{data.note}</p>
        </div>
        <div className="export-btns">
          <button className="export-btn" onClick={onExportCSV}>⬇ Export CSV</button>
          <button className="export-btn primary" onClick={onExportPDF}>📄 Download PDF</button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="config-form" style={{ marginBottom: '1.5rem' }}>
        <ParetoChart points={sorted} selected={selected} onSelect={setPicked} />
      </div>

      <div className="config-form" style={{ marginBottom: '1.5rem' }}>
        <div className="eyebrow">Selected design · {labelFor(selected)}</div>
        <div className="pareto-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div><span>Capital Cost</span><strong>{money(selected.cost_inr)}</strong></div>
          <div><span>Coldest Hour</span><strong>{selected.comfort_coldest_hour_c.toFixed(1)}°C</strong></div>
          <div><span>Weight</span><strong>{selected.weight_kg.toFixed(0)} kg</strong></div>
          <div>
            <span>Carbon</span>
            <strong>{selected.carbon_kgco2e != null ? `${selected.carbon_kgco2e.toFixed(0)} kgCO₂e` : '—'}</strong>
          </div>
          {showSlope && (
            <div><span>Roof slope</span><strong>{selected.roof_slope_deg.toFixed(0)}°</strong></div>
          )}
          {showHeight && (
            <div><span>Ceiling height</span><strong>{selected.ceiling_height_m.toFixed(2)} m</strong></div>
          )}
          {(data.context?.ground_snow_load_kpa ?? 0) > 0 && (
            <div>
              <span>Roof snow load{snowLimit != null ? ` (limit ${snowLimit})` : ''}</span>
              <strong>{selected.roof_snow_load_kpa.toFixed(2)} kPa</strong>
            </div>
          )}
        </div>
        <p className="spec-line">
          <strong>Wall:</strong> {selected.wall_material_id.replaceAll('_', ' ')} ({selected.wall_thickness_m.toFixed(2)}m)
          {' · '}
          <strong>Insulation:</strong> {selected.insulation_material_id.replaceAll('_', ' ')} ({selected.insulation_thickness_m.toFixed(2)}m)
          {' · '}
          <strong>Leakage:</strong> {selected.leakage_area_cm2.toFixed(0)} cm²
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', marginTop: '0.8rem' }}>
          <button
            type="button"
            className="primary-btn"
            disabled={instantiating}
            onClick={() => onOpenDesign(selected, 'twin', labelFor(selected))}
          >
            {instantiating ? 'Building model…' : 'Open in 3D twin →'}
          </button>
          <button
            type="button"
            className="export-btn"
            disabled={instantiating}
            onClick={() => onOpenDesign(selected, 'blueprint', labelFor(selected))}
          >
            Open blueprint →
          </button>
          {onUseInSandbox && (
            <button type="button" className="export-btn" onClick={() => onUseInSandbox(selected)}>
              🏘️ Use in Bulk / Sandbox →
            </button>
          )}
        </div>
        {instantiateError && <p className="form-error">{instantiateError}</p>}
        <p className="form-note" style={{ marginBottom: 0 }}>
          Opening builds a real per-wall shelter model from this design (square footprint, same
          construction on every wall, roof and floor, no windows — exactly what the optimizer
          simulated) and saves it as a project.
        </p>
      </div>

      <div className="pareto-grid">
        <Card tag="Cheapest" tagClass="cheapest" title="Lowest Capital Cost Design" d={cheapest}
          selected={selected === cheapest} onSelect={setPicked} onUseInSandbox={onUseInSandbox} />
        <Card tag="Balanced" tagClass="balanced-tag" title="Balanced Cost/Comfort Design" d={balanced}
          selected={selected === balanced} onSelect={setPicked} onUseInSandbox={onUseInSandbox} />
        <Card tag="Max Performance" tagClass="max" title="Maximum Comfort Design" d={maxPerf}
          selected={selected === maxPerf} onSelect={setPicked} onUseInSandbox={onUseInSandbox} />
        {lowestCarbon && (
          <Card tag="Lowest Carbon" tagClass="cheapest" title="Lowest Embodied Carbon Design" d={lowestCarbon}
            selected={selected === lowestCarbon} onSelect={setPicked} onUseInSandbox={onUseInSandbox} />
        )}
      </div>

      {controls}
    </div>
  );
}
