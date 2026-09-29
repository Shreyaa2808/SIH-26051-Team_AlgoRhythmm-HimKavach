// Dependency-free SVG line chart for printed reports (recharts' responsive
// containers do not print reliably). Draws only the points it is given.
import { isNum } from '../../common/format';

function niceRange(min, max) {
  if (!isNum(min) || !isNum(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.08;
  return [Math.floor((min - pad) * 2) / 2, Math.ceil((max + pad) * 2) / 2];
}

export default function StaticLineChart({
  series, width = 720, height = 300, xLabel = 'Hour of day', yLabel = 'Temperature (°C)',
  xTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24], xFmt = (h) => `${String(h).padStart(2, '0')}:00`,
}) {
  const clean = series
    .map((s) => ({ ...s, points: s.points.filter((p) => isNum(p.x) && isNum(p.y)) }))
    .filter((s) => s.points.length > 0);
  if (!clean.length) return <p className="op-empty">No data to plot.</p>;

  const all = clean.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs, xMin + 1);
  const [yMin, yMax] = niceRange(Math.min(...ys), Math.max(...ys));
  const m = { l: 60, r: 18, t: 16, b: 78 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const X = (x) => m.l + ((x - xMin) / (xMax - xMin)) * w;
  const Y = (y) => m.t + h - ((y - yMin) / (yMax - yMin)) * h;

  const yStep = (yMax - yMin) / 5;
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + i * yStep);
  const xt = xTicks.filter((t) => t >= xMin && t <= xMax + 0.001);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={`${yLabel} vs ${xLabel}`}
      style={{ background: '#fff', maxWidth: '100%' }} fontFamily="'Segoe UI', Arial, sans-serif">
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={m.l} x2={m.l + w} y1={Y(t)} y2={Y(t)} stroke="#e1e6ee" />
          <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#333">{t.toFixed(1)}</text>
        </g>
      ))}
      {xt.map((t) => (
        <g key={`x${t}`}>
          <line x1={X(t)} x2={X(t)} y1={m.t} y2={m.t + h} stroke="#eef1f6" />
          <text x={X(t)} y={m.t + h + 16} textAnchor="middle" fontSize="11" fill="#333">{xFmt(t)}</text>
        </g>
      ))}
      <rect x={m.l} y={m.t} width={w} height={h} fill="none" stroke="#333" strokeWidth="1" />
      {yMin < 0 && yMax > 0 ? (
        <line x1={m.l} x2={m.l + w} y1={Y(0)} y2={Y(0)} stroke="#777" strokeDasharray="2 3" />
      ) : null}
      {clean.map((s) => (
        <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.2"
          strokeDasharray={s.dash} strokeLinejoin="round"
          points={s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />
      ))}
      <text x={m.l + w / 2} y={m.t + h + 36} textAnchor="middle" fontSize="12" fill="#222">{xLabel}</text>
      <text x="16" y={m.t + h / 2} textAnchor="middle" fontSize="12" fill="#222"
        transform={`rotate(-90 16 ${m.t + h / 2})`}>{yLabel}</text>
      <g transform={`translate(${m.l}, ${height - 22})`} fontSize="12" fill="#222">
        {clean.map((s, i) => (
          <g key={s.name} transform={`translate(${i * 210}, 0)`}>
            <line x1="0" x2="26" y1="-4" y2="-4" stroke={s.color} strokeWidth="2.4" strokeDasharray={s.dash} />
            <text x="32" y="0">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
