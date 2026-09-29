import { DocPage, KV } from './ReportShell';
import StaticLineChart from './StaticLineChart';
import MaterialSchedule from '../blueprint/MaterialSchedule';
import ValidationStatus from '../../validation/ValidationStatus';
import ModelComparison from '../../validation/ModelComparison';
import { alignSeries, computeMetrics, describeLog, SOURCE } from '../../telemetry/telemetryService';
import {
  fmt, fmtDateTime, fmtM, isNum, NOT_AVAILABLE, NOT_SPECIFIED, text,
} from '../../common/format';

const PENDING = 'Not available';

function yn(v) {
  return v === true ? 'Yes' : v === false ? 'No' : NOT_AVAILABLE;
}

export default function EngineeringReport({ project, trace, site, selection, drawing, schedule, validation, telemetry }) {
  if (!project) return <p className="op-empty">Select a design before generating outputs.</p>;
  if (!project.sim) {
    return <p className="op-empty">Run a simulation before generating the engineering report.</p>;
  }
  const sim = project.sim;
  const doc = 'Engineering report';
  const opt = selection?.design ?? null;
  const ctx = selection?.context ?? null;

  // measured comparison (imported data only — demo data is never reported as validation)
  const realTelemetry = telemetry && telemetry.source === SOURCE.IMPORTED ? telemetry : null;
  const aligned = realTelemetry
    ? alignSeries({ hours: sim.hours, indoor: sim.indoor }, realTelemetry.rows, realTelemetry.date ?? null)
    : [];
  const metrics = computeMetrics(aligned);
  const log = realTelemetry ? describeLog(realTelemetry.rows) : null;

  const series = [
    { name: 'Indoor (model)', color: '#1f5fd6', points: sim.hours.map((h, i) => ({ x: h, y: sim.indoor[i] })) },
  ];
  if (sim.outdoor.length) {
    series.push({ name: 'Outdoor', color: '#c0392b', dash: '5 4', points: sim.hours.map((h, i) => ({ x: h, y: sim.outdoor[i] })) });
  }
  if (realTelemetry && aligned.length) {
    series.push({ name: 'Measured indoor (imported)', color: '#138a5a', points: aligned.map((p) => ({ x: p.hour, y: p.measured })) });
  }

  const surfaceRows = sim.surfaces.filter((s) => s && isNum(s.area_m2));
  const totalLoss = surfaceRows.reduce((a, s) => a + (isNum(s.heat_loss_w) ? s.heat_loss_w : 0), 0);
  const footprint = isNum(project.lengthM) && isNum(project.widthM) ? project.lengthM * project.widthM : null;
  const purpose = project.occupancy?.purpose ? project.occupancy.purpose.replaceAll('_', ' ') : null;

  return (
    <div className="op-doc">
      <DocPage docTitle={doc} trace={trace} title="Engineering report — selected design">
        <h3 className="op-h3">1. Project</h3>
        <KV rows={[
          ['Project name', text(trace?.projectName, NOT_SPECIFIED)],
          ['Design name', text(trace?.designName, NOT_AVAILABLE)],
          ['Design ID', text(trace?.designId, NOT_AVAILABLE)],
          ['Report generated', fmtDateTime(trace?.generated)],
          ['Simulation', text(trace?.simulation, NOT_AVAILABLE)],
          ['Model / version', text(trace?.modelVersion, NOT_AVAILABLE)],
          ['Validation status', text(trace?.validationSummary, NOT_AVAILABLE)],
        ]} />

        <h3 className="op-h3">2. Site</h3>
        <KV rows={[
          ['Location', text(site?.label, NOT_AVAILABLE)],
          ['Site ID', text(site?.siteId, NOT_AVAILABLE)],
          ['Latitude / longitude', isNum(site?.lat) && isNum(site?.lon) ? `${site.lat.toFixed(4)}°, ${site.lon.toFixed(4)}°` : NOT_AVAILABLE],
          ['Elevation', isNum(site?.elevationM) ? `${site.elevationM.toFixed(0)} m` : NOT_AVAILABLE],
          ['Design-day scenario', selection?.designDay ? selection.designDay.replaceAll('_', ' ') : NOT_AVAILABLE],
          ['Day of year simulated', isNum(selection?.dayOfYear) ? String(selection.dayOfYear) : NOT_AVAILABLE],
          ['Climate data source', text(site?.climateSourceName, NOT_AVAILABLE)],
          ['Climate data file', text(site?.climateSourceFile, NOT_AVAILABLE)],
          ['Climate data coverage', site?.climateYearStart ? `${site.climateYearStart} – ${site.climateYearEnd ?? '?'}` : NOT_AVAILABLE],
          ['Climate data cached at', fmtDateTime(site?.climateCachedAt)],
        ]} />
        {!isNum(site?.lat) ? (
          <p className="op-note">Coordinates and elevation are only known for the location currently selected in the Micro-Siting tab.</p>
        ) : null}

        <h3 className="op-h3">3. Design</h3>
        <KV rows={[
          ['Footprint (length × width)', isNum(project.lengthM) && isNum(project.widthM) ? `${fmtM(project.lengthM)} × ${fmtM(project.widthM)}` : NOT_AVAILABLE],
          ['Floor area', footprint ? `${footprint.toFixed(2)} m²` : NOT_AVAILABLE],
          ['Ceiling height', fmtM(project.ceilingHeightM, 2, NOT_AVAILABLE)],
          ['Orientation (wall N faces)', isNum(project.orientationDeg) ? `${project.orientationDeg.toFixed(0)}° compass` : NOT_AVAILABLE],
          ['Roof slope / downslope bearing', drawing?.ok && drawing.roof ? `${drawing.roof.slopeDeg.toFixed(1)}° / ${drawing.roof.bearingDeg.toFixed(0)}°` : NOT_AVAILABLE],
          ['Occupancy purpose', text(purpose, NOT_SPECIFIED)],
          ['Headcount', isNum(project.occupancy?.headcount) ? String(project.occupancy.headcount) : NOT_SPECIFIED],
          ['Leakage area', fmt(project.leakageAreaCm2, 0, 'cm²')],
          ['Openings', drawing?.ok ? (drawing.openings.length ? `${drawing.openings.length} defined (see Architect package)` : 'None defined in this design') : NOT_AVAILABLE],
          ['Passive strategy: Night Gate', project.nightGate.enabled === true
            ? `Enabled — closed ${fmt(project.nightGate.closeHour, 0, 'h')} to ${fmt(project.nightGate.openHour, 0, 'h')}, closed leakage ${fmt(project.nightGate.closedLeakageCm2, 0, 'cm²')}`
            : project.nightGate.enabled === false ? 'Not enabled' : NOT_AVAILABLE],
        ]} />
        <h4 className="op-h4">Materials</h4>
        <MaterialSchedule rows={schedule} compact />
      </DocPage>

      <DocPage docTitle={doc} trace={trace} title="4. Thermal performance">
        <KV rows={[
          ['Minimum indoor temperature', fmt(sim.minIndoorC, 1, '°C')],
          ['Maximum indoor temperature', fmt(sim.maxIndoorC, 1, '°C')],
          ['Mean indoor temperature', fmt(sim.meanIndoorC, 1, '°C')],
          ['Outdoor min / max / mean', sim.outdoor.length ? `${fmt(sim.minOutdoorC, 1, '°C')} / ${fmt(sim.maxOutdoorC, 1, '°C')} / ${fmt(sim.meanOutdoorC, 1, '°C')}` : NOT_AVAILABLE],
          ['Design target (coldest hour)', fmt(sim.targetMinIndoorC, 1, '°C')],
          ['Target met', yn(sim.metTarget)],
          ['Safety interlock (ACH / CO)', sim.safetyPassed === null ? NOT_AVAILABLE : sim.safetyPassed ? 'Passed' : `Failed — ${sim.safetyReasons.join('; ') || 'reason not reported'}`],
          ['Solar radiation / solar gain', `${PENDING} — not returned by the simulation API`],
          ['Heating demand', `${PENDING} — not returned by the simulation API`],
        ]} />
        <h4 className="op-h4">24-hour temperature profile</h4>
        <StaticLineChart series={series} />
        <h4 className="op-h4">Envelope heat loss (steady estimate U·A·ΔT)</h4>
        {surfaceRows.length ? (
          <table className="op-table op-table-compact">
            <thead><tr><th>Surface</th><th>Area (m²)</th><th>U-value (W/m²K)</th><th>Heat loss (W)</th></tr></thead>
            <tbody>
              {surfaceRows.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{fmt(s.area_m2, 2, '', NOT_AVAILABLE)}</td>
                  <td>{fmt(s.u_value_wm2k, 3, '', NOT_AVAILABLE)}</td>
                  <td>{fmt(s.heat_loss_w, 0, '', NOT_AVAILABLE)}</td>
                </tr>
              ))}
              <tr className="op-total"><td colSpan={3}>Total (sum of surfaces)</td><td>{fmt(totalLoss, 0, '', NOT_AVAILABLE)}</td></tr>
            </tbody>
          </table>
        ) : <p className="op-empty">Surface heat-loss data not available for this design.</p>}
        <p className="op-note">Heat loss per surface is U × A × (mean indoor − mean outdoor) as reported by the design endpoint; positive = losing heat.</p>
      </DocPage>

      <DocPage docTitle={doc} trace={trace} title="5. Optimization &amp; 6. Validation">
        <h3 className="op-h3">5. Optimization</h3>
        {selection?.source === 'optimizer' && opt ? (
          <>
            <KV rows={[
              ['Selected design', text(selection.label, NOT_AVAILABLE)],
              ['Coldest indoor hour (objective)', fmt(opt.comfort_coldest_hour_c, 1, '°C')],
              ['Material cost (objective)', isNum(opt.cost_inr) ? `₹ ${Math.round(opt.cost_inr).toLocaleString('en-IN')}` : NOT_AVAILABLE],
              ['Envelope weight (objective)', isNum(opt.weight_kg) ? `${Math.round(opt.weight_kg).toLocaleString('en-IN')} kg` : NOT_AVAILABLE],
              ['Embodied carbon (reported, not optimised)', isNum(opt.carbon_kgco2e) ? `${Math.round(opt.carbon_kgco2e).toLocaleString('en-IN')} kgCO₂e` : 'Not available (no carbon figure on file for one or more materials)'],
              ['Wall U-value', fmt(opt.wall_u_value_wm2k, 3, 'W/m²K')],
              ['Roof snow load', isNum(opt.roof_snow_load_kpa) ? `${opt.roof_snow_load_kpa.toFixed(2)} kPa` : NOT_AVAILABLE],
              ['Constraint: safety interlock', opt.safety_passed === true ? 'Passed' : opt.safety_passed === false ? 'Failed' : NOT_AVAILABLE],
              ['Constraint: max roof snow load', isNum(ctx?.max_roof_snow_load_kpa) ? `${ctx.max_roof_snow_load_kpa} kPa` : 'No limit set'],
              ['Ground snow load (input)', isNum(ctx?.ground_snow_load_kpa) ? `${ctx.ground_snow_load_kpa} kPa` : NOT_AVAILABLE],
              ['Re-simulation vs optimizer', selection.reproducesOptimizer === true ? `Reproduces (coldest hour ${fmt(selection.optimizerComfortC, 1, '°C')})` : selection.reproducesOptimizer === false ? `Differs by ${fmt(selection.comfortDeltaC, 2, '°C')}` : NOT_AVAILABLE],
            ]} />
            <p className="op-note">Comparison with other Pareto candidates is not included: only the selected design's values are available to this report.</p>
          </>
        ) : (
          <p className="op-empty">This design is not linked to an optimizer result in the current session, so no objective values are reported. Estimated material cost saved with the design: {isNum(sim.materialCostInr) ? `₹ ${Math.round(sim.materialCostInr).toLocaleString('en-IN')}` : NOT_AVAILABLE}.</p>
        )}

        <h3 className="op-h3">6. Validation</h3>
        <ValidationStatus validation={validation} title="Validation status" compact />
        <h4 className="op-h4">Model vs measured</h4>
        {realTelemetry ? (
          <ModelComparison metrics={metrics} source="imported"
            period={log?.from ? `${log.from} → ${log.to} (${log.samples} samples)` : `${log?.samples ?? 0} samples`} />
        ) : (
          <p className="op-empty">{telemetry ? 'Only demo data is loaded — it is not used as validation evidence.' : 'Sensor data is not connected yet; no measured comparison is available.'}</p>
        )}
        <p className="op-note">ANSYS validation: Not connected in current prototype.</p>
      </DocPage>
    </div>
  );
}
