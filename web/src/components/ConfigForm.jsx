import { useState, useEffect } from 'react';

export default function ConfigForm({ onResult, defaultSiteId, designDay }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    site_id: defaultSiteId || 'leh',
    wall_material_id: 'local_stone_masonry',
    insulation_material_id: 'expanded_polystyrene_eps',
    wall_thickness_m: 0.3,
    insulation_thickness_m: 0.1,
    floor_area_m2: 16.0,
    ceiling_height_m: 2.4,
    night_gate_enabled: false,
  });

  useEffect(() => {
    fetch('http://localhost:8000/materials')
      .then((res) => res.json())
      .then(setMaterials)
      .catch((err) => setError('Could not load materials: ' + err.message));
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      ...form,
      design_day: designDay,
    };

    try {
      const res = await fetch('http://localhost:8000/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      onResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const structuralMaterials = materials.filter(
    (m) => m.category && m.category.includes('structural')
  );
  const insulationMaterials = materials.filter(
    (m) => m.category === 'insulation'
  );

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <h2>Shelter Configuration</h2>
      <p className="form-note">
        Design day: <strong>{designDay?.replaceAll('_', ' ') || 'not selected'}</strong> — change it from the
        Climate Engine tab.
      </p>

      <p className="form-note">
        Site: <strong>{form.site_id}</strong> — chosen on the map/coordinates screen; go back to
        change it.
      </p>

      <label>
        Wall material
        <select
          value={form.wall_material_id}
          onChange={(e) => handleChange('wall_material_id', e.target.value)}
        >
          {structuralMaterials.length === 0 && (
            <option value={form.wall_material_id}>{form.wall_material_id}</option>
          )}
          {structuralMaterials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Wall thickness (m)
        <input
          type="number"
          step="0.01"
          value={form.wall_thickness_m}
          onChange={(e) => handleChange('wall_thickness_m', Number(e.target.value))}
        />
      </label>

      <label>
        Insulation material
        <select
          value={form.insulation_material_id}
          onChange={(e) => handleChange('insulation_material_id', e.target.value)}
        >
          {insulationMaterials.length === 0 && (
            <option value={form.insulation_material_id}>
              {form.insulation_material_id}
            </option>
          )}
          {insulationMaterials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Insulation thickness (m)
        <input
          type="number"
          step="0.01"
          value={form.insulation_thickness_m}
          onChange={(e) =>
            handleChange('insulation_thickness_m', Number(e.target.value))
          }
        />
      </label>

      <label>
        Floor area (m²)
        <input
          type="number"
          value={form.floor_area_m2}
          onChange={(e) => handleChange('floor_area_m2', Number(e.target.value))}
        />
      </label>

      <label>
        Ceiling height (m)
        <input
          type="number"
          step="0.1"
          value={form.ceiling_height_m}
          onChange={(e) => handleChange('ceiling_height_m', Number(e.target.value))}
        />
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={form.night_gate_enabled}
          onChange={(e) => handleChange('night_gate_enabled', e.target.checked)}
        />
        Enable Adaptive Night Gate (closes envelope at night, reopens by day)
      </label>

      <button type="submit" disabled={loading}>
        {loading ? 'Simulating...' : 'Simulate'}
      </button>

      {error && <p className="form-error">{error}</p>}
    </form>
  );
}