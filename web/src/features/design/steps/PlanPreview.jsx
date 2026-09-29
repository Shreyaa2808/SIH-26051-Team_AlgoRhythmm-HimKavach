import { wallBearings, deriveOpenings } from '../designInput.js';

/** Top-down plan of the shelter, rotated by orientation. North is always up. */
export default function PlanPreview({ lengthM, widthM, orientationDeg, windows = [], doors = [] }) {
  const od = deriveOpenings({ geometry: { lengthM, widthM, heightM: 2.4 }, openings: { windows, doors } });
  const L = Number(lengthM) || 1;
  const W = Number(widthM) || 1;
  const SIZE = 260;
  const scale = (SIZE * 0.5) / Math.max(L, W);
  const w = L * scale;
  const h = W * scale;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const bearings = wallBearings(orientationDeg);
  const o = Number(orientationDeg) || 0;

  // label positions before rotation: N top, S bottom, E right, W left
  const labels = [
    ['N', 0, -h / 2 - 12],
    ['S', 0, h / 2 + 18],
    ['E', w / 2 + 14, 4],
    ['W', -w / 2 - 14, 4],
  ];

  // Openings drawn at their real position and width. Offsets run counter-clockwise
  // seen from above, starting at: N -> east end, W -> north end, S -> west end, E -> south end.
  const segment = (wall, x0, x1) => {
    const a = x0 * scale;
    const b = x1 * scale;
    if (wall === 'N') return { x1: w / 2 - a, x2: w / 2 - b, y1: -h / 2, y2: -h / 2 };
    if (wall === 'S') return { x1: -w / 2 + a, x2: -w / 2 + b, y1: h / 2, y2: h / 2 };
    if (wall === 'W') return { x1: -w / 2, x2: -w / 2, y1: -h / 2 + a, y2: -h / 2 + b };
    return { x1: w / 2, x2: w / 2, y1: h / 2 - a, y2: h / 2 - b };
  };
  const marks = Object.values(od.walls).flatMap((wl) => {
    const pos = Object.fromEntries(wl.placed.map((p) => [p.id, p]));
    return wl.items.map((it) => {
      const p = pos[it.id];
      const seg = segment(wl.label, p.x0, p.x1);
      return (
        <line
          key={it.id} {...seg}
          stroke={it.kind === 'window' ? '#3f7ef7' : '#8a5a2b'} strokeWidth="6" strokeLinecap="butt"
        />
      );
    });
  });

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="dw-plan" role="img" aria-label="Plan view of the shelter with orientation">
      <circle cx={cx} cy={cy} r={SIZE / 2 - 6} fill="none" stroke="rgba(150,170,210,0.45)" strokeDasharray="3 5" />
      {/* fixed north marker */}
      <g>
        <polygon points={`${cx},6 ${cx - 6},20 ${cx + 6},20`} fill="var(--text-dim)" />
        <text x={cx} y={34} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-dim)">N</text>
      </g>
      <g transform={`translate(${cx} ${cy}) rotate(${o})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="rgba(63,126,247,0.14)" stroke="var(--accent)" strokeWidth="2.5" />
        {marks}
        {labels.map(([lab, x, y]) => (
          <text
            key={lab} x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="700"
            fill="var(--text)" transform={`rotate(${-o} ${x} ${y})`}
          >
            {lab} · {Math.round(bearings[lab])}°
          </text>
        ))}
      </g>
    </svg>
  );
}
