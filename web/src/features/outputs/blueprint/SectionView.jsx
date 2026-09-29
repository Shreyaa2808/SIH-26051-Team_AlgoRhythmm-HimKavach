import { fmtM, fmtMm, isNum } from '../../common/format';
import { roofProfileNS } from './geometry';
import {
  Dim, INK, INS_FILL, ROOF_FILL, ScaleBar, Sheet, STRUCT_FILL, TITLE_H, TitleBlock, FONT, MONO,
  SHEET_W, Legend,
} from './drawingKit';

const layerLine = (label, t, matName, tKnown) =>
  `${label}: ${tKnown ? fmtMm(t) : 'thickness not resolved'}${matName ? ` · ${matName}` : ' · material not specified'}`;

export default function SectionView({ model, trace, sheetNo = 'A-06', svgId }) {
  const { W, H } = model;
  const prof = roofProfileNS(model);
  const hS = prof?.south ?? 0;
  const hN = prof?.north ?? 0;
  const roofMaxRise = Math.max(hS, hN);
  const beta = model.roof ? (model.roof.slopeDeg * Math.PI) / 180 : 0;
  const vert = (t) => (isNum(t) ? t / Math.max(Math.cos(beta), 0.2) : 0);

  const floorT = (model.floor?.structT ?? 0) + (model.floor?.insT ?? 0);
  const roofT = (model.roof?.structT ?? 0) + (model.roof?.insT ?? 0);

  const availW = 520;
  const availH = 330;
  const k = Math.min(availW / W, availH / (H + roofMaxRise + floorT + roofT), 110);
  const px = (m) => m * k;

  const ox = 190;
  const topPad = 96;
  const datumY = topPad + px(H + roofMaxRise + vert(roofT)) + 6; // floor finish (inside) level
  const sheetH = datumY + px(floorT) + 130 + TITLE_H;

  const S = model.walls.S;
  const N = model.walls.N;
  const wallTop = (edgeRise) => datumY - px(H + edgeRise);

  // wall cuts: S on the left, N on the right (viewer looking west)
  const sTs = px(S.structT ?? 0);
  const sTi = px(S.insT ?? 0);
  const nTs = px(N.structT ?? 0);
  const nTi = px(N.insT ?? 0);
  const x0 = ox;
  const x1 = ox + px(W);

  // roof underside points (at inside face line of each wall edge)
  const undS = datumY - px(H + hS);
  const undN = datumY - px(H + hN);
  const tsV = px(vert(model.roof?.structT ?? 0));
  const tiV = px(vert(model.roof?.insT ?? 0));
  const roofKnown = model.roof && isNum(model.roof.structT) && isNum(model.roof.insT);

  const nm = model.matName;
  const roof = model.roof;
  const floor = model.floor;

  return (
    <Sheet height={sheetH} ariaLabel="Section A-A" svgId={svgId}>
      <text x="18" y="30" fontFamily={FONT} fontSize="15" fontWeight="700" fill={INK}>SECTION A–A</text>
      <text x="18" y="48" fontFamily={FONT} fontSize="11" fill="#444">
        North–south cut through mid-length, viewed looking west (south on the left, north on the right)
      </text>

      {/* floor build-up: insulation on the inside (top), structural on the ground side */}
      {floor ? (
        <g stroke={INK} strokeWidth="1">
          {floor.hasInsulation && isNum(floor.insT) ? (
            <rect x={x0} y={datumY} width={px(W)} height={px(floor.insT)} fill="url(#bp-ins-hatch)" />
          ) : null}
          {isNum(floor.structT) ? (
            <rect x={x0} y={datumY + px(floor.insT ?? 0)} width={px(W)} height={px(floor.structT)}
              fill={STRUCT_FILL} />
          ) : null}
        </g>
      ) : null}
      <rect x={x0 - 40} y={datumY + px(floorT)} width={px(W) + 80} height="9" fill="url(#bp-ground-hatch)" />
      <line x1={x0 - 40} y1={datumY + px(floorT)} x2={x1 + 40} y2={datumY + px(floorT)}
        stroke={INK} strokeWidth="1.6" />

      {/* south wall (left): structural outside (left), insulation inside (right) */}
      <g stroke={INK} strokeWidth="1.2">
        <rect x={x0} y={undS} width={sTs} height={datumY - undS} fill={STRUCT_FILL} />
        {S.hasInsulation ? (
          <rect x={x0 + sTs} y={undS} width={sTi} height={datumY - undS} fill="url(#bp-ins-hatch)" />
        ) : null}
        {/* north wall (right): structural outside (right), insulation inside (left) */}
        <rect x={x1 - nTs} y={undN} width={nTs} height={datumY - undN} fill={STRUCT_FILL} />
        {N.hasInsulation ? (
          <rect x={x1 - nTs - nTi} y={undN} width={nTi} height={datumY - undN} fill="url(#bp-ins-hatch)" />
        ) : null}
      </g>

      {/* roof: sloped band, insulation directly above the underside (inside), structural above that */}
      {roof && roofKnown ? (
        <g stroke={INK} strokeWidth="1.2">
          <polygon
            points={`${x0},${undS} ${x1},${undN} ${x1},${undN - tiV} ${x0},${undS - tiV}`}
            fill="url(#bp-ins-hatch)" />
          <polygon
            points={`${x0},${undS - tiV} ${x1},${undN - tiV} ${x1},${undN - tiV - tsV} ${x0},${undS - tiV - tsV}`}
            fill={STRUCT_FILL} />
        </g>
      ) : roof ? (
        <line x1={x0} y1={undS} x2={x1} y2={undN} stroke={INK} strokeWidth="1.6" strokeDasharray="6 4" />
      ) : null}

      {/* interior air space label */}
      <text x={(x0 + x1) / 2} y={datumY - px(H) / 2} textAnchor="middle" fontFamily={FONT}
        fontSize="11" fill="#666">Interior (single thermal zone)</text>

      {/* dimensions */}
      <Dim x1={x0 - 44} y1={undS} x2={x0 - 44} y2={datumY} dir="v"
        label={`${fmtM(H)} ceiling`} />
      {roofMaxRise > 0.005 ? (
        <Dim x1={x1 + 64} y1={Math.min(undS, undN)} x2={x1 + 64} y2={Math.max(undS, undN)} dir="v" flip
          label={`${fmtM(Math.abs(hN - hS))} roof rise`} />
      ) : null}
      {floor && isNum(floorT) && floorT > 0 ? (
        <Dim x1={x0 - 84} y1={datumY} x2={x0 - 84} y2={datumY + px(floorT)} dir="v"
          label={`${fmtMm(floorT)} floor`} />
      ) : null}
      <Dim x1={x0} y1={datumY + px(floorT) + 40} x2={x1} y2={datumY + px(floorT) + 40}
        label={`${fmtM(W)} (width, N–S)`} flip />
      <text x={x0 + 2} y={datumY + px(floorT) + 66} fontFamily={MONO} fontSize="10.5" fill={INK}>
        S wall {isNum(S.totalT) ? fmtMm(S.totalT) : 'thickness n/r'}
      </text>
      <text x={x1 - 2} y={datumY + px(floorT) + 66} textAnchor="end" fontFamily={MONO} fontSize="10.5" fill={INK}>
        N wall {isNum(N.totalT) ? fmtMm(N.totalT) : 'thickness n/r'}
      </text>

      {/* construction key: all values from the design + materials database */}
      <g fontFamily={MONO} fontSize="10.5" fill={INK}>
        <text x={SHEET_W - 300} y="92" fontFamily={FONT} fontWeight="700" fontSize="11.5">
          CONSTRUCTION (outside → inside)
        </text>
        {[
          ['Roof', roof ? [
            layerLine('structural', roof.structT, nm(roof.structMaterialId), isNum(roof.structT)),
            roof.hasInsulation ? layerLine('insulation', roof.insT, nm(roof.insMaterialId), isNum(roof.insT)) : 'no insulation layer',
          ] : ['not defined']],
          ['Wall S', [
            layerLine('structural', S.structT, nm(S.structMaterialId), isNum(S.structT)),
            S.hasInsulation ? layerLine('insulation', S.insT, nm(S.insMaterialId), isNum(S.insT)) : 'no insulation layer',
          ]],
          ['Wall N', [
            layerLine('structural', N.structT, nm(N.structMaterialId), isNum(N.structT)),
            N.hasInsulation ? layerLine('insulation', N.insT, nm(N.insMaterialId), isNum(N.insT)) : 'no insulation layer',
          ]],
          ['Floor (ground → inside)', floor ? [
            layerLine('structural', floor.structT, nm(floor.structMaterialId), isNum(floor.structT)),
            floor.hasInsulation ? layerLine('insulation', floor.insT, nm(floor.insMaterialId), isNum(floor.insT)) : 'no insulation layer',
          ] : ['not defined']],
        ].flatMap(([title, lines], gi) => {
          const base = 112 + gi * 74;
          return [
            <text key={`t-${title}`} x={SHEET_W - 300} y={base} fontWeight="700">{title}</text>,
            ...lines.map((ln, li) => (
              <text key={`${title}-${li}`} x={SHEET_W - 296} y={base + 14 + li * 13}>{ln}</text>
            )),
          ];
        })}
      </g>

      <Legend x={SHEET_W - 300} y={112 + 4 * 74 + 6} items={[
        { label: 'Structural layer', fill: STRUCT_FILL },
        { label: 'Insulation layer', fill: INS_FILL },
        { label: 'Roof projection (elevations)', fill: ROOF_FILL },
      ]} />
      <ScaleBar x={x0} y={datumY + px(floorT) + 100} k={k} />
      <TitleBlock y={sheetH - TITLE_H} drawingTitle="SECTION A–A" sheetNo={sheetNo} trace={trace}
        orientationDeg={model.orientationDeg}
        note="Layer order follows the thermal solver (structural outside, insulation inside). n/r = thickness not resolved." />
    </Sheet>
  );
}
