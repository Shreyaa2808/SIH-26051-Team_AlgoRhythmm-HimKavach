import { fmtM, isNum } from '../../common/format';
import { roofSilhouette } from './geometry';
import {
  Dim, DOOR_FILL, GLASS_FILL, INK, Legend, ROOF_FILL, ScaleBar, Sheet, STRUCT_FILL, TITLE_H,
  TitleBlock, FONT, MONO, SHEET_W,
} from './drawingKit';

const NAMES = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
const BASE = { N: 0, E: 90, S: 180, W: 270 };

export default function ElevationView({ model, cardinal, trace, sheetNo, svgId }) {
  const wall = model.walls[cardinal];
  const spanM = wall.lengthM;
  const H = model.H;
  const hull = roofSilhouette(model, cardinal); // [u, y above wall top] (metres)
  const roofMax = hull ? Math.max(...hull.map((p) => p[1])) : 0;

  const k = Math.min(620 / spanM, 320 / (H + roofMax), 120);
  const ox = 200;
  const groundY = 90 + (H + roofMax) * k + 30;
  const px = (m) => m * k;
  const wallTopY = groundY - px(H);
  const sheetH = groundY + 90 + TITLE_H;
  const facing = (BASE[cardinal] + model.orientationDeg) % 360;

  const roofPoly = hull && roofMax > 0.005
    ? hull.map(([u, y]) => `${ox + px(u)},${wallTopY - px(y)}`).join(' ')
    : null;

  return (
    <Sheet height={sheetH} ariaLabel={`${NAMES[cardinal]} elevation`} svgId={svgId}>
      <text x="18" y="30" fontFamily={FONT} fontSize="15" fontWeight="700" fill={INK}>
        {NAMES[cardinal]} ELEVATION
      </text>
      <text x="18" y="48" fontFamily={FONT} fontSize="11" fill="#444">
        Viewed from outside · wall faces compass bearing {facing.toFixed(0)}°
      </text>

      {/* roof projection (derived from slope + orientation + footprint) */}
      {roofPoly ? (
        <polygon points={roofPoly} fill={ROOF_FILL} stroke={INK} strokeWidth="1.3" />
      ) : null}

      {/* wall */}
      <rect x={ox} y={wallTopY} width={px(spanM)} height={px(H)} fill={STRUCT_FILL}
        stroke={INK} strokeWidth="1.6" />

      {/* openings: x from left edge seen from outside, z = sill height */}
      {wall.openings.map((o) => {
        const x = ox + px(o.offsetXM);
        const y = groundY - px(o.sillM) - px(o.heightM);
        const fill = o.type === 'window' ? GLASS_FILL : o.type === 'door' ? DOOR_FILL : '#fff';
        return (
          <g key={o.id}>
            <rect x={x} y={y} width={px(o.widthM)} height={px(o.heightM)} fill={fill} stroke={INK}
              strokeWidth="1.2" strokeDasharray={o.type === 'vent' ? '3 2' : undefined} />
            {o.type === 'window' ? (
              <>
                <line x1={x + px(o.widthM) / 2} y1={y} x2={x + px(o.widthM) / 2} y2={y + px(o.heightM)}
                  stroke={INK} strokeWidth="0.8" />
                <line x1={x} y1={y + px(o.heightM) / 2} x2={x + px(o.widthM)} y2={y + px(o.heightM) / 2}
                  stroke={INK} strokeWidth="0.8" />
              </>
            ) : null}
            <text x={x + px(o.widthM) / 2} y={y - 5} textAnchor="middle" fontFamily={MONO}
              fontSize="10.5" fill={INK}>{o.id}</text>
          </g>
        );
      })}

      {/* ground line */}
      <line x1={ox - 40} y1={groundY} x2={ox + px(spanM) + 40} y2={groundY} stroke={INK} strokeWidth="1.6" />
      <rect x={ox - 40} y={groundY} width={px(spanM) + 80} height="9" fill="url(#bp-ground-hatch)" />

      {/* dimensions */}
      <Dim x1={ox} y1={wallTopY - px(roofMax) - 34} x2={ox + px(spanM)} y2={wallTopY - px(roofMax) - 34}
        label={`${fmtM(spanM)} (wall length)`} />
      <Dim x1={ox - 46} y1={wallTopY} x2={ox - 46} y2={groundY} dir="v"
        label={`${fmtM(H)} ceiling`} />
      {roofPoly ? (
        <Dim x1={ox + px(spanM) + 46} y1={wallTopY - px(roofMax)} x2={ox + px(spanM) + 46} y2={wallTopY}
          dir="v" flip label={`${fmtM(roofMax)} roof rise`} />
      ) : null}

      {wall.openings.length === 0 ? (
        <text x={ox + px(spanM) / 2} y={groundY - px(H) / 2} textAnchor="middle" fontFamily={FONT}
          fontSize="11" fill="#666">No openings on this wall</text>
      ) : null}

      <Legend x={SHEET_W - 190} y={90} items={[
        { label: 'Wall (outside face)', fill: STRUCT_FILL },
        { label: 'Roof projection', fill: ROOF_FILL },
        { label: 'Window', fill: GLASS_FILL },
        { label: 'Door', fill: DOOR_FILL },
        { label: 'Vent', fill: '#fff', dash: '3 2' },
      ]} />
      <ScaleBar x={ox} y={groundY + 50} k={k} />
      <TitleBlock y={sheetH - TITLE_H} drawingTitle={`${NAMES[cardinal]} ELEVATION`} sheetNo={sheetNo}
        trace={trace} orientationDeg={model.orientationDeg}
        note={isNum(roofMax) && roofMax > 0
          ? 'Roof outline is a projection derived from roof slope, roof orientation and footprint; no roof details are drawn.'
          : 'Flat roof: no rise shown.'} />
    </Sheet>
  );
}
