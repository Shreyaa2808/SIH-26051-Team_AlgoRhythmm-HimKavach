import {
  SHAPES, LIMITS, deriveGeometry, southFacingWall, orientationLongSideSouth,
} from '../designInput.js';
import NumberField from '../fields/NumberField.jsx';
import PlanPreview from './PlanPreview.jsx';

const COMPASS = [
  ['0°', 0], ['45°', 45], ['90°', 90], ['135°', 135], ['180°', 180], ['225°', 225], ['270°', 270], ['315°', 315],
];

export default function GeometryStep({ design, update, errors, showErrors, mode = design.mode }) {
  const existing = mode === 'retrofit';
  const g = design.geometry;
  const d = deriveGeometry(g);
  const south = southFacingWall(g.orientationDeg);
  const set = (patch) => update('geometry', patch);
  const fmt = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : '—');

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>{existing ? 'Existing geometry' : 'Geometry'}</h2>
        <p>{existing ? 'Measure the shelter as it stands today: internal size, shape and the direction it faces. ' : 'Size, shape and the direction the shelter faces. '}Orientation changes the solar gain, so it affects the physics, not just the drawing.</p>
      </header>

      <div className="dw-split">
        <div className="dw-card">
          <h3>Dimensions</h3>
          <div className="dw-grid">
            <NumberField label="Length" unit="m" value={g.lengthM} min={LIMITS.lengthM[0]} max={LIMITS.lengthM[1]} step="0.1" onChange={(v) => set({ lengthM: v })} />
            <NumberField label="Width" unit="m" value={g.widthM} min={LIMITS.widthM[0]} max={LIMITS.widthM[1]} step="0.1" onChange={(v) => set({ widthM: v })} />
            <NumberField label="Internal height" unit="m" value={g.heightM} min={LIMITS.heightM[0]} max={LIMITS.heightM[1]} step="0.1" onChange={(v) => set({ heightM: v })} />
            <label className="dw-field">
              <span>Shape</span>
              <select value={g.shape} onChange={(e) => set({ shape: e.target.value })}>
                {SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <label className="dw-field">
            <span>Roof slope: {g.roofSlopeDeg}° {Number(g.roofSlopeDeg) === 0 ? '(flat)' : ''}</span>
            <input type="range" min={LIMITS.roofSlopeDeg[0]} max={LIMITS.roofSlopeDeg[1]} step="1" value={g.roofSlopeDeg}
              onChange={(e) => set({ roofSlopeDeg: Number(e.target.value) })} />
          </label>

          <dl className="dw-facts dw-derived">
            <div><dt>Floor area</dt><dd>{fmt(d.floorAreaM2)} m²</dd></div>
            <div><dt>Volume</dt><dd>{fmt(d.volumeM3)} m³</dd></div>
            <div><dt>Wall area (gross)</dt><dd>{fmt(d.wallGrossAreaM2)} m²</dd></div>
            <div><dt>Roof area</dt><dd>{fmt(d.roofAreaM2)} m²</dd></div>
            <div><dt>Total envelope</dt><dd>{fmt(d.envelopeAreaM2)} m²</dd></div>
          </dl>
        </div>

        <div className="dw-card">
          <h3>Orientation</h3>
          <PlanPreview
            lengthM={g.lengthM} widthM={g.widthM} orientationDeg={g.orientationDeg}
            windows={design.openings.windows} doors={design.openings.doors}
          />
          <label className="dw-field">
            <span>Rotation: {g.orientationDeg}° from north (the wall marked N faces this bearing)</span>
            <input type="range" min="0" max="359" step="1" value={g.orientationDeg}
              onChange={(e) => set({ orientationDeg: Number(e.target.value) })} />
          </label>
          <div className="dw-chips">
            {COMPASS.map(([lab, deg]) => (
              <button key={deg} type="button" className={`dw-chip ${Number(g.orientationDeg) === deg ? 'active' : ''}`}
                onClick={() => set({ orientationDeg: deg })}>{lab}</button>
            ))}
          </div>
          <p className="dw-muted">
            The <strong>{south.wall}</strong> wall faces closest to true south
            {south.offsetDeg < 1 ? ' (due south)' : ` (${south.offsetDeg.toFixed(0)}° off)`}.
          </p>
          {!existing && (
            <button type="button" className="dw-btn dw-btn-ghost" onClick={() => set({ orientationDeg: orientationLongSideSouth(g) })}>
              Face the long side south
            </button>
          )}
        </div>
      </div>

      {!d.isSquare && (
        <p className="dw-warn">
          The solver models a square footprint with the same floor area ({fmt(d.floorAreaM2)} m²). Your {g.lengthM} × {g.widthM} m
          layout is kept for the plan, 3D model and blueprint.
        </p>
      )}
      {g.shape !== 'rectangular' && <p className="dw-warn">Non-rectangular shapes are stored but simulated as a rectangular box.</p>}
      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}
    </div>
  );
}
