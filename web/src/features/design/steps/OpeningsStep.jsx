import { useState } from 'react';
import {
  WALLS, WALL_NAMES, GLAZING_IDS, FRAMES, DOOR_TYPES, LIMITS,
  createWindow, createDoor, deriveOpenings, glazingCostInr, southFacingWall, wallBearings,
} from '../designInput.js';
import { toSimulatePayload } from '../toSimulatePayload.js';
import NumberField from '../fields/NumberField.jsx';
import useMaterials from '../fields/useMaterials.js';
import WallSchematic from './WallSchematic.jsx';

const inr = (v) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);
const bearingText = (wall, orientationDeg) => `faces ${Math.round(wallBearings(orientationDeg)[wall])}°`;

function WallSelect({ value, onChange, orientationDeg }) {
  return (
    <label className="dw-field">
      <span>Wall</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {WALLS.map((w) => <option key={w} value={w}>{WALL_NAMES[w]} ({bearingText(w, orientationDeg)})</option>)}
      </select>
    </label>
  );
}

/** Position control: blank = auto-spaced. */
function PositionField({ value, onChange, maxM }) {
  const auto = value === null || value === undefined;
  return (
    <div className="dw-field">
      <span>Position from left edge (outside view)</span>
      <div className="dw-inline">
        <label className="dw-check">
          <input type="checkbox" checked={auto} onChange={(e) => onChange(e.target.checked ? null : 0.3)} /> Auto
        </label>
        {!auto && (
          <NumberField label="" unit="m" value={value} min={0} max={maxM} step="0.1" onChange={(v) => onChange(v)} />
        )}
      </div>
    </div>
  );
}

function WindowCard({ w, index, design, byId, update, remove, selected, onSelect }) {
  const g = design.geometry;
  const set = (patch) => update({ windows: design.openings.windows.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) });
  const wallLen = WALLS.includes(w.wall) ? (w.wall === 'N' || w.wall === 'S' ? g.lengthM : g.widthM) : g.lengthM;
  const area = (Number(w.widthM) || 0) * (Number(w.heightM) || 0);
  const price = byId?.[w.glazingId]?.cost_per_m2_inr;
  return (
    <div className={`dw-item ${selected ? 'selected' : ''}`} onClick={() => onSelect(w.id)}>
      <div className="dw-card-row">
        <h4><span className="dw-dot win" /> Window {index + 1} <small>{area.toFixed(2)} m²</small></h4>
        <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={(e) => { e.stopPropagation(); remove(w.id); }}>Remove</button>
      </div>
      <div className="dw-grid">
        <WallSelect value={w.wall} onChange={(v) => set({ wall: v })} orientationDeg={g.orientationDeg} />
        <NumberField label="Width" unit="m" value={w.widthM} min={LIMITS.windowDimM[0]} max={LIMITS.windowDimM[1]} step="0.1" onChange={(v) => set({ widthM: v })} />
        <NumberField label="Height" unit="m" value={w.heightM} min={LIMITS.windowDimM[0]} max={LIMITS.windowDimM[1]} step="0.1" onChange={(v) => set({ heightM: v })} />
        <NumberField label="Sill height" unit="m" value={w.sillM ?? 0} min={0} max={LIMITS.sillM[1]} step="0.1" onChange={(v) => set({ sillM: v })} />
        <label className="dw-field">
          <span>Glazing</span>
          <select value={w.glazingId} onChange={(e) => set({ glazingId: e.target.value })}>
            {GLAZING_IDS.map((id) => <option key={id} value={id}>{byId?.[id]?.name || id}</option>)}
          </select>
          {price != null && <em className="dw-hint">{inr(price)}/m² → {inr(price * area)} for this window</em>}
        </label>
        <label className="dw-field">
          <span>Frame</span>
          <select value={w.frame} onChange={(e) => set({ frame: e.target.value })}>
            {FRAMES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <PositionField value={w.offsetM} maxM={Math.max(0, wallLen - (Number(w.widthM) || 0))} onChange={(v) => set({ offsetM: v })} />
        <label className="dw-check dw-check-box">
          <input type="checkbox" checked={Boolean(w.operable)} onChange={(e) => set({ operable: e.target.checked })} /> Openable
        </label>
      </div>
    </div>
  );
}

