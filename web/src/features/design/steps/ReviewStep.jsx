import {
  SHELTER_TYPES, USAGES, SEASONS, OCCUPANCY_PATTERNS, ACTIVITIES, HEATING_TYPES, VENTILATION_TYPES, SHAPES,
  WALL_NAMES, deriveGeometry, deriveOperations, deriveOpenings, buildAssembly, uValueBand, glazingCostInr,
  occupiedHours, resolveEnvelope, southFacingWall,
} from '../designInput.js';
import { toSimulatePayload } from '../toSimulatePayload.js';
import useMaterials from '../fields/useMaterials.js';

const label = (list, id) => list.find((x) => x.id === id)?.label ?? id ?? '—';
const hh = (h) => `${String(Number(h) % 24).padStart(2, '0')}:00`;
const inr = (v) => (v == null ? '—' : `₹${Math.round(v).toLocaleString('en-IN')}`);

/** Sections shown in the checklist, in wizard order. `step` matches STEPS ids. */
export const REVIEW_SECTIONS = [
  { section: 'site', step: 'site', title: 'Site' },
  { section: 'shelter', step: 'brief', title: 'Shelter brief' },
  { section: 'geometry', step: 'geometry', title: 'Geometry' },
  { section: 'envelope', step: 'envelope', title: 'Envelope' },
  { section: 'openings', step: 'openings', title: 'Openings' },
  { section: 'operations', step: 'operations', title: 'Operations' },
];

function Row({ k, v }) {
  return <div><dt>{k}</dt><dd>{v}</dd></div>;
}

function SummaryCard({ title, step, onEdit, children }) {
  return (
    <div className="dw-card">
      <div className="dw-card-row">
        <h3>{title}</h3>
        <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={() => onEdit(step)}>Edit</button>
      </div>
      <dl className="dw-facts dw-facts-tight dw-summary">{children}</dl>
    </div>
  );
}

function envelopeLine(design, key, byId) {
  const eff = resolveEnvelope(design.envelope)[key];
  const name = eff.source === 'custom' ? (eff.custom?.name || 'Custom material') : (byId?.[eff.materialId]?.name || eff.materialId);
  const tag = eff.source === 'recommended-default' ? ' (default until optimized)' : eff.source === 'custom' ? ' (custom)' : '';
  const t = eff.thicknessM > 0 ? `${Math.round(eff.thicknessM * 1000)} mm ` : 'none ';
  return `${t}${name}${tag}`.trim();
}

