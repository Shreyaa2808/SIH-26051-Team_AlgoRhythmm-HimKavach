import { fmtM, fmtMm, isNum } from '../../common/format';
import {
  Dim, DOOR_FILL, GLASS_FILL, INK, INS_FILL, Legend, NorthArrow, ScaleBar, Sheet, SHEET_W,
  STRUCT_FILL, TITLE_H, TitleBlock, FONT, MONO,
} from './drawingKit';

const AREA_W = 640;
const AREA_H = 400;
const OX = 190;
const OY = 150;

/** Band rectangle helper: returns rects for structural + insulation strips. */
function wallStrips(cardinal, ox, oy, Lpx, Wpx, ts, ti, tN, tS) {
  // ts/ti = px thickness of structural/insulation; tN/tS = px thickness of N/S walls
  // (E/W bands are shortened so corners are not double-drawn)
  switch (cardinal) {
    case 'N':
      return [
        { x: ox, y: oy, w: Lpx, h: ts, kind: 'struct' },
        { x: ox, y: oy + ts, w: Lpx, h: ti, kind: 'ins' },
      ];
    case 'S':
      return [
        { x: ox, y: oy + Wpx - ts, w: Lpx, h: ts, kind: 'struct' },
        { x: ox, y: oy + Wpx - ts - ti, w: Lpx, h: ti, kind: 'ins' },
      ];
    case 'W':
      return [
        { x: ox, y: oy + tN, w: ts, h: Wpx - tN - tS, kind: 'struct' },
        { x: ox + ts, y: oy + tN, w: ti, h: Wpx - tN - tS, kind: 'ins' },
      ];
    default: // E
      return [
        { x: ox + Lpx - ts, y: oy + tN, w: ts, h: Wpx - tN - tS, kind: 'struct' },
        { x: ox + Lpx - ts - ti, y: oy + tN, w: ti, h: Wpx - tN - tS, kind: 'ins' },
      ];
  }
}