function DoorCard({ d, index, design, update, remove, selected, onSelect }) {
  const g = design.geometry;
  const set = (patch) => update({ doors: design.openings.doors.map((x) => (x.id === d.id ? { ...x, ...patch } : x)) });
  const wallLen = d.wall === 'N' || d.wall === 'S' ? g.lengthM : g.widthM;
  return (
    <div className={`dw-item ${selected ? 'selected' : ''}`} onClick={() => onSelect(d.id)}>
      <div className="dw-card-row">
        <h4><span className="dw-dot door" /> Door {index + 1} <small>{((Number(d.widthM) || 0) * (Number(d.heightM) || 0)).toFixed(2)} m²</small></h4>
        <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={(e) => { e.stopPropagation(); remove(d.id); }}>Remove</button>
      </div>
      <div className="dw-grid">
        <WallSelect value={d.wall} onChange={(v) => set({ wall: v })} orientationDeg={g.orientationDeg} />
        <NumberField label="Width" unit="m" value={d.widthM} min={LIMITS.doorDimM[0]} max={LIMITS.doorDimM[1]} step="0.1" onChange={(v) => set({ widthM: v })} />
        <NumberField label="Height" unit="m" value={d.heightM} min={LIMITS.doorDimM[0]} max={LIMITS.doorDimM[1]} step="0.1" onChange={(v) => set({ heightM: v })} />
        <label className="dw-field">
          <span>Door type</span>
          <select value={d.type} onChange={(e) => set({ type: e.target.value })}>
            {DOOR_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <PositionField value={d.offsetM} maxM={Math.max(0, wallLen - (Number(d.widthM) || 0))} onChange={(v) => set({ offsetM: v })} />
      </div>
    </div>
  );
}

export default function OpeningsStep({ design, update, errors, showErrors }) {
  const { byId } = useMaterials();
  const [selectedId, setSelectedId] = useState(null);
  const { windows, doors } = design.openings;
  const g = design.geometry;
  const od = deriveOpenings(design);
  const south = southFacingWall(g.orientationDeg);
  const cost = glazingCostInr(windows, byId);
  const setOpenings = (patch) => update('openings', patch);

  const addWindow = () => {
    const w = createWindow({ wall: south.wall });
    setOpenings({ windows: [...windows, w] });
    setSelectedId(w.id);
  };
  const addDoor = () => {
    // default to the wall opposite the south-facing one, leaving the sunny wall free for glass
    const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const d = createDoor({ wall: OPPOSITE[south.wall] }, g.heightM);
    setOpenings({ doors: [...doors, d] });
    setSelectedId(d.id);
  };
  const removeItem = (id) => {
    setOpenings({ windows: windows.filter((x) => x.id !== id), doors: doors.filter((x) => x.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };
  const autoSpace = () => setOpenings({
    windows: windows.map((w) => ({ ...w, offsetM: null })),
    doors: doors.map((d) => ({ ...d, offsetM: null })),
  });

  const { payload, notes } = toSimulatePayload(design);
  const openingNotes = notes.filter((n) => n.field.startsWith('openings'));
  const southGlazing = od.walls[south.wall].windowM2;
  const otherGlazing = od.windowM2 - southGlazing;

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>Openings</h2>
        <p>Windows, doors and air leakage. South-facing glass brings in winter sun; every opening also loses heat, so add only what you need.</p>
      </header>

      <div className="dw-card">
        <div className="dw-card-row">
          <h3>Windows and doors</h3>
          <div className="dw-inline">
            <button type="button" className="dw-btn dw-btn-primary dw-btn-sm" onClick={addWindow}>+ Add window</button>
            <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={addDoor}>+ Add door</button>
          </div>
        </div>
        {windows.length + doors.length === 0 && (
          <p className="dw-muted">No openings yet. A shelter with no window or door is allowed for the baseline, but you will want at least a door before this goes to the blueprint.</p>
        )}
        {doors.length === 0 && windows.length > 0 && <p className="dw-warn">No door added. The blueprint and 3D model will show none.</p>}
        {doors.map((d, i) => (
          <DoorCard key={d.id} d={d} index={i} design={design} update={setOpenings} remove={removeItem} selected={selectedId === d.id} onSelect={setSelectedId} />
        ))}
        {windows.map((w, i) => (
          <WindowCard key={w.id} w={w} index={i} design={design} byId={byId} update={setOpenings} remove={removeItem} selected={selectedId === w.id} onSelect={setSelectedId} />
        ))}
      </div>

      <div className="dw-card">
        <div className="dw-card-row">
          <h3>Wall elevations (seen from outside)</h3>
          {(windows.length + doors.length > 0) && (
            <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={autoSpace}>Auto-space all</button>
          )}
        </div>
        <WallSchematic design={design} selectedId={selectedId} onSelect={setSelectedId} />
        <dl className="dw-facts dw-facts-tight">
          <div><dt>Window area</dt><dd>{od.windowM2.toFixed(2)} m²</dd></div>
          <div><dt>Door area</dt><dd>{od.doorM2.toFixed(2)} m²</dd></div>
          <div><dt>Window-to-wall ratio</dt><dd>{Math.round(od.windowToWallRatio * 100)}%</dd></div>
          <div><dt>South-facing glass</dt><dd>{southGlazing.toFixed(2)} m² ({south.wall} wall)</dd></div>
          <div><dt>Glazing cost</dt><dd>{windows.length === 0 ? '₹0' : inr(cost)}</dd></div>
        </dl>
        {otherGlazing > southGlazing && od.windowM2 > 0 && (
          <p className="dw-warn">Most of your glass faces away from south. It will lose heat in winter without gaining much sun.</p>
        )}
      </div>

      <div className="dw-card">
        <h3>Air leakage</h3>
        <NumberField
          label="Leakage area" unit="cm²" value={design.openings.leakageAreaCm2}
          min={LIMITS.leakageCm2[0]} max={LIMITS.leakageCm2[1]} step="10"
          onChange={(v) => setOpenings({ leakageAreaCm2: v })}
          hint="Total gaps around doors, windows and joints. 200 cm² is the HimKavach default. Lower is warmer, but the solver enforces a minimum air-change and CO safety limit."
        />
        {Number(design.openings.leakageAreaCm2) === 0 && <p className="dw-warn">Zero leakage will trip the ventilation safety check.</p>}
      </div>

      <div className="dw-card">
        <h3>What the solver will simulate</h3>
        <p className="dw-muted">
          {payload.window_wall
            ? <>One window group: <strong>{payload.window_area_m2} m²</strong> on the <strong>{WALL_NAMES[payload.window_wall]}</strong> wall, {byId?.[payload.window_material_id]?.name || payload.window_material_id}. </>
            : 'No window is simulated. '}
          Leakage area <strong>{payload.leakage_area_cm2} cm²</strong>.
        </p>
        {openingNotes.length > 0 && (
          <ul className="dw-notes">{openingNotes.map((n) => <li key={n.message} className={n.level}>{n.message}</li>)}</ul>
        )}
      </div>

      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}
    </div>
  );
}
