import { fmt } from '../common/format';

/** MODEL VS MEASURED numbers — only ever computed from paired real/imported hours. */
export default function TelemetryMetrics({ metrics, source, periodText }) {
  if (!metrics) {
    return (
      <section className="op-card">
        <h3 className="op-card-title">Model vs measured</h3>
        <p className="op-empty">Waiting for sensor data.</p>
      </section>
    );
  }
  return (
    <section className="op-card">
      <h3 className="op-card-title">Model vs measured</h3>
      {source === 'demo' ? (
        <p className="op-warn">Demo Data — statistics below use synthetic values and are not a validation result.</p>
      ) : null}
      <div className="op-metrics">
        <div className="op-metric">
          <span className="op-metric-label">Mean absolute error</span>
          <span className="op-metric-value">{fmt(metrics.mae, 2, '°C')}</span>
        </div>
        <div className="op-metric">
          <span className="op-metric-label">Maximum deviation</span>
          <span className="op-metric-value">{fmt(metrics.maxAbs, 2, '°C')}</span>
          <span className="op-note">at {String(metrics.worstHour).padStart(2, '0')}:00</span>
        </div>
        <div className="op-metric">
          <span className="op-metric-label">Mean bias (predicted − measured)</span>
          <span className="op-metric-value">{fmt(metrics.bias, 2, '°C')}</span>
        </div>
        <div className="op-metric">
          <span className="op-metric-label">RMSE</span>
          <span className="op-metric-value">{fmt(metrics.rmse, 2, '°C')}</span>
        </div>
        <div className="op-metric">
          <span className="op-metric-label">Hours compared</span>
          <span className="op-metric-value">{metrics.n}</span>
        </div>
      </div>
      {periodText ? <p className="op-note">Measurement period: {periodText}</p> : null}
      <p className="op-note">
        Statistics are computed on hour-of-day pairs of the model prediction and the measured series.
        No accuracy percentage or confidence score is shown: neither is defined for this comparison.
      </p>
    </section>
  );
}
