import { wallBearings } from '../designInput.js';

/** Top-down plan of the shelter, rotated by orientation. North is always up. */
export default function PlanPreview({ lengthM, widthM, orientationDeg, windows = [], doors = [] }) {
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

  // small tick marks for openings (position along wall = centered; real placement comes in Phase 4)
  const tick = (wall, kind) => {
    const long = wall === 'N' || wall === 'S';
    const len = 18;
    const x = wall === 'E' ? w / 2 : wall === 'W' ? -w / 2 : 0;
    const y = wall === 'N' ? -h / 2 : wall === 'S' ? h / 2 : 0;
    return (
      <line
        key={`${kind}-${wall}`}
        x1={long ? x - len / 2 : x} x2={long ? x + len / 2 : x}
        y1={long ? y : y - len / 2} y2={long ? y : y + len / 2}
        stroke={kind === 'win' ? '#3f7ef7' : '#8a5a2b'} strokeWidth="5" strokeLinecap="round"
      />
    );
  };
  const winWalls = [...new Set(windows.map((x) => x.wall))];
  const doorWalls = [...new Set(doors.map((x) => x.wall))];

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
        {winWalls.map((wl) => tick(wl, 'win'))}
        {doorWalls.map((wl) => tick(wl, 'door'))}
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
