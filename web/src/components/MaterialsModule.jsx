import { useState, useEffect } from 'react';

import { API } from '../api';
const EMPTY_FORM = {
  id: '', name: '', category: 'insulation', k: '', rho: '', cp: '',
  cost_per_m3_inr: '', cost_per_m2_inr: '', cost_note: '', citation: '',
  availability: 'regional', logistics_note: '',
};

const AVAILABILITY_LABEL = {
  local: 'Local', regional: 'Regional', imported: 'Imported', fabricated_onsite: 'Fabricated on-site',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export default function MaterialsModule() {
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // null = not editing, 'NEW' = add form
  const [form, setForm] = useState(EMPTY_FORM);

  const load = () => {
    fetch(`${API}/materials`)
      .then((res) => res.json())
      .then(setMaterials)
      .catch((err) => setError('Could not load materials: ' + err.message));
  };

  useEffect(load, []);

  const filtered = materials.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (m) => {
    setEditingId(m.id);
    setForm({
      id: m.id, name: m.name, category: m.category, k: m.k, rho: m.rho, cp: m.cp,
      cost_per_m3_inr: m.cost_per_m3_inr ?? '', cost_per_m2_inr: m.cost_per_m2_inr ?? '',
      cost_note: m.cost_note ?? '', citation: m.citation ?? '',
      availability: m.availability ?? 'regional', logistics_note: m.logistics_note ?? '',
    });
  };

  const startNew = () => {
    setEditingId('NEW');
    setForm(EMPTY_FORM);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const numOrNull = (v) => (v === '' || v === null ? null : Number(v));

  const save = async () => {
    setError(null);
    const isNew = editingId === 'NEW';
    const payload = {
      ...(isNew ? { id: form.id } : {}),
      name: form.name,
      category: form.category,
      k: Number(form.k),
      rho: Number(form.rho),
      cp: Number(form.cp),
      cost_per_m3_inr: numOrNull(form.cost_per_m3_inr),
      cost_per_m2_inr: numOrNull(form.cost_per_m2_inr),
      cost_note: form.cost_note,
      citation: form.citation,
      availability: form.availability,
      logistics_note: form.logistics_note,
    };
    try {
      const url = isNew
        ? `${API}/materials`
        : `${API}/materials/${editingId}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed: ${res.status}`);
      }
      cancel();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(`Delete material "${id}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`${API}/materials/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed: ${res.status}`);
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const renderForm = () => (
    <div className="config-form" style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border, #333)' }}>
      <div className="stat-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {editingId === 'NEW' && (
          <input placeholder="id (slug, e.g. local_granite)" value={form.id}
                 onChange={(e) => setForm({ ...form, id: e.target.value })} />
        )}
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="k (W/mK)" type="number" step="any" value={form.k} onChange={(e) => setForm({ ...form, k: e.target.value })} />
        <input placeholder="ρ (kg/m³)" type="number" step="any" value={form.rho} onChange={(e) => setForm({ ...form, rho: e.target.value })} />
        <input placeholder="Cp (J/kgK)" type="number" step="any" value={form.cp} onChange={(e) => setForm({ ...form, cp: e.target.value })} />
        <input placeholder="Cost ₹/m³" type="number" step="any" value={form.cost_per_m3_inr} onChange={(e) => setForm({ ...form, cost_per_m3_inr: e.target.value })} />
        <input placeholder="Cost ₹/m² (glazing etc.)" type="number" step="any" value={form.cost_per_m2_inr} onChange={(e) => setForm({ ...form, cost_per_m2_inr: e.target.value })} />
        <select value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
          {Object.entries(AVAILABILITY_LABEL).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input placeholder="Logistics note (e.g. airliftable, road-only)" value={form.logistics_note}
               onChange={(e) => setForm({ ...form, logistics_note: e.target.value })} style={{ minWidth: 220 }} />
        <input placeholder="Citation / source" value={form.citation} onChange={(e) => setForm({ ...form, citation: e.target.value })} style={{ minWidth: 220 }} />
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={save}>{editingId === 'NEW' ? 'Add material' : 'Save changes'}</button>
        <button onClick={cancel} style={{ opacity: 0.7 }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 3 · Thermo-Physical Materials Database</div>
          <h2>Materials Library</h2>
          <p>Thermal properties (k, ρ, cp), cost, availability, and citation — editable, not static.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            placeholder="Search material..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <button onClick={startNew}>+ Add material</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {editingId === 'NEW' && renderForm()}

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
              <th>Availability</th>
              <th>Last updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <>
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
                  <td>{AVAILABILITY_LABEL[m.availability] || m.availability || '—'}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{timeAgo(m.last_updated)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(m)} style={{ marginRight: '0.4rem' }}>Edit</button>
                    <button onClick={() => remove(m.id)} style={{ opacity: 0.7 }}>Delete</button>
                  </td>
                </tr>
                {editingId === m.id && (
                  <tr>
                    <td colSpan={9}>{renderForm()}</td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}