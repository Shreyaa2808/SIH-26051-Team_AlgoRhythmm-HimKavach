import { useState, useEffect } from 'react';

const SITES = [
  { id: 'leh', label: 'Leh' },
  { id: 'siachen', label: 'Siachen' },
  { id: 'dras', label: 'Dras' },
];

export default function RetrofitForm({ onResult }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasInsulation, setHasInsulation] = useState(false);

  const [form, setForm] = useState({
    site_id: 'leh',
    day_of_year: 15,
    floor_area_m2: '',
    ceiling_height_m: '',
    leakage_area_cm2: '',
    wall_material_id: '',
    wall_thickness_m: '',
    insulation_material_id: '',
    insulation_thickness_m: 0.0,
    sensible_heat_w: '',
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
      day_of_year: Number(form.day_of_year),
      floor_area_m2: Number(form.floor_area_m2),
      ceiling_height_m: Number(form.ceiling_height_m),
      leakage_area_cm2: Number(form.leakage_area_cm2),
      wall_thickness_m: Number(form.wall_thickness_m),
      sensible_heat_w: Number(form.sensible_heat_w),
      insulation_thickness_m: hasInsulation ? Number(form.insulation_thickness_m) : 0.0,
      insulation_material_id: hasInsulation ? form.insulation_material_id || null : null,
    };

    try {
      const res = await fetch('http://localhost:8000/retrofit/rank', {
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
  const insulationMaterials = materials.filter((m) => m.category === 'insulation');

  return (
    <form onSubmit={handleSubmit} className="config-form">
      <h2>Existing Shelter Details</h2>
      <p className="form-note">
        Retrofit mode describes a shelter that already exists — every field below is
        required, since there's nothing for an optimizer to fill in.
      </p>

      <label>
        Site
        <select value={form.site_id} onChange={(e) => handleChange('site_id', e.target.value)}>
          {SITES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>

      <label>
        Day of year (1-365)
        <input
          type="number" min="1" max="365"
          value={form.day_of_year}
          onChange={(e) => handleChange('day_of_year', e.target.value)}
        />
      </label>

      <label>
        Floor area (m²)
        <input
          type="number" required
          value={form.floor_area_m2}
          onChange={(e) => handleChange('floor_area_m2', e.target.value)}
        />
      </label>

      <label>
        Ceiling height (m)
        <input
          type="number" step="0.1" required
          value={form.ceiling_height_m}
          onChange={(e) => handleChange('ceiling_height_m', e.target.value)}
        />
      </label>

      <label>
        Leakage area (cm²)
        <input
          type="number" required
          value={form.leakage_area_cm2}
          onChange={(e) => handleChange('leakage_area_cm2', e.target.value)}
        />
      </label>

      <label>
        Current wall material
        <select
          required
          value={form.wall_material_id}
          onChange={(e) => handleChange('wall_material_id', e.target.value)}
        >
          <option value="" disabled>Select what the wall is actually made of</option>
          {structuralMaterials.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <label>
        Wall thickness (m)
        <input
          type="number" step="0.01" required
          value={form.wall_thickness_m}
          onChange={(e) => handleChange('wall_thickness_m', e.target.value)}
        />
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={hasInsulation}
          onChange={(e) => setHasInsulation(e.target.checked)}
        />
        Wall currently has insulation
      </label>

      {hasInsulation && (
        <>
          <label>
            Current insulation material
            <select
              value={form.insulation_material_id}
              onChange={(e) => handleChange('insulation_material_id', e.target.value)}
            >
              <option value="" disabled>Select existing insulation</option>
              {insulationMaterials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          <label>
            Insulation thickness (m)
            <input
              type="number" step="0.01"
              value={form.insulation_thickness_m}
              onChange={(e) => handleChange('insulation_thickness_m', e.target.value)}
            />
          </label>
        </>
      )}

      <label>
        Internal sensible heat load (W)
        <input
          type="number" required
          value={form.sensible_heat_w}
          onChange={(e) => handleChange('sensible_heat_w', e.target.value)}
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? 'Analyzing...' : 'Suggest Upgrades'}
      </button>

      {error && <p className="form-error">{error}</p>}
    </form>
  );
}