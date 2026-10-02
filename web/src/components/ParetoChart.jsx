import { useMemo, useState } from 'react';

// Phase E: clickable cost-vs-comfort scatter for the optimizer's Pareto
// front. Each dot is one real, physics-verified design. Colour carries a
// third metric (weight / carbon / roof slope / snow load) so the chart shows
// three objectives at once without a 3D plot.

const COLOR_METRICS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', digits: 0 },
  { key: 'carbon_kgco2e', label: 'Carbon', unit: 'kgCO₂e', digits: 0 },
  { key: 'roof_slope_deg', label: 'Roof slope', unit: '°', digits: 0 },
  { key: 'roof_snow_load_kpa', label: 'Roof snow load', unit: 'kPa', digits: 2 },
];

const W = 680;
const H = 340;
const PAD = { l: 62, r: 20, t: 16, b: 46 };

const LOW = [63, 126, 247]; // --accent blue
const HIGH = [224, 69, 63]; // --error red

function lerpColor(t) {
  const c = LOW.map((v, i) => Math.round(v + (HIGH[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function niceTicks(lo, hi, n = 5) {
  if (hi === lo) return [lo];
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

export default function ParetoChart({ points, selected, onSelect }) {
  const [colorKey, setColorKey] = useState('weight_kg');
  const [hovered, setHovered] = useState(null);
  const metric = COLOR_METRICS.find((m) => m.key === colorKey);

  const geo = useMemo(() => {
    if (!points.length) return null;
    const costs = points.map((p) => p.cost_inr);
    const comfort = points.map((p) => p.comfort_coldest_hour_c);
    const cMin = Math.min(...costs);
    const cMax = Math.max(...costs);
    const kMin = Math.min(...comfort);
    const kMax = Math.max(...comfort);
    // pad degenerate ranges so a 1-point front still draws
    const xLo = cMin === cMax ? cMin * 0.95 : cMin;
    const xHi = cMin === cMax ? cMax * 1.05 : cMax;
    const yLo = kMin === kMax ? kMin - 1 : kMin;
    const yHi = kMin === kMax ? kMax + 1 : kMax;

    const vals = points.map((p) => p[colorKey]).filter((v) => v != null);
    const vLo = vals.length ? Math.min(...vals) : 0;
    const vHi = vals.length ? Math.max(...vals) : 0;

    const x = (v) => PAD.l + ((v - xLo) / (xHi - xLo)) * (W - PAD.l - PAD.r);
    const y = (v) => H - PAD.b - ((v - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b);
    return { xLo, xHi, yLo, yHi, vLo, vHi, x, y };
  }, [points, colorKey]);

  if (!geo) return null;

  const colorFor = (p) => {
    const v = p[colorKey];
    if (v == null) return '#9aa5b8';
    if (geo.vHi === geo.vLo) return lerpColor(0.5);
    return lerpColor((v - geo.vLo) / (geo.vHi - geo.vLo));
  };

  const fmt = (v) => v.toLocaleString('en-IN', { maximumFractionDigits: metric.digits });

  // Point whose coordinates are shown: hovered one wins, else the selected one.
  const active = hovered ?? selected ?? null;
  const rupees = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;

  const renderCallout = (p) => {
    const cx = geo.x(p.cost_inr);
    const cy = geo.y(p.comfort_coldest_hour_c);
    const text = `${rupees(p.cost_inr)} · ${p.comfort_coldest_hour_c.toFixed(1)}°C`;
    const boxW = text.length * 6.6 + 16;
    const boxH = 24;
    // keep the label inside the plot: flip left near right edge, below near top
    let bx = cx + 14;
    if (bx + boxW > W - 4) bx = cx - 14 - boxW;
    let by = cy - boxH - 10;
    if (by < 2) by = cy + 14;
    return (
      <g pointerEvents="none">
        <rect x={bx} y={by} width={boxW} height={boxH} rx={6} fill="#1c2333" opacity="0.94" />
        <text x={bx + boxW / 2} y={by + 16} textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff">
          {text}
        </text>
      </g>
    );
  };

  return (
    <div className="pareto-chart">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <strong style={{ fontSize: '0.95rem' }}>Pareto front — click a design to inspect it</strong>
        <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Colour by{' '}
          <select value={colorKey} onChange={(e) => setColorKey(e.target.value)}>
            {COLOR_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Pareto front: capital cost versus coldest-hour indoor temperature"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {niceTicks(geo.yLo, geo.yHi).map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke="#dde5f3" />
            <text x={PAD.l - 8} y={geo.y(t) + 4} textAnchor="end" fontSize="11" fill="#5c6a85">
              {t.toFixed(1)}°
            </text>
          </g>
        ))}
        {niceTicks(geo.xLo, geo.xHi).map((t) => (
          <g key={`x${t}`}>
            <line x1={geo.x(t)} x2={geo.x(t)} y1={PAD.t} y2={H - PAD.b} stroke="#eef2fa" />
            <text x={geo.x(t)} y={H - PAD.b + 16} textAnchor="middle" fontSize="11" fill="#5c6a85">
              ₹{(t / 1000).toFixed(0)}k
            </text>
          </g>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#5c6a85">
          Capital cost (materials) →
        </text>
        <text
          transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="12"
          fill="#5c6a85"
        >
          Coldest-hour indoor temp →
        </text>

        {points.map((p, i) => {
          const isSel = p === selected;
          const cx = geo.x(p.cost_inr);
          const cy = geo.y(p.comfort_coldest_hour_c);
          const label = `Design ${i + 1}: ₹${Math.round(p.cost_inr).toLocaleString('en-IN')}, coldest hour ${p.comfort_coldest_hour_c.toFixed(1)}°C`;
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={isSel}
              style={{ cursor: 'pointer', outline: 'none' }}
              onClick={() => onSelect(p)}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(p)}
              onBlur={() => setHovered(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p);
                }
              }}
            >
              <title>{label}</title>
              {isSel && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#1c2333" strokeWidth="2" />}
              <circle cx={cx} cy={cy} r={8} fill={colorFor(p)} stroke="#fff" strokeWidth="1.5" />
            </g>
          );
        })}

        {active && renderCallout(active)}
      </svg>

      <div
        className="pareto-readout"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 18px',
          margin: '4px 0 8px',
          padding: '8px 12px',
          borderRadius: 8,
          background: '#f4f7fd',
          border: '1px solid #dde5f3',
          fontSize: '0.8rem',
          color: '#1c2333',
        }}
      >
        {active ? (
          <>
            <span>
              <strong>{active === selected ? 'Selected' : 'Hovering'}</strong>
            </span>
            <span>Cost (x): <strong>{rupees(active.cost_inr)}</strong></span>
            <span>Coldest hour (y): <strong>{active.comfort_coldest_hour_c.toFixed(1)}°C</strong></span>
            <span>Weight: <strong>{Math.round(active.weight_kg).toLocaleString('en-IN')} kg</strong></span>
            <span>
              Carbon:{' '}
              <strong>
                {active.carbon_kgco2e != null ? `${Math.round(active.carbon_kgco2e).toLocaleString('en-IN')} kgCO₂e` : '—'}
              </strong>
            </span>
          </>
        ) : (
          <span style={{ color: '#5c6a85' }}>Click or hover a point to see its coordinates.</span>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.75rem',
          color: 'var(--text-dim)',
        }}
      >
        <span>
          {metric.label}: {fmt(geo.vLo)}
          {metric.unit}
        </span>
        <span
          style={{
            flex: 1,
            maxWidth: 160,
            height: 8,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${lerpColor(0)}, ${lerpColor(1)})`,
          }}
        />
        <span>
          {fmt(geo.vHi)}
          {metric.unit}
        </span>
        {points.some((p) => p[colorKey] == null) && <span>· grey = no data</span>}
      </div>
    </div>
  );
}