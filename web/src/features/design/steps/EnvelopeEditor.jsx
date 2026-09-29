import { RECOMMENDED_DEFAULTS, LIMITS, buildAssembly, layerMetrics, uValueBand } from '../designInput.js';
import NumberField from '../fields/NumberField.jsx';

const PARTS = [
  { key: 'wall', label: 'Walls', filter: (m) => m.category?.includes('structural') },
  { key: 'roof', label: 'Roof', filter: (m) => m.category?.includes('structural') },
  { key: 'floor', label: 'Floor', filter: (m) => m.category?.includes('structural') },
  { key: 'insulation', label: 'Insulation', filter: (m) => m.category === 'insulation' },
];

const MODES = [
  { id: 'recommend', label: 'Let HimKavach recommend' },
  { id: 'select', label: 'Select material' },
  { id: 'custom', label: 'Custom material' },
];

const inr = (v) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);
const fixed = (v, dp) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(dp));

function MaterialFacts({ material, thicknessM }) {
  if (!material) return null;
  const m = layerMetrics(material, thicknessM);
  return (
    <dl className="dw-facts dw-facts-tight">
      <div><dt>Conductivity k</dt><dd>{fixed(material.k, 3)} W/mK</dd></div>
      <div><dt>Thermal resistance</dt><dd>{fixed(m.rValue, 2)} m²K/W</dd></div>
      <div><dt>Material cost</dt><dd>{inr(m.costPerM2)}/m²</dd></div>
      <div><dt>Embodied carbon</dt><dd>{m.carbonPerM2 == null ? '—' : `${m.carbonPerM2.toFixed(1)} kgCO₂e/m²`}</dd></div>
    </dl>
  );
}

function PartCard({ part, env, materials, byId, update, envelope, existing }) {
  const p = env[part.key];
  const set = (patch) => update('envelope', { [part.key]: patch });
  const setCustom = (patch) => set({ custom: { ...p.custom, ...patch } });
  const options = (materials || []).filter(part.filter);
  const isIns = part.key === 'insulation';
  const [tMin, tMax] = isIns ? LIMITS.insulationThicknessM : LIMITS.wallThicknessM;
  const def = RECOMMENDED_DEFAULTS[part.key];
  const shown = p.mode === 'recommend' ? { ...p, materialId: def.materialId, thicknessM: def.thicknessM } : p;
  const selectedMaterial = p.mode === 'select' ? byId?.[p.materialId] : p.mode === 'recommend' ? byId?.[def.materialId] : null;

  const asm = part.key !== 'insulation' ? buildAssembly(envelope, part.key, byId) : null;
  const band = asm ? uValueBand(asm.uValue) : null;

  return (
    <div className="dw-card">
      <div className="dw-card-row">
        <h3>{part.label}</h3>
        {part.key !== 'wall' && part.key !== 'insulation' && (
          <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={() => update('envelope', { [part.key]: { ...envelope.wall, custom: { ...envelope.wall.custom } } })}>
            Copy from walls
          </button>
        )}
      </div>

      <div className="dw-segment" role="radiogroup" aria-label={`${part.label} material mode`}>
        {MODES.filter((m) => !(existing && m.id === 'recommend')).map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={p.mode === m.id}
            className={p.mode === m.id ? 'active' : ''} onClick={() => set({ mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>

      {p.mode === 'recommend' && (
        <p className="dw-muted">
          HimKavach will choose this during optimization. Until then the baseline uses{' '}
          <strong>{byId?.[def.materialId]?.name || def.materialId}</strong>, {def.thicknessM * 1000} mm.
        </p>
      )}

      {p.mode === 'select' && (
        <div className="dw-grid dw-grid-2">
          <label className="dw-field">
            <span>Material</span>
            <select value={p.materialId || ''} onChange={(e) => set({ materialId: e.target.value })}>
              {!options.some((m) => m.id === p.materialId) && <option value={p.materialId || ''}>{p.materialId || 'Choose…'}</option>}
              {options.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <NumberField label="Thickness" unit="mm" value={Math.round(shown.thicknessM * 1000)} min={tMin * 1000} max={tMax * 1000} step="10"
            onChange={(v) => set({ thicknessM: v / 1000 })}
            hint={isIns ? '0 = no insulation' : undefined} />
        </div>
      )}

      {p.mode === 'custom' && (
        <>
          <div className="dw-grid">
            <label className="dw-field">
              <span>Name</span>
              <input type="text" value={p.custom.name || ''} onChange={(e) => setCustom({ name: e.target.value })} />
            </label>
            <NumberField label="Conductivity k" unit="W/mK" value={p.custom.k} min="0.005" step="0.01" onChange={(v) => setCustom({ k: v })} />
            <NumberField label="Density" unit="kg/m³" value={p.custom.rho} min="1" step="10" onChange={(v) => setCustom({ rho: v })} />
            <NumberField label="Specific heat" unit="J/kgK" value={p.custom.cp} min="100" step="50" onChange={(v) => setCustom({ cp: v })} />
            <NumberField label="Cost" unit="₹/m³" value={p.custom.costPerM3} min="0" step="100" onChange={(v) => setCustom({ costPerM3: v })} />
            <NumberField label="Thickness" unit="mm" value={Math.round(p.thicknessM * 1000)} min={tMin * 1000} max={tMax * 1000} step="10"
              onChange={(v) => set({ thicknessM: v / 1000 })} />
          </div>
          <p className="dw-warn">The solver can&apos;t use custom materials yet. It will simulate the default instead and say so; your values stay saved for the report and blueprint.</p>
        </>
      )}

      {selectedMaterial && <MaterialFacts material={selectedMaterial} thicknessM={shown.thicknessM} />}

      {asm && (
        <div className={`dw-u dw-u-${band.id}`}>
          <span>{part.label} U-value (with insulation)</span>
          <strong>{asm.uValue == null ? '—' : `${asm.uValue.toFixed(2)} W/m²K`}</strong>
          <em>{band.label}</em>
        </div>
      )}
      {part.key === 'wall' && (
        <p className="dw-muted">Lower U is better. Bands are indicative for a cold climate. Only the wall build-up is simulated today; the roof and floor reuse it.</p>
      )}
    </div>
  );
}

/** Pure presentational editor: materials are passed in so it can be tested without a backend. */
export default function EnvelopeEditor({ design, update, errors, showErrors, materials, byId, mode = design.mode }) {
  const existing = mode === 'retrofit';
  const setAll = (mode) => {
    const patch = {};
    for (const k of ['wall', 'roof', 'floor', 'insulation']) patch[k] = { mode };
    update('envelope', patch);
  };

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>{existing ? 'Existing envelope' : 'Envelope'}</h2>
        <p>{existing ? 'What the shelter is built from today. Pick the closest material, or enter its properties if it is not in the database.' : 'Walls, roof, floor and insulation. You don\'t need to know material properties: pick a material and its data is filled in from the database.'}</p>
      </header>

      {!existing && (
        <div className="dw-card dw-card-row">
          <p className="dw-muted">Not sure? Let HimKavach choose every component during optimization.</p>
          <button type="button" className="dw-btn dw-btn-ghost" onClick={() => setAll('recommend')}>Let HimKavach choose all</button>
        </div>
      )}

      {PARTS.map((part) => (
        <PartCard key={part.key} part={part} env={design.envelope} envelope={design.envelope} materials={materials} byId={byId} update={update} existing={existing} />
      ))}

      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}
    </div>
  );
}
