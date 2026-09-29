import { WALLS, WALL_NAMES, deriveOpenings, wallBearings } from '../designInput.js';

const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/**
 * Four to-scale elevations (as seen from OUTSIDE the shelter), one per wall.
 * Windows are blue, doors brown; anything overlapping or off the wall turns red.
 * Click an opening to select it in the list.
 */
export default function WallSchematic({ design, selectedId, onSelect }) {
  const od = deriveOpenings(design);
  const bearings = wallBearings(design.geometry.orientationDeg);
  const H = Number(design.geometry.heightM) || 1;

  return (
    <div className="dw-elevs">
      {WALLS.map((label) => {
        const w = od.walls[label];
        const bad = new Set([...w.overlaps.flat(), ...w.outOfBounds]);
        const L = w.lengthM || 1;
        const pos = Object.fromEntries(w.placed.map((p) => [p.id, p]));
        return (
          <figure key={label} className="dw-elev">
            <figcaption>
              <strong>{WALL_NAMES[label]} wall</strong>
              <span>faces {Math.round(bearings[label])}° ({compass(bearings[label])}) · {L.toFixed(1)} × {H.toFixed(1)} m</span>
            </figcaption>
            <svg
              viewBox={`-0.15 -0.15 ${L + 0.3} ${H + 0.3}`}
              style={{ aspectRatio: `${L + 0.3} / ${H + 0.3}` }}
              role="img"
              aria-label={`${WALL_NAMES[label]} wall elevation with ${w.items.length} opening(s)`}
            >
              <rect x="0" y="0" width={L} height={H} className="dw-elev-wall" />
              <line x1="-0.15" x2={L + 0.15} y1={H} y2={H} className="dw-elev-ground" />
              {w.items.map((it) => {
                const p = pos[it.id];
                if (!p) return null;
                const ih = Number(it.heightM) || 0;
                const y = it.kind === 'door' ? H - ih : H - (Number(it.sillM) || 0) - ih;
                const cls = `dw-elev-${it.kind} ${bad.has(it.id) ? 'bad' : ''} ${selectedId === it.id ? 'sel' : ''}`;
                return (
                  <rect
                    key={it.id} x={p.x0} y={y} width={Number(it.widthM) || 0} height={ih} className={cls}
                    onClick={() => onSelect?.(it.id)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(it.id); }}
                  >
                    <title>{`${it.kind === 'door' ? 'Door' : 'Window'} ${Number(it.widthM).toFixed(2)} × ${ih.toFixed(2)} m`}</title>
                  </rect>
                );
              })}
            </svg>
            <p className="dw-elev-meta">
              {w.items.length === 0
                ? 'No openings'
                : `${w.openingsM2.toFixed(1)} m² openings · ${Math.round(w.openingRatio * 100)}% of wall`}
            </p>
          </figure>
        );
      })}
    </div>
  );
}
