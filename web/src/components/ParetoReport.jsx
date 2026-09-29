import { createPortal } from "react-dom";

const n = (v, d = 0) => (v == null ? "n/a" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }));
const name = (s) => (s ? s.replaceAll("_", " ") : "");

export default function ParetoReport({ station, designDay, curated = [], frontCount = 0 }) {
  const today = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return createPortal(
    <div className="print-report">
      <header className="pr-head">
        <div>
          <div className="pr-eyebrow">HimKavach · Module 5</div>
          <h1>Pareto-Optimized Shelter Designs</h1>
        </div>
        <div className="pr-date">{today}</div>
      </header>

      <table className="pr-meta">
        <tbody>
          {station && <tr><th>Station</th><td>{station}</td></tr>}
          {designDay && <tr><th>Design day</th><td>{name(designDay)}</td></tr>}
          <tr><th>Designs on Pareto front</th><td>{frontCount}</td></tr>
        </tbody>
      </table>

      <h2>1. Summary of recommended designs</h2>
      <table className="pr-table">
        <thead>
          <tr>
            <th>Design</th><th>Cost (₹)</th><th>Coldest hr (°C)</th>
            <th>Weight (kg)</th><th>Carbon (kgCO₂e)</th>
          </tr>
        </thead>
        <tbody>
          {curated.map((d, i) => (
            <tr key={i}>
              <td>{d.label}</td>
              <td>{n(d.cost_inr)}</td>
              <td>{n(d.comfort_coldest_hour_c, 1)}</td>
              <td>{n(d.weight_kg)}</td>
              <td>{n(d.carbon_kgco2e)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>2. Construction details</h2>
      {curated.map((d, i) => (
        <section className="pr-design" key={i}>
          <h3>{d.label}</h3>
          <p><strong>Wall:</strong> {name(d.wall_material_id)} ({n(d.wall_thickness_m, 2)} m)</p>
          <p><strong>Insulation:</strong> {name(d.insulation_material_id)} ({n(d.insulation_thickness_m, 2)} m)</p>
          <p><strong>Safety check:</strong> {d.safety_passed ? "Passed" : "Failed"}</p>
        </section>
      ))}

      <h2>Notes</h2>
      <ul className="pr-notes">
        <li>Carbon is reported only; the optimizer searches on comfort, cost and weight.</li>
        <li>"n/a" means no carbon figure is on file for a material. It does not mean zero.</li>
        <li>Snow load follows a simple IS 875 (Part 4) screening check, not a structural design.</li>
      </ul>
    </div>,
    document.body
  );
}