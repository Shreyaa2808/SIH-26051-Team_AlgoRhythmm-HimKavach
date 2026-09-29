// Builds the validation-status rows shown on the Field Monitoring page, the
// Export Center and inside the engineering report.
// Statuses are derived ONLY from what actually exists. ANSYS is never
// connected in this prototype and never produces numbers here.
import { fmt, isNum } from '../common/format';
import { computeMetrics, alignSeries, SOURCE } from '../telemetry/telemetryService';

export const STATUS = {
  AVAILABLE: 'available',
  WAITING: 'waiting',
  NOT_CONNECTED: 'not_connected',
  DEMO: 'demo',
  ATTENTION: 'attention',
  NOT_LINKED: 'not_linked',
};

export function buildValidationStatus({ project, selection, telemetry }) {
  const items = [];
  const sim = project?.sim ?? null;

  items.push(
    sim
      ? {
          key: 'thermal', label: 'Thermal model', status: STATUS.AVAILABLE,
          detail: `${sim.hours.length}-hour simulation result saved for this design`,
        }
      : {
          key: 'thermal', label: 'Thermal model', status: STATUS.WAITING,
          detail: 'No simulation saved for this design. Run a simulation before generating the engineering report.',
        },
  );

  if (sim && sim.safetyPassed !== null) {
    items.push({
      key: 'safety', label: 'Safety interlock',
      status: sim.safetyPassed ? STATUS.AVAILABLE : STATUS.ATTENTION,
      detail: sim.safetyPassed
        ? 'Passed in the saved simulation'
        : `Failed: ${sim.safetyReasons.join('; ') || 'reason not reported'}`,
    });
  }

  const linked = Boolean(selection) && selection.source === 'optimizer' && selection.projectId === project?.id;
  if (linked) {
    let detail = `Design opened from optimizer result "${selection.label ?? 'unnamed'}"`;
    if (selection.reproducesOptimizer === true && isNum(selection.optimizerComfortC)) {
      detail += ` — re-simulation reproduces the optimizer's coldest-hour value (${fmt(selection.optimizerComfortC, 1, '°C')})`;
    } else if (selection.reproducesOptimizer === false && isNum(selection.comfortDeltaC)) {
      detail += ` — re-simulation differs from the optimizer by ${fmt(selection.comfortDeltaC, 2, '°C')}`;
    }
    items.push({ key: 'optimization', label: 'Optimization', status: STATUS.AVAILABLE, detail });
  } else {
    items.push({
      key: 'optimization', label: 'Optimization', status: STATUS.NOT_LINKED,
      detail: 'No optimizer result is linked to this design in the current session',
    });
  }

  let tele;
  let metrics = null;
  if (!telemetry) {
    tele = {
      key: 'telemetry', label: 'Telemetry', status: STATUS.WAITING,
      detail: 'Waiting for sensor data — no sensor is connected and no measured log has been imported',
    };
  } else if (telemetry.source === SOURCE.DEMO) {
    tele = {
      key: 'telemetry', label: 'Telemetry', status: STATUS.DEMO,
      detail: 'Demo data only (synthetic) — not a validation result',
    };
  } else {
    const aligned = alignSeries(
      sim ? { hours: sim.hours, indoor: sim.indoor } : null,
      telemetry.rows,
      telemetry.date ?? null,
    );
    metrics = computeMetrics(aligned);
    tele = {
      key: 'telemetry', label: 'Telemetry', status: STATUS.AVAILABLE,
      detail: metrics
        ? `Imported measured log compared with the model on ${metrics.n} hour(s) — mean absolute error ${fmt(metrics.mae, 2, '°C')}`
        : 'Measured log imported, but no overlapping hours with the model prediction',
    };
  }
  items.push(tele);

  items.push({
    key: 'ansys', label: 'ANSYS', status: STATUS.NOT_CONNECTED,
    detail: 'ANSYS validation: Not connected in current prototype.',
  });

  const symbol = (s) => (s === STATUS.AVAILABLE ? 'available' : s === STATUS.ATTENTION ? 'attention' : s === STATUS.DEMO ? 'demo data only' : s === STATUS.NOT_CONNECTED ? 'not connected' : s === STATUS.NOT_LINKED ? 'not linked' : 'waiting');
  const summaryLine = items.map((i) => `${i.label}: ${symbol(i.status)}`).join(' · ');
  return { items, summaryLine, metrics };
}
