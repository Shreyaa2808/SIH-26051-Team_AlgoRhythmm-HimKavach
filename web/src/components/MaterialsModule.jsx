import { useState, useEffect } from 'react';

export default function MaterialsModule() {
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('http://localhost:8000/materials')
      .then((res) => res.json())
      .then(setMaterials);
  }, []);

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 3 · Thermo-Physical Materials Database</div>
          <h2>Materials Library</h2>
          <p>Thermal properties (k, ρ, cp), cost, and citation for every material in the design space.</p>
        </div>
        <input
          placeholder="Search material..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </div>

      <div className="materials-table-wrap config-form">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Category</th>
              <th>k (W/mK)</th>
              <th>ρ (kg/m³)</th>
              <th>Cp (J/kgK)</th>
              <th>Cost</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{m.category}</td>
                <td>{m.k}</td>
                <td>{m.rho}</td>
                <td>{m.cp}</td>
                <td>
                  {m.cost_per_m3_inr != null
                    ? `₹${m.cost_per_m3_inr}/m³`
                    : m.cost_per_m2_inr != null
                    ? `₹${m.cost_per_m2_inr}/m²`
                    : <span className="tag-imported">No data</span>}
                </td>
                <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  {m.citation ? m.citation.slice(0, 40) + '...' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}