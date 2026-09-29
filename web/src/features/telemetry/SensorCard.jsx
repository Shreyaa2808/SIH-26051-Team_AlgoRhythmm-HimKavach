import { NOT_AVAILABLE } from '../common/format';

/** One reading tile. `badge` says where the number came from (never "live" unless a sensor is). */
export default function SensorCard({ label, value, unit, badge, note }) {
  const has = typeof value === 'number' && Number.isFinite(value);
  return (
    <div className={`op-sensor ${has ? '' : 'op-sensor-empty'}`}>
      <div className="op-sensor-label">{label}</div>
      <div className="op-sensor-value">
        {has ? <>{value.toFixed(1)}<span className="op-sensor-unit"> {unit}</span></> : '—'}
      </div>
      <div className="op-sensor-foot">
        {has ? (badge ? <span className="op-badge">{badge}</span> : null) : <span className="op-muted">{NOT_AVAILABLE}</span>}
        {note ? <span className="op-note">{note}</span> : null}
      </div>
    </div>
  );
}