export default function ReviewStep({
  design, validation, onEdit, onRun, running, runError, runNotes, result, mode = design.mode,
}) {
  const { byId } = useMaterials();
  const existing = mode === 'retrofit';
  const { errors, warnings, ready } = validation;
  const geo = deriveGeometry(design.geometry);
  const ops = deriveOperations(design);
  const od = deriveOpenings(design);
  const south = southFacingWall(design.geometry.orientationDeg);
  const wallAsm = buildAssembly(design.envelope, 'wall', byId);
  const roofAsm = buildAssembly(design.envelope, 'roof', byId);
  const floorAsm = buildAssembly(design.envelope, 'floor', byId);
  const cost = glazingCostInr(design.openings.windows, byId);
  const { payload, notes } = ready ? toSimulatePayload(design) : { payload: null, notes: [] };
  const shownNotes = runNotes ?? notes;
  const u = (a) => (a.uValue == null ? '—' : `${a.uValue.toFixed(2)} W/m²K · ${uValueBand(a.uValue).label}`);
  const sh = design.shelter;
  const gate = design.operations.nightGate;
  const problems = REVIEW_SECTIONS.filter((s) => errors[s.section]?.length);

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>{existing ? 'Review existing shelter' : 'Review and run'}</h2>
        <p>Check everything the baseline simulation needs. Use Edit to fix a section; your changes are kept.</p>
      </header>

      <div className={`dw-card dw-ready ${ready ? 'ok' : 'blocked'}`}>
        <div className="dw-card-row">
          <h3>{ready ? 'Ready to simulate' : `${problems.length} section${problems.length === 1 ? '' : 's'} need attention`}</h3>
        </div>
        <ul className="dw-checklist">
          {REVIEW_SECTIONS.map((s) => {
            const errs = errors[s.section] || [];
            return (
              <li key={s.section} className={errs.length ? 'bad' : 'good'}>
                <span className="dw-check-icon" aria-hidden="true">{errs.length ? '!' : '✓'}</span>
                <div className="dw-check-body">
                  <strong>{s.title}</strong>
                  {errs.length === 0 && <span className="dw-muted"> complete</span>}
                  {errs.map((e) => <p key={e} className="dw-error">{e}</p>)}
                </div>
                {errs.length > 0 && (
                  <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={() => onEdit(s.step)}>Fix</button>
                )}
              </li>
            );
          })}
        </ul>
        {warnings.map((w) => <p key={w} className="dw-warn">{w}</p>)}
      </div>

      <div className="dw-split">
        <SummaryCard title="Site" step="site" onEdit={onEdit}>
          <Row k="Location" v={design.site.label || '—'} />
          <Row k="Elevation" v={design.site.elevationM != null ? `${Math.round(design.site.elevationM)} m` : '—'} />
          <Row k="Design day" v={String(design.site.designDay || '—').replace(/_/g, ' ')} />
        </SummaryCard>

        <SummaryCard title="Shelter brief" step="brief" onEdit={onEdit}>
          <Row k="Type" v={label(SHELTER_TYPES, sh.type)} />
          <Row k="Usage" v={label(USAGES, sh.usage)} />
          <Row k="Season" v={label(SEASONS, sh.season)} />
          <Row k="Occupants" v={sh.occupants} />
          <Row k="Schedule" v={`${label(OCCUPANCY_PATTERNS, sh.occupancyPattern)}, ${hh(sh.scheduleStartHour)}–${hh(sh.scheduleEndHour === 24 ? 0 : sh.scheduleEndHour)} (${occupiedHours(sh.scheduleStartHour, sh.scheduleEndHour)} h)`} />
        </SummaryCard>

        <SummaryCard title="Geometry" step="geometry" onEdit={onEdit}>
          <Row k="Size" v={`${design.geometry.lengthM} × ${design.geometry.widthM} × ${design.geometry.heightM} m`} />
          <Row k="Shape" v={label(SHAPES, design.geometry.shape)} />
          <Row k="Floor / volume" v={`${geo.floorAreaM2.toFixed(1)} m² / ${geo.volumeM3.toFixed(1)} m³`} />
          <Row k="Orientation" v={`${design.geometry.orientationDeg}° (${south.wall} wall faces south)`} />
          <Row k="Roof slope" v={`${design.geometry.roofSlopeDeg}°`} />
        </SummaryCard>

        <SummaryCard title="Envelope" step="envelope" onEdit={onEdit}>
          <Row k="Walls" v={envelopeLine(design, 'wall', byId)} />
          <Row k="Roof" v={envelopeLine(design, 'roof', byId)} />
          <Row k="Floor" v={envelopeLine(design, 'floor', byId)} />
          <Row k="Insulation" v={envelopeLine(design, 'insulation', byId)} />
          <Row k="Wall U-value" v={u(wallAsm)} />
          <Row k="Roof U-value" v={u(roofAsm)} />
          <Row k="Floor U-value" v={u(floorAsm)} />
        </SummaryCard>

        <SummaryCard title="Openings" step="openings" onEdit={onEdit}>
          <Row k="Windows" v={`${design.openings.windows.length} · ${od.windowM2.toFixed(2)} m²`} />
          <Row k="Doors" v={`${design.openings.doors.length} · ${od.doorM2.toFixed(2)} m²`} />
          <Row k="Window-to-wall" v={`${Math.round(od.windowToWallRatio * 100)}%`} />
          <Row k="Glazing cost" v={design.openings.windows.length === 0 ? '₹0' : inr(cost)} />
          <Row k="Air leakage" v={`${design.openings.leakageAreaCm2} cm²`} />
          {['N', 'E', 'S', 'W'].filter((w) => od.walls[w].items.length).map((w) => (
            <Row key={w} k={`${WALL_NAMES[w]} wall`} v={`${od.walls[w].windowM2 ? `${od.walls[w].windowM2.toFixed(1)} m² glass` : ''}${od.walls[w].windowM2 && od.walls[w].doorM2 ? ', ' : ''}${od.walls[w].doorM2 ? 'door' : ''}`} />
          ))}
        </SummaryCard>

        <SummaryCard title="Operations" step="operations" onEdit={onEdit}>
          <Row k="Activity" v={label(ACTIVITIES, design.operations.activity)} />
          <Row k="Heat gain" v={`${Math.round(ops.sensibleHeatW)} W${ops.overridden ? ' (manual)' : ''}`} />
          <Row k="Heating" v={`${label(HEATING_TYPES, design.operations.heatingType)}${ops.heatingW ? `, ${ops.heatingW} W` : ''}`} />
          <Row k="Ventilation" v={label(VENTILATION_TYPES, design.operations.ventilationType)} />
          <Row k="CO generation" v={`${design.operations.coGenerationLpm || 0} L/min`} />
          <Row k="Night Gate" v={gate.enabled ? `${hh(gate.closeHour)}–${hh(gate.openHour)}, ${gate.closedLeakageCm2} cm² closed` : 'Off'} />
        </SummaryCard>
      </div>

      {ready && (
        <div className="dw-card">
          <h3>What the solver will and won&apos;t use</h3>
          {shownNotes.length === 0
            ? <p className="dw-muted">Everything you entered is used by the solver.</p>
            : <ul className="dw-notes">{shownNotes.map((n) => <li key={`${n.field}-${n.message}`} className={n.level}>{n.message}</li>)}</ul>}
          <details className="dw-details">
            <summary>Show the exact request sent to /simulate</summary>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
          </details>
        </div>
      )}

      <div className="dw-card">
        <h3>Baseline simulation</h3>
        <p className="dw-muted">
          {ready
            ? existing
              ? 'Run the baseline to see how the shelter performs today. This is the starting point for retrofit options.'
              : 'Run the baseline to see how this shelter behaves before any optimization.'
            : 'Fix the sections marked above to enable the run.'}
        </p>
        <button type="button" className="dw-btn dw-btn-primary" onClick={onRun} disabled={running || !ready}>
          {running ? 'Simulating…' : result ? 'Run baseline again' : 'Run baseline simulation'}
        </button>
        {runError && <p className="dw-error">{runError}</p>}
        {result && !running && (
          <dl className="dw-facts dw-facts-tight">
            <Row k="Coldest indoor hour" v={`${result.min_indoor_temp_c.toFixed(1)}°C`} />
            <Row k="Warmest indoor hour" v={`${result.max_indoor_temp_c.toFixed(1)}°C`} />
            <Row k="Mean air changes" v={`${result.mean_ach.toFixed(2)} /h`} />
            <Row k="Safety check" v={result.safety_passed ? 'Passed' : 'Failed'} />
          </dl>
        )}
        {result && !result.safety_passed && (result.safety_reasons || []).map((r) => <p key={r} className="dw-error">{r}</p>)}
        {result && !running && <p className="dw-muted">Full temperature curves are shown in the results view.</p>}
      </div>
    </div>
  );
}
