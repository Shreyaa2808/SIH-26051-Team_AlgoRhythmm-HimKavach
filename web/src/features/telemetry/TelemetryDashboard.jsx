import { useMemo, useRef, useState } from 'react';
import '../outputs/outputs.css';
import { fmtDateTime, text, NOT_AVAILABLE } from '../common/format';
import useSelectedDesign from '../outputs/useSelectedDesign';
import SelectedDesignHeader, { NoDesignState } from '../outputs/SelectedDesignHeader';
import ValidationStatus from '../validation/ValidationStatus';
import SensorCard from './SensorCard';
import PredictedVsMeasured from './PredictedVsMeasured';
import TelemetryMetrics from './TelemetryMetrics';
import { clearTelemetry, setTelemetry } from './telemetryStore';
import {
  alignSeries, buildDemoRows, computeMetrics, describeLog, getLiveSensorStatus, latestSample,
  listDates, parseMeasuredCsv, SOURCE,
} from './telemetryService';

/**
 * Field Monitoring: compare an instrumented test shelter's MEASURED data with
 * the model's PREDICTION for the SELECTED design.
 */
export default function TelemetryDashboard({ projectId, selection, location, onProjectChange }) {
  const d = useSelectedDesign({ projectId, selection, location });
  const { project, telemetry } = d;
  const fileRef = useRef(null);
  const [parseMsg, setParseMsg] = useState(null);
  const [rangeDate, setRangeDate] = useState('all');

  const live = getLiveSensorStatus();
  const rows = telemetry?.rows ?? [];
  const isDemo = telemetry?.source === SOURCE.DEMO;
  const dates = useMemo(() => listDates(rows), [rows]);
  const activeDate = rangeDate !== 'all' && dates.includes(rangeDate) ? rangeDate : null;

  const predicted = project?.sim
    ? { hours: project.sim.hours, indoor: project.sim.indoor, outdoor: project.sim.outdoor }
    : null;
  const aligned = useMemo(
    () => (predicted && rows.length ? alignSeries(predicted, rows, activeDate) : []),
    [predicted, rows, activeDate],
  );
  const metrics = useMemo(() => computeMetrics(aligned), [aligned]);
  const log = describeLog(rows);
  const last = latestSample(rows);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !project) return;
    const content = await file.text();
    const parsed = parseMeasuredCsv(content);
    if (!parsed.ok) {
      setParseMsg({ kind: 'error', text: parsed.errors.join(' ') });
      return;
    }
    setTelemetry(project.id, { source: SOURCE.IMPORTED, fileName: file.name, rows: parsed.rows, date: null });
    setRangeDate('all');
    setParseMsg({
      kind: parsed.errors.length ? 'warn' : 'ok',
      text: `Imported ${parsed.rows.length} sample(s) from ${file.name}.${parsed.errors.length ? ` ${parsed.errors.join(' ')}` : ''}`,
    });
  };

  const loadDemo = () => {
    if (!project?.sim) return;
    setTelemetry(project.id, {
      source: SOURCE.DEMO, fileName: null, rows: buildDemoRows(predicted), date: null,
    });
    setRangeDate('all');
    setParseMsg(null);
  };

  const statusBadge = telemetry
    ? isDemo
      ? { cls: 'demo', text: '◐ DEMO DATA — synthetic, not measured' }
      : { cls: 'imported', text: '● IMPORTED LOG — not a live feed' }
    : { cls: 'off', text: '○ SENSOR NOT CONNECTED' };

  const periodText = log && log.from ? `${log.from} → ${log.to} (${log.samples} samples over ${log.days} day(s))` : log ? `${log.samples} samples, hour-of-day only (no dates in file)` : null;
  const dataLabel = isDemo ? 'Demo data (synthetic)' : 'Measured (imported log)';
  const sourceBadge = isDemo ? 'DEMO DATA' : 'Imported log';

  return (
    <div className="op-page">
      <div className="module-header">
        <div>
          <div className="eyebrow">Field validation</div>
          <h2>Field Monitoring</h2>
          <p>Compare measured test-shelter temperatures with the model prediction for the selected design.</p>
        </div>
      </div>

      <SelectedDesignHeader
        projects={d.projects} projectId={projectId} onProjectChange={onProjectChange}
        project={project} trace={d.trace} selection={d.selection} error={d.error} loading={d.loading}
      />

      {!projectId || (!d.loading && !project) ? (
        <NoDesignState projectsError={d.projectsError} hasProjects={d.projects.length > 0} />
      ) : null}

      {project ? (
        <>
          <div className="op-monitor-status">
            <div>
              <div className="op-mon-title">{text(project.name)}</div>
              <div className="op-note">Design ID {text(project.id, NOT_AVAILABLE)}</div>
            </div>
            <span className={`op-status-pill op-pill-${statusBadge.cls}`}>{statusBadge.text}</span>
          </div>

          {!telemetry ? (
            <p className="op-info">{live.reason} Import a measured log below to compare it with the model.</p>
          ) : null}

          <div className="op-sensor-grid">
            <SensorCard label="Indoor temperature" value={last?.indoor} unit="°C" badge={telemetry ? sourceBadge : null}
              note={last?.date ? `last sample ${last.label}` : null} />
            <SensorCard label="Outdoor temperature" value={last?.outdoor} unit="°C" badge={telemetry ? sourceBadge : null} />
            <SensorCard label="Humidity" value={last?.humidity} unit="%" badge={telemetry ? sourceBadge : null} />
          </div>

          <section className="op-card">
            <h3 className="op-card-title">Measured data source</h3>
            <div className="op-actions">
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} hidden />
              <button className="primary-btn op-btn" onClick={() => fileRef.current?.click()}>
                Import measured log (CSV)
              </button>
              <button className="op-btn op-btn-secondary" onClick={loadDemo} disabled={!project.sim}>
                Preview with demo data
              </button>
              {telemetry ? (
                <button className="op-btn op-btn-secondary" onClick={() => { clearTelemetry(project.id); setParseMsg(null); }}>
                  Clear
                </button>
              ) : null}
            </div>
            <p className="op-note">
              CSV columns: <code>timestamp</code> (e.g. 2025-01-15 07:30) or <code>hour</code> (0–23),
              <code> indoor_temp_c</code>, and optionally <code>outdoor_temp_c</code>, <code>humidity_pct</code>.
              Demo data is synthetic, always labelled DEMO DATA, and never counted as validation.
            </p>
            {parseMsg ? <p className={`op-msg op-msg-${parseMsg.kind}`}>{parseMsg.text}</p> : null}
            {telemetry && !isDemo && telemetry.fileName ? <p className="op-note">Loaded file: {telemetry.fileName}</p> : null}
          </section>

          {!project.sim ? (
            <p className="op-info">Run a simulation for this design before comparing it with measurements — there is no predicted curve yet.</p>
          ) : null}

          {project.sim && !aligned.length ? (
            <section className="op-card">
              <h3 className="op-card-title">Predicted vs measured</h3>
              <p className="op-empty">Waiting for sensor data. The model prediction will be plotted against measurements once a log is imported.</p>
            </section>
          ) : null}

          {project.sim && aligned.length ? (
            <>
              {dates.length > 1 ? (
                <div className="op-range">
                  <label htmlFor="op-range-select">Time range</label>
                  <select id="op-range-select" value={rangeDate} onChange={(e) => setRangeDate(e.target.value)}>
                    <option value="all">All days (mean by hour of day)</option>
                    {dates.map((dt) => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </div>
              ) : null}
              <PredictedVsMeasured aligned={aligned} dataLabel={dataLabel} isDemo={isDemo}
                showOutdoor={Boolean(log?.hasOutdoor) && !isDemo} />
              <p className="op-note">
                The prediction is the design-day profile of the selected design
                {d.selection?.designDay ? ` (${d.selection.designDay.replaceAll('_', ' ')})` : ''}; it is compared by hour of day.
                The comparison is only meaningful if the measured period had similar outdoor conditions.
              </p>
              <TelemetryMetrics metrics={metrics} source={telemetry?.source} periodText={periodText} />
            </>
          ) : null}

          <ValidationStatus validation={d.validation} />
          <p className="op-note">Generated view of {fmtDateTime(new Date().toISOString())}. Live sensor feed: not connected.</p>
        </>
      ) : null}
    </div>
  );
}