export default function PlanView({ model, trace, sheetNo = 'A-01', svgId }) {
  const { L, W, orientationDeg } = model;
  const k = Math.min(AREA_W / L, AREA_H / W, 120);
  const Lpx = L * k;
  const Wpx = W * k;
  const px = (m) => (isNum(m) ? m * k : 0);

  const N = model.walls.N;
  const S = model.walls.S;
  const tNpx = px(N.totalT);
  const tSpx = px(S.totalT);

  const sheetH = OY + Wpx + 120 + TITLE_H;
  const titleY = sheetH - TITLE_H;

  const cells = [];
  const strips = [];
  const labels = [];

  for (const c of ['N', 'E', 'S', 'W']) {
    const w = model.walls[c];
    const ts = px(w.structT);
    const ti = px(w.insT);
    const known = isNum(w.totalT);
    if (known) {
      wallStrips(c, OX, OY, Lpx, Wpx, ts, ti, tNpx, tSpx).forEach((r, i) => {
        if (r.w > 0 && r.h > 0) {
          strips.push(
            <rect key={`${c}-s-${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
              fill={r.kind === 'ins' ? 'url(#bp-ins-hatch)' : STRUCT_FILL}
              stroke={INK} strokeWidth="1" />,
          );
        }
      });
    } else {
      // thickness unknown -> draw only a dashed centreline, never a guessed band
      const line = {
        N: [OX, OY, OX + Lpx, OY], S: [OX, OY + Wpx, OX + Lpx, OY + Wpx],
        W: [OX, OY, OX, OY + Wpx], E: [OX + Lpx, OY, OX + Lpx, OY + Wpx],
      }[c];
      strips.push(
        <line key={`${c}-unk`} x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]}
          stroke={INK} strokeWidth="1.6" strokeDasharray="6 4" />,
      );
    }

    // openings: convert "offset from left edge seen from OUTSIDE" to plan coordinates
    const bandT = known ? ts + ti : 6;
    for (const o of w.openings) {
      const wpx = px(o.widthM);
      let rx; let ry; let rw; let rh;
      if (c === 'N') { rx = OX + Lpx - px(o.offsetXM) - wpx; ry = OY; rw = wpx; rh = bandT; }
      else if (c === 'S') { rx = OX + px(o.offsetXM); ry = OY + Wpx - bandT; rw = wpx; rh = bandT; }
      else if (c === 'E') { rx = OX + Lpx - bandT; ry = OY + Wpx - px(o.offsetXM) - wpx; rw = bandT; rh = wpx; }
      else { rx = OX; ry = OY + px(o.offsetXM); rw = bandT; rh = wpx; }
      const fill = o.type === 'window' ? GLASS_FILL : o.type === 'door' ? DOOR_FILL : '#fff';
      cells.push(
        <g key={o.id}>
          <rect x={rx} y={ry} width={rw} height={rh} fill={fill} stroke={INK} strokeWidth="1"
            strokeDasharray={o.type === 'vent' ? '3 2' : undefined} />
          {o.type === 'window' ? (
            c === 'N' || c === 'S'
              ? <line x1={rx} y1={ry + rh / 2} x2={rx + rw} y2={ry + rh / 2} stroke={INK} strokeWidth="1.4" />
              : <line x1={rx + rw / 2} y1={ry} x2={rx + rw / 2} y2={ry + rh} stroke={INK} strokeWidth="1.4" />
          ) : null}
          <text
            x={c === 'E' ? rx + rw + 6 : c === 'W' ? rx - 6 : rx + rw / 2}
            y={c === 'N' ? ry - 5 : c === 'S' ? ry + rh + 13 : ry + rh / 2 + 4}
            textAnchor={c === 'E' ? 'start' : c === 'W' ? 'end' : 'middle'}
            fontFamily={MONO} fontSize="10.5" fill={INK}>{o.id}</text>
        </g>,
      );
    }

    // wall build-up callout outside the footprint
    const desc = `${c} wall  ${isNum(w.structT) ? fmtMm(w.structT) : 'thickness n/r'}${
      w.hasInsulation ? ` + ${isNum(w.insT) ? fmtMm(w.insT) : 'n/r'} ins.` : ''}`;
    const pos = {
      N: [OX + Lpx / 2, OY - 24, 'middle'],
      S: [OX + Lpx / 2, OY + Wpx + 36, 'middle'],
      W: [OX - 26, OY + Wpx / 2, 'end'],
      E: [OX + Lpx + 30, OY + Wpx / 2, 'start'],
    }[c];
    if (c === 'W') {
      labels.push(
        <text key={`lbl-${c}`} x={pos[0] - 8} y={pos[1]} textAnchor="middle"
          transform={`rotate(-90 ${pos[0] - 8} ${pos[1]})`}
          fontFamily={MONO} fontSize="10.5" fill={INK}>{desc}</text>,
      );
    } else if (c === 'E') {
      labels.push(
        <text key={`lbl-${c}`} x={pos[0] + 8} y={pos[1]} textAnchor="middle"
          transform={`rotate(90 ${pos[0] + 8} ${pos[1]})`}
          fontFamily={MONO} fontSize="10.5" fill={INK}>{desc}</text>,
      );
    } else {
      labels.push(
        <text key={`lbl-${c}`} x={pos[0]} y={pos[1]} textAnchor={pos[2]}
          fontFamily={MONO} fontSize="10.5" fill={INK}>{desc}</text>,
      );
    }
  }

  // roof fall arrow (only when the roof is actually sloped)
  let roofArrow = null;
  if (model.roof && model.roof.slopeDeg > 0) {
    const f = model.roof.frame;
    const cx = OX + Lpx / 2;
    const cy = OY + Wpx / 2;
    const len = Math.min(Lpx, Wpx) * 0.28;
    const dx = f.downslope.x * len;
    const dy = -f.downslope.y * len;
    roofArrow = (
      <g stroke="#7a3f00" strokeWidth="1.4" fill="none">
        <line x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />
        <polygon points={`${cx + dx},${cy + dy} ${cx + dx * 0.78 - dy * 0.12},${cy + dy * 0.78 + dx * 0.12} ${cx + dx * 0.78 + dy * 0.12},${cy + dy * 0.78 - dx * 0.12}`} fill="#7a3f00" />
        <text x={cx} y={cy + Math.min(Lpx, Wpx) * 0.28 + 24} textAnchor="middle" stroke="none"
          fill="#7a3f00" fontFamily={MONO} fontSize="10.5">
          roof falls toward {model.roof.bearingDeg.toFixed(0)}° · slope {model.roof.slopeDeg.toFixed(1)}°
        </text>
      </g>
    );
  }

  const noOpenings = model.openings.length === 0;

  return (
    <Sheet height={sheetH} ariaLabel="Plan view" svgId={svgId}>
      <text x="18" y="30" fontFamily={FONT} fontSize="15" fontWeight="700" fill={INK}>PLAN</text>
      <text x="18" y="48" fontFamily={FONT} fontSize="11" fill="#444">
        Footprint as modelled; wall layers outside → inside (structural, insulation)
      </text>

      {strips}
      {cells}
      {roofArrow}
      {labels}

      <Dim x1={OX} y1={OY - 62} x2={OX + Lpx} y2={OY - 62} label={`${fmtM(L)} (length, N/S walls)`} />
      <Dim x1={OX - 90} y1={OY} x2={OX - 90} y2={OY + Wpx} dir="v" label={`${fmtM(W)} (width, E/W walls)`} />

      {noOpenings ? (
        <text x={OX + Lpx / 2} y={OY + Wpx / 2 + (roofArrow ? -Math.min(Lpx, Wpx) * 0.3 : 0)}
          textAnchor="middle" fontFamily={FONT} fontSize="11" fill="#666">
          No openings defined in this design
        </text>
      ) : null}

      <NorthArrow cx={SHEET_W - 90} cy={OY + 10} orientationDeg={orientationDeg} />
      <Legend x={SHEET_W - 190} y={OY + 70} items={[
        { label: 'Structural layer', fill: STRUCT_FILL },
        { label: 'Insulation layer', fill: INS_FILL },
        { label: 'Window', fill: GLASS_FILL },
        { label: 'Door', fill: DOOR_FILL },
        { label: 'Vent', fill: '#fff', dash: '3 2' },
      ]} />
      <ScaleBar x={OX} y={OY + Wpx + 84} k={k} />
      <TitleBlock y={titleY} drawingTitle="PLAN" sheetNo={sheetNo} trace={trace}
        orientationDeg={orientationDeg}
        note="Opening offsets are measured from the wall's left edge as seen from outside. n/r = thickness not resolved." />
    </Sheet>
  );
}
