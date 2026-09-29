import { fmt } from '../common/format';

/** Compact model-vs-measured summary used by the Export Center / report. */
export default function ModelComparison({ metrics, source, period }) {
  if (!metrics) {
    return <p className="op-empty">Waiting for sensor data — no measured series available to compare with the model.</p>;
  }
  return (
    <div className="op-modelcmp">
      {source === 'demo' ? (
        <p className="op-warn">Demo data — these numbers compare the model with synthetic values and are not a validation result.</p>
      ) : null}
      <dl className="op-dl">
        <div><dt>Mean absolute error</dt><dd>{fmt(metrics.mae, 2, '°C')}</dd></div>
        <div><dt>Maximum deviation</dt><dd>{fmt(metrics.maxAbs, 2, '°C')}</dd></div>
        <div><dt>Mean bias (predicted − measured)</dt><dd>{fmt(metrics.bias, 2, '°C')}</dd></div>
        <div><dt>Hours compared</dt><dd>{metrics.n}</dd></div>
        {period ? <div><dt>Measurement period</dt><dd>{period}</dd></div> : null}
      </dl>
    </div>
  );
}
