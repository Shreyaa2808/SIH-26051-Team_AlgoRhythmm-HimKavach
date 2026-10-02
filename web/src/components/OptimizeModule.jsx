import { useMemo, useState } from 'react';
import ParetoChart from './ParetoChart';
import DesignThermalPanel from './DesignThermalPanel';
import { simulateDesign } from '../project/actions';

const money = (v) => `₹${Number(v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const titleCase = (s) => (s ? s.replaceAll('_', ' ') : '—');
const materialName = (v) => titleCase(v);
const designKey = (d) => [
  d?.wall_material_id, d?.insulation_material_id,
  Number(d?.wall_thickness_m ?? 0).toFixed(5),
  Number(d?.insulation_thickness_m ?? 0).toFixed(5),
  Number(d?.leakage_area_cm2 ?? 0).toFixed(3),
  Number(d?.roof_slope_deg ?? 0).toFixed(3),
  Number(d?.ceiling_height_m ?? 0).toFixed(3),
].join('|');

function DesignCard({ item, selected, onSelect, onUseInSandbox, siteId, dayOfYear, context }) {
  const [showThermal, setShowThermal] = useState(false);
  const d = item.design ?? item;

  return (
    <article
      className={`pareto-card ${selected ? 'balanced' : ''}`}
      style={{ cursor: 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <span className="pareto-tag balanced-tag">{item.label || 'Design option'}</span>
          <h3>{item.label ? `${item.label} design` : 'Design option'}</h3>
        </div>
        {selected && <span className="design-selected-pill">Selected</span>}
      </div>

      <p className="form-note" style={{ minHeight: 42, margin: '0.25rem 0 0.8rem' }}>
        {item.why || 'Physics-verified option from the feasible design set.'}
      </p>

      <div className="pareto-stats">
        <div><span>Material cost</span><strong>{money(d.cost_inr)}</strong></div>
        <div><span>Coldest hour</span><strong>{Number(d.comfort_coldest_hour_c).toFixed(1)}°C</strong></div>
        <div><span>Envelope weight</span><strong>{Number(d.weight_kg).toFixed(0)} kg</strong></div>
        <div><span>Embodied carbon</span><strong>{d.carbon_kgco2e != null ? `${Number(d.carbon_kgco2e).toFixed(0)} kgCO₂e` : 'Unknown'}</strong></div>
      </div>

      <div className="design-spec-grid">
        <div><span>Wall</span><strong>{titleCase(d.wall_material_id)}</strong></div>
        <div><span>Insulation</span><strong>{titleCase(d.insulation_material_id)}</strong></div>
        <div><span>Wall thickness</span><strong>{Number(d.wall_thickness_m).toFixed(2)} m</strong></div>
        <div><span>Insulation thickness</span><strong>{Number(d.insulation_thickness_m).toFixed(2)} m</strong></div>
        <div><span>Roof slope</span><strong>{Number(d.roof_slope_deg ?? 0).toFixed(0)}°</strong></div>
        <div><span>Wall U-value</span><strong>{Number(d.wall_u_value_wm2k ?? 0).toFixed(2)} W/m²K</strong></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className={selected ? 'primary-btn' : 'export-btn'}
          onClick={() => onSelect(item)}
        >
          {selected ? 'Selected for comparison' : 'Select design'}
        </button>
        <button
          type="button"
          className="export-btn"
          onClick={() => setShowThermal((v) => !v)}
        >
          {showThermal ? 'Hide thermal simulation' : 'View thermal simulation'}
        </button>
        {onUseInSandbox && (
          <button type="button" className="export-btn" onClick={() => onUseInSandbox(d)}>
            Use in Sandbox →
          </button>
        )}
      </div>

      {showThermal && (
        <DesignThermalPanel
          siteId={siteId}
          dayOfYear={dayOfYear}
          design={d}
          context={context}
        />
      )}
    </article>
  );
}

function SearchOptions({ options, onOptionsChange, onRerun, running, canRun }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onOptionsChange({ ...options, ...patch });

  return (
    <section className="config-form optimization-controls">
      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <strong>Advanced engineering constraints</strong>
          <small>Optional controls for roof geometry and snow-load screening</small>
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="advanced-panel">
          <div className="optimization-scope-note">
            <strong>Fixed from the shelter brief</strong>
            <span>Geometry, occupancy/load assumptions, orientation and opening configuration stay fixed during this run.</span>
          </div>
          <div className="optimization-control-grid">
            <label>
              <input
                type="checkbox"
                checked={options.optimizeRoofSlope}
                onChange={(e) => set({ optimizeRoofSlope: e.target.checked })}
              />{' '}
              Let optimizer vary roof slope (5–45°)
            </label>

            <label>
              <input
                type="checkbox"
                checked={options.optimizeCeilingHeight}
                onChange={(e) => set({ optimizeCeilingHeight: e.target.checked })}
              />{' '}
              Let optimizer vary ceiling height (2.2–3.0 m)
            </label>

            <label>
              Ground snow load (kPa)
              <input
                type="number"
                min="0"
                step="0.1"
                value={options.groundSnowKpa}
                onChange={(e) => set({ groundSnowKpa: e.target.value })}
              />
            </label>

            <label>
              Maximum roof snow load (kPa)
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="No limit"
                value={options.maxSnowKpa}
                onChange={(e) => set({ maxSnowKpa: e.target.value })}
              />
            </label>
          </div>

          <p className="form-note">
            These are screening controls, not structural design checks. The optimizer searches the envelope variables
            exposed by the engineering model while keeping the user's baseline shelter configuration fixed. Every returned
            design is then independently simulatable from its own parameters.
          </p>
          <p className="form-note">
            These controls do not replace a structural code check. The optimizer still physics-verifies
            every design returned to the user. Materials, wall/insulation thickness and envelope leakage are
            already part of the optimization search space.
          </p>

          <button type="button" className="primary-btn" onClick={onRerun} disabled={running || !canRun}>
            {running ? 'Optimizing…' : 'Re-run with these constraints'}
          </button>
        </div>
      )}
    </section>
  );
}

function metricRows() {
  return [
    { label: 'Material cost', key: 'cost_inr', format: money },
    { label: 'Coldest indoor hour', key: 'comfort_coldest_hour_c', format: (v) => `${Number(v).toFixed(1)} °C` },
    { label: 'Envelope weight', key: 'weight_kg', format: (v) => `${Number(v).toFixed(0)} kg` },
    { label: 'Embodied carbon', key: 'carbon_kgco2e', format: (v) => (v == null ? 'Unknown' : `${Number(v).toFixed(0)} kgCO₂e`) },
    { label: 'Wall U-value', key: 'wall_u_value_wm2k', format: (v) => `${Number(v).toFixed(2)} W/m²K` },
    { label: 'Wall thickness', key: 'wall_thickness_m', format: (v) => `${Number(v).toFixed(2)} m` },
    { label: 'Insulation thickness', key: 'insulation_thickness_m', format: (v) => `${Number(v).toFixed(2)} m` },
    { label: 'Roof slope', key: 'roof_slope_deg', format: (v) => `${Number(v ?? 0).toFixed(0)}°` },
  ];
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
  onUseInSandbox,
  siteId,
  onOpenDesign,
  instantiating,
  instantiateError,
}) {
  const curated = useMemo(
    () => (data?.curated_designs || []).filter((item) => item?.design),
    [data]
  );
  const explore = useMemo(() => data?.explore_more || [], [data]);
  // A Pareto-chart point that is not in the curated/explore lists is kept here
  // so clicking ANY dot updates the details below.
  const [pickedPoint, setPickedPoint] = useState(null);
  const candidates = useMemo(() => [
    ...curated,
    ...explore.map((design, i) => ({
      label: `Design ${i + 1}`,
      why: 'Additional feasible design from the same optimization run.',
      design,
    })),
    ...(pickedPoint
      ? [{
          label: 'Pareto point',
          why: 'Design picked directly from the Pareto chart.',
          design: pickedPoint,
        }]
      : []),
  ], [curated, explore, pickedPoint]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [thermalIndex, setThermalIndex] = useState(null);
  const [thermalResults, setThermalResults] = useState({});
  const [thermalRunning, setThermalRunning] = useState(false);
  const [thermalError, setThermalError] = useState(null);

  const activeIndex = candidates.length ? Math.min(selectedIndex, candidates.length - 1) : 0;
  const selected = candidates[activeIndex] || null;

  const selectCandidate = (item) => {
    const index = candidates.findIndex((x) => x === item || designKey(x.design) === designKey(item.design ?? item));
    if (index >= 0) setSelectedIndex(index);
  };

  const runThermalComparison = async () => {
    if (!data?.context || !siteId || !candidates.length) return;
    setThermalRunning(true);
    setThermalError(null);
    try {
      const results = await Promise.all(
        candidates.map((item) => simulateDesign({
          siteId,
          dayOfYear: data.day_of_year,
          design: item.design,
          context: data.context,
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

  const openSelected = () => {
    if (selected?.design && onOpenDesign) {
      onOpenDesign(selected.design, 'twin', selected.label || 'Design option');
    }
  };

  if (!data || !selected) {
    return (
      <div>
        {error && <p className="form-error">{error}</p>}
        {!data && !error && (
          <p className="form-note">
            {canRun
              ? 'The baseline is ready. Review optional constraints below, then run the optimizer.'
              : 'Complete the site and baseline steps first.'}
          </p>
        )}
        <SearchOptions
          options={options}
          onOptionsChange={onOptionsChange}
          onRerun={onRerun}
          running={running}
          canRun={canRun}
        />
      </div>
    );
  }

  const paretoPoints = data.pareto_front || [];
  const selectedPareto = paretoPoints.find((d) => designKey(d) === designKey(selected.design)) || selected.design;

  return (
    <div className="comparison-page">
      {error && <p className="form-error">{error}</p>}

      <section className="optimization-intro">
        <div>
          <div className="eyebrow">Decision support · physics-verified candidates</div>
          <h2>Choose a shelter strategy</h2>
          <p>
            HimKavach searches material, thickness and envelope configurations, removes designs that fail
            the safety interlock, and presents a small set of distinct trade-offs instead of making you
            interpret a raw optimization plot.
          </p>
        </div>
        <div className="optimization-objectives">
          <span>Thermal comfort</span>
          <span>Material cost</span>
          <span>Envelope weight</span>
          <span>Carbon reported</span>
        </div>
      </section>

      <SearchOptions
        options={options}
        onOptionsChange={onOptionsChange}
        onRerun={onRerun}
        running={running}
        canRun={canRun}
      />

      <div className="module-header" style={{ marginTop: '1.25rem' }}>
        <div>
          <div className="eyebrow">Recommended options</div>
          <h2>{curated.length} design paths to compare</h2>
          <p className="form-note" style={{ margin: '0.4rem 0 0' }}>
            Each card is a real candidate from the optimizer's feasible Pareto set. The labels describe a
            trade-off; they are not a universal ranking.
          </p>
        </div>
        <div className="export-btns">
          <button className="export-btn" onClick={onExportCSV}>⬇ Export CSV</button>
          <button
            className="export-btn primary"
            onClick={() => {
              const old = document.title;
              document.title = 'HimKavach-Optimization-Report';
              window.print();
              document.title = old;
            }}
          >
            Download PDF
          </button>
        </div>
      </div>

      <div className="pareto-grid">
        {curated.map((item, i) => (
          <DesignCard
            key={`${item.label}-${i}`}
            item={item}
            selected={selected === item}
            onSelect={selectCandidate}
            onUseInSandbox={onUseInSandbox}
            siteId={siteId}
            dayOfYear={data.day_of_year}
            context={data.context}
          />
        ))}
      </div>

      {explore.length > 0 && (
        <section className="config-form" style={{ marginTop: '1.5rem' }}>
          <div className="eyebrow">Additional feasible options</div>
          <h3 style={{ margin: '0.25rem 0 0.3rem' }}>Explore more designs</h3>
          <p className="form-note">
            These are additional physics-verified points from the same feasible front. Selecting one also updates the
            comparison tables and final candidate below.
          </p>
          <div className="explore-list">
            {explore.map((d, i) => {
              const item = candidates[curated.length + i];
              return (
                <button
                  type="button"
                  className="explore-row"
                  key={`${d.wall_material_id}-${d.insulation_material_id}-${i}`}
                  onClick={() => selectCandidate(item)}
                >
                  <span>{titleCase(d.wall_material_id)} + {titleCase(d.insulation_material_id)}</span>
                  <span>{money(d.cost_inr)} · {Number(d.comfort_coldest_hour_c).toFixed(1)}°C · {Number(d.weight_kg).toFixed(0)} kg</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* The former Compare step now lives directly inside Optimize. Nothing from the decision workspace is lost. */}
      <section className="comparison-hero" style={{ marginTop: 16 }}>
        <div>
          <div className="eyebrow">Decision workspace · now part of Optimize</div>
          <h2>Compare the generated designs</h2>
          <p>
            Compare the same engineering metrics across every generated candidate, inspect thermal simulations,
            explore the full Pareto front, and instantiate one design for the Digital Twin — without leaving Optimize.
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
          const isSelected = index === activeIndex;
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
                  dayOfYear={data.day_of_year}
                  design={d}
                  context={data.context}
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
                    <th key={index} className={index === activeIndex ? 'active-col' : ''}>{item.label}</th>
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
                        <td key={index} className={index === activeIndex ? 'active-col' : ''}>
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
                  <th key={index} className={index === activeIndex ? 'active-col' : ''}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricRows().map((row) => (
                <tr key={row.key}>
                  <th>{row.label}</th>
                  {candidates.map((item, index) => (
                    <td key={index} className={index === activeIndex ? 'active-col' : ''}>
                      {row.format(item.design[row.key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>Wall material</th>
                {candidates.map((item, index) => (
                  <td key={index} className={index === activeIndex ? 'active-col' : ''}>
                    {materialName(item.design.wall_material_id)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Insulation</th>
                {candidates.map((item, index) => (
                  <td key={index} className={index === activeIndex ? 'active-col' : ''}>
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
          This chart is an advanced view of the same physics-verified candidates. It is kept inside Optimize so
          optimization, comparison and final selection are one continuous engineering workflow.
        </p>
        <ParetoChart
          points={paretoPoints}
          selected={selectedPareto}
          onSelect={(design) => {
            const baseCount = curated.length + explore.length;
            const index = candidates
              .slice(0, baseCount)
              .findIndex((x) => designKey(x.design) === designKey(design));
            if (index >= 0) {
              setSelectedIndex(index);
            } else {
              setPickedPoint(design);
              setSelectedIndex(baseCount);
            }
          }}
        />
      </section>

      <section className="selected-design-strip">
        <div>
          <div className="eyebrow">Final candidate</div>
          <strong>{selected.label}</strong>
          <span>
            {money(selected.design.cost_inr)} · {Number(selected.design.comfort_coldest_hour_c).toFixed(1)}°C coldest hour ·
            {` ${Number(selected.design.weight_kg).toFixed(0)} kg`}
            {selected.design.carbon_kgco2e != null
              ? ` · ${Number(selected.design.carbon_kgco2e).toFixed(0)} kgCO₂e`
              : ''}
          </span>
          <span>
            {titleCase(selected.design.wall_material_id)} + {titleCase(selected.design.insulation_material_id)} ·
            {` wall ${Number(selected.design.wall_thickness_m).toFixed(2)} m`} ·
            {` insulation ${Number(selected.design.insulation_thickness_m).toFixed(2)} m`} ·
            {` roof ${Number(selected.design.roof_slope_deg ?? 0).toFixed(0)}°`}
          </span>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={instantiating || !onOpenDesign}
          onClick={openSelected}
        >
          {instantiating ? 'Building model…' : 'Use this design →'}
        </button>
      </section>

      {instantiateError && <p className="form-error">{instantiateError}</p>}
    </div>
  );
}