// Shared SVG building blocks for the architectural drawings.
// All styling is via presentation attributes (no external CSS), so a drawing
// can be serialised and saved as a standalone .svg file.
import { NOT_AVAILABLE, fmtDateTime, text } from '../../common/format';

export const INK = '#1a1a1a';
export const DIM = '#0b4f8a';
export const STRUCT_FILL = '#d6cfbf';
export const INS_FILL = '#f4e7a8';
export const GLASS_FILL = '#cfe6f7';
export const DOOR_FILL = '#e9d5b5';
export const ROOF_FILL = '#e6e2da';
export const FONT = "'Segoe UI', Arial, sans-serif";
export const MONO = "'Consolas', 'Courier New', monospace";

export const SHEET_W = 1000;
export const TITLE_H = 118;

export function fitScale(extentXm, extentYm, availW, availH, maxK = 140) {
  const kx = availW / Math.max(extentXm, 0.01);
  const ky = availH / Math.max(extentYm, 0.01);
  return Math.min(kx, ky, maxK);
}

/** Horizontal (dir='h') or vertical (dir='v') dimension with ticks + label. */
export function Dim({ x1, y1, x2, y2, label, dir = 'h', textOffset = 6, flip = false }) {
  const tick = 5;
  if (dir === 'h') {
    const mx = (x1 + x2) / 2;
    const ty = flip ? y1 + textOffset + 8 : y1 - textOffset;
    return (
      <g stroke={DIM} strokeWidth="0.9" fill="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} />
        <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} />
        <line x1={x1 - 3} y1={y1 + 3} x2={x1 + 3} y2={y1 - 3} />
        <line x1={x2 - 3} y1={y2 + 3} x2={x2 + 3} y2={y2 - 3} />
        <text x={mx} y={ty} textAnchor="middle" fill={DIM} stroke="none"
          fontFamily={MONO} fontSize="11">{label}</text>
      </g>
    );
  }
  const my = (y1 + y2) / 2;
  const tx = flip ? x1 + textOffset + 14 : x1 - textOffset;
  return (
    <g stroke={DIM} strokeWidth="0.9" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} />
      <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} />
      <line x1={x1 - 3} y1={y1 + 3} x2={x1 + 3} y2={y1 - 3} />
      <line x1={x2 - 3} y1={y2 + 3} x2={x2 + 3} y2={y2 - 3} />
      <text x={tx} y={my} textAnchor="middle" fill={DIM} stroke="none"
        fontFamily={MONO} fontSize="11" transform={`rotate(-90 ${tx} ${my})`}>{label}</text>
    </g>
  );
}

export function NorthArrow({ cx, cy, orientationDeg = 0 }) {
  // orientation_deg = compass bearing that wall_N faces. The drawing's "up"
  // is wall_N, so true north is rotated by -orientation from "up".
  const r = 24;
  const a = (-orientationDeg * Math.PI) / 180;
  const tipX = cx + r * Math.sin(a);
  const tipY = cy - r * Math.cos(a);
  const tailX = cx - r * 0.6 * Math.sin(a);
  const tailY = cy + r * 0.6 * Math.cos(a);
  const px = Math.cos(a) * 7;
  const py = Math.sin(a) * 7;
  return (
    <g stroke={INK} strokeWidth="1.2" fill="none">
      <circle cx={cx} cy={cy} r={r + 8} />
      <line x1={tailX} y1={tailY} x2={tipX} y2={tipY} />
      <polygon points={`${tipX},${tipY} ${tailX + px},${tailY + py} ${tailX - px},${tailY - py}`}
        fill={INK} />
      <text x={tipX + Math.sin(a) * 12} y={tipY - Math.cos(a) * 12 + 4} textAnchor="middle"
        fill={INK} stroke="none" fontFamily={FONT} fontSize="13" fontWeight="700">N</text>
    </g>
  );
}

/** A 1 m bar drawn at the SAME px/m as the drawing itself (graphic scale). */
export function ScaleBar({ x, y, k }) {
  return (
    <g stroke={INK} strokeWidth="1" fill="none">
      <line x1={x} y1={y} x2={x + k} y2={y} />
      <line x1={x} y1={y - 4} x2={x} y2={y + 4} />
      <line x1={x + k} y1={y - 4} x2={x + k} y2={y + 4} />
      <rect x={x} y={y - 3} width={k / 2} height="3" fill={INK} />
      <text x={x + k / 2} y={y - 9} textAnchor="middle" fill={INK} stroke="none"
        fontFamily={MONO} fontSize="10">1 m (graphic scale)</text>
    </g>
  );
}

export function HatchDefs() {
  return (
    <defs>
      <pattern id="bp-ins-hatch" width="6" height="6" patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)">
        <rect width="6" height="6" fill={INS_FILL} />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#b39a2f" strokeWidth="1" />
      </pattern>
      <pattern id="bp-ground-hatch" width="8" height="8" patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="8" stroke="#777" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

export function Legend({ x, y, items }) {
  return (
    <g fontFamily={FONT} fontSize="10.5" fill={INK}>
      <text x={x} y={y} fontWeight="700" fontSize="11">LEGEND</text>
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${x}, ${y + 10 + i * 17})`}>
          <rect width="18" height="10" fill={it.fill} stroke={INK} strokeWidth="0.8"
            strokeDasharray={it.dash ?? undefined} />
          <text x="26" y="9">{it.label}</text>
        </g>
      ))}
    </g>
  );
}

/** Title block: identifies project / design / drawing on EVERY sheet. */
export function TitleBlock({ y, drawingTitle, sheetNo, trace, orientationDeg, note }) {
  const w = SHEET_W;
  const col = (frac) => 8 + (w - 16) * frac;
  const t = (v) => text(v, NOT_AVAILABLE);
  const loc = trace?.siteLabel
    ? `${trace.siteLabel}${trace.location ? ` · ${trace.location}` : ''}`
    : trace?.siteId ?? NOT_AVAILABLE;
  return (
    <g fontFamily={FONT} fill={INK}>
      <rect x="8" y={y} width={w - 16} height={TITLE_H - 8} fill="#fff" stroke={INK} strokeWidth="1.4" />
      <line x1="8" y1={y + 30} x2={w - 8} y2={y + 30} stroke={INK} strokeWidth="0.8" />
      <line x1={col(0.58)} y1={y} x2={col(0.58)} y2={y + TITLE_H - 8} stroke={INK} strokeWidth="0.8" />
      <text x="18" y={y + 21} fontSize="15" fontWeight="700">{drawingTitle}</text>
      <text x="18" y={y + 47} fontSize="11">
        <tspan fontWeight="700">Project: </tspan>{' '}{t(trace?.projectName ?? 'Not specified')}
      </text>
      <text x="18" y={y + 63} fontSize="11">
        <tspan fontWeight="700">Design: </tspan>{' '}{t(trace?.designName)}
      </text>
      <text x="18" y={y + 79} fontSize="11">
        <tspan fontWeight="700">Design ID: </tspan>{' '}{t(trace?.designId)}
      </text>
      <text x="18" y={y + 95} fontSize="11">
        <tspan fontWeight="700">Site: </tspan>{' '}{loc}
      </text>
      <text x={col(0.58) + 10} y={y + 21} fontSize="11">
        <tspan fontWeight="700">Sheet: </tspan>{' '}{sheetNo}
      </text>
      <text x={col(0.58) + 10} y={y + 47} fontSize="11">
        <tspan fontWeight="700">Date: </tspan>{' '}{fmtDateTime(trace?.generated)}
      </text>
      <text x={col(0.58) + 10} y={y + 63} fontSize="11">
        <tspan fontWeight="700">Units: </tspan>{' '}metres (m)
      </text>
      <text x={col(0.58) + 10} y={y + 79} fontSize="11">
        <tspan fontWeight="700">Scale: </tspan>{' '}Not to scale — use dimensions / graphic bar
      </text>
      <text x={col(0.58) + 10} y={y + 95} fontSize="11">
        <tspan fontWeight="700">Building orientation: </tspan>{' '}
        wall N faces {Number.isFinite(orientationDeg) ? `${orientationDeg.toFixed(0)}° (compass)` : NOT_AVAILABLE}
      </text>
      {note ? (
        <text x="18" y={y - 8} fontSize="10" fill="#555" fontStyle="italic">{note}</text>
      ) : null}
    </g>
  );
}

export function Sheet({ width = SHEET_W, height, children, ariaLabel, svgId }) {
  return (
    <svg
      id={svgId}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={ariaLabel}
      style={{ background: '#fff', display: 'block', maxWidth: '100%' }}
    >
      <HatchDefs />
      <rect x="0" y="0" width={width} height={height} fill="#fff" />
      {children}
    </svg>
  );
}
