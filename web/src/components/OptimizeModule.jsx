export default function OptimizeModule({ data, onExportCSV, onExportPDF, onUseInSandbox }) {
  if (!data) return <p className="form-note">Run "Optimize This Design" from the Simulate tab first.</p>;

  const sorted = [...data.pareto_front].sort((a, b) => a.cost_inr - b.cost_inr);
  const cheapest = sorted[0];
  const maxPerf = [...data.pareto_front].sort(
    (a, b) => b.comfort_coldest_hour_c - a.comfort_coldest_hour_c
  )[0];
  const hasCarbon = data.pareto_front.some((d) => d.carbon_kgco2e != null);
  const lowestCarbon = hasCarbon
    ? [...data.pareto_front]
        .filter((d) => d.carbon_kgco2e != null)
        .sort((a, b) => a.carbon_kgco2e - b.carbon_kgco2e)[0]
    : null;
  const balanced =
    data.pareto_front.find((d) => d !== cheapest && d !== maxPerf && d !== lowestCarbon) ||
    data.pareto_front[Math.floor(data.pareto_front.length / 2)];

  const Card = ({ tag, tagClass, title, d }) => (
    <div className={`pareto-card ${tagClass === 'balanced-tag' ? 'balanced' : ''}`}>
      <span className={`pareto-tag ${tagClass}`}>{tag}</span>
      <h3>{title}</h3>
      <div className="pareto-stats">
        <div><span>Capital Cost</span><strong>₹{d.cost_inr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
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
        <button type="button" className="use-in-sandbox-btn" onClick={() => onUseInSandbox(d)}>
          🏘️ Use in Bulk / Sandbox →
        </button>
      )}
    </div>
  );

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

      <div className="pareto-grid">
        <Card tag="Cheapest" tagClass="cheapest" title="Lowest Capital Cost Design" d={cheapest} />
        <Card tag="Balanced" tagClass="balanced-tag" title="Balanced Cost/Comfort Design" d={balanced} />
        <Card tag="Max Performance" tagClass="max" title="Maximum Comfort Design" d={maxPerf} />
        {lowestCarbon && (
          <Card tag="Lowest Carbon" tagClass="cheapest" title="Lowest Embodied Carbon Design" d={lowestCarbon} />
        )}
      </div>
    </div>
  );
}