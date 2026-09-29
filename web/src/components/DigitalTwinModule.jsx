import { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

import { API } from '../api';
const CARDINALS = ['N', 'E', 'S', 'W'];

function normalizeVisualOpenings(openings = [], wallLength = 4) {
  const list = openings.map((o) => ({ ...o }));
  const auto = list.filter((o) => o.offset_x_m == null);
  if (!auto.length) return list;
  const totalAutoWidth = auto.reduce((sum, o) => sum + Number(o.width_m || 0.8), 0);
  const gap = Math.max(0.18, (wallLength - totalAutoWidth) / (auto.length + 1));
  let autoIndex = 0;
  return list.map((o) => {
    if (o.offset_x_m != null) return o;
    autoIndex += 1;
    const before = auto.slice(0, autoIndex - 1).reduce((sum, x) => sum + Number(x.width_m || 0.8), 0);
    return { ...o, offset_x_m: gap * autoIndex + before };
  });
}

function designInputToVisualModel(input) {
  if (!input) return null;
  const g = input.geometry || {};
  const env = input.envelope || {};
  const part = (key, fallback = 0.1) => ({
    materialId: env[key]?.materialId || null,
    thicknessM: Number(env[key]?.thicknessM) > 0 ? Number(env[key].thicknessM) : fallback,
  });
  const openings = input.openings || { windows: [], doors: [] };
  const walls = CARDINALS.map((cardinal) => {
    const wallLength = cardinal === 'N' || cardinal === 'S' ? Number(g.lengthM || 4) : Number(g.widthM || 4);
    const wallOpenings = [
      ...(openings.windows || [])
        .filter((o) => o.wall === cardinal)
        .map((o) => ({
          type: 'window',
          width_m: Number(o.widthM || 1.2),
          height_m: Number(o.heightM || 1),
          offset_x_m: o.offsetM,
          offset_z_m: Number(o.sillM || 0.9),
        })),
      ...(openings.doors || [])
        .filter((o) => o.wall === cardinal)
        .map((o) => ({
          type: 'door',
          width_m: Number(o.widthM || 0.9),
          height_m: Number(o.heightM || 2),
          offset_x_m: o.offsetM,
          offset_z_m: 0,
        })),
    ];
    return {
      cardinal,
      structural_material_id: env.wall?.materialId || 'recommended-wall',
      insulation_material_id: env.insulation?.materialId || null,
      structural_thickness_m: part('wall', 0.3).thicknessM,
      insulation_thickness_m: part('insulation', 0.1).thicknessM,
      openings: normalizeVisualOpenings(wallOpenings, wallLength),
    };
  });
  return {
    name: input.shelter?.type ? `${input.shelter.type} shelter` : 'HimKavach shelter',
    site_id: input.site?.siteId || '—',
    length_m: Number(g.lengthM || 4),
    width_m: Number(g.widthM || 4),
    ceiling_height_m: Number(g.heightM || 2.4),
    orientation_deg: Number(g.orientationDeg || 0),
    occupancy: { purpose: input.shelter?.type || 'personnel' },
    walls,
    roof: {
      structural_material_id: part('roof', 0.12).materialId || 'recommended-roof',
      insulation_material_id: part('insulation', 0.1).materialId || null,
      slope_deg: Number(g.roofSlopeDeg || 0),
      orientation_deg: 0,
    },
  };
}

const PURPOSES = [
  ['military_forward_post', 'Military — forward post'],
  ['military_permanent', 'Military — permanent garrison'],
  ['research_station', 'Research station'],
  ['civilian_expedition', 'Civilian — expedition'],
  ['civilian_permanent', 'Civilian — permanent dwelling'],
];

const CATEGORY_COLOR = {
  'structural/thermal mass': '#b8a888',
  structural: '#9aa3ad',
  'structural + insulation composite': '#c9b98f',
  insulation: '#e8e2d0',
  glazing: '#8fd0e8',
  'radiant control': '#d9d9d9',
};

function carveRect(rects, hole) {
  const out = [];

  for (const r of rects) {
    const ix1 = Math.max(r.x, hole.x);
    const ix2 = Math.min(r.x2, hole.x2);
    const iz1 = Math.max(r.z, hole.z);
    const iz2 = Math.min(r.z2, hole.z2);

    if (ix1 >= ix2 || iz1 >= iz2) {
      out.push(r);
      continue;
    }

    if (r.x < ix1) {
      out.push({
        x: r.x,
        x2: ix1,
        z: r.z,
        z2: r.z2,
      });
    }

    if (ix2 < r.x2) {
      out.push({
        x: ix2,
        x2: r.x2,
        z: r.z,
        z2: r.z2,
      });
    }

    if (r.z < iz1) {
      out.push({
        x: ix1,
        x2: ix2,
        z: r.z,
        z2: iz1,
      });
    }

    if (iz2 < r.z2) {
      out.push({
        x: ix1,
        x2: ix2,
        z: iz2,
        z2: r.z2,
      });
    }
  }

  return out.filter(
    (r) =>
      r.x2 - r.x > 0.01 &&
      r.z2 - r.z > 0.01
  );
}

function wallSegments(length, height, openings) {
  let rects = [
    {
      x: 0,
      x2: length,
      z: 0,
      z2: height,
    },
  ];

  for (const opening of openings) {
    rects = carveRect(rects, {
      x: opening.offset_x_m,
      x2: opening.offset_x_m + opening.width_m,
      z: opening.offset_z_m,
      z2: opening.offset_z_m + opening.height_m,
    });
  }

  return rects;
}

function fluxToColor(flux) {
  const clamped = Math.max(
    0,
    Math.min(40, flux ?? 0)
  );

  const frac = clamped / 40;

  const r = Math.round(55 + frac * 200);
  const g = Math.round(165 - frac * 115);
  const b = Math.round(220 - frac * 190);

  return `rgb(${r},${g},${b})`;
}

function Box({
  position,
  args,
  color,
  opacity = 1,
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.72}
        metalness={0.04}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function Wall({
  cardinal,
  lengthAlongWall,
  height,
  thickness,
  openings,
  azimuthRad,
  center,
  viewMode,
  materialColor,
  fluxColor,
  cutaway,
}) {
  if (cutaway === cardinal) return null;

  const visualOpenings = normalizeVisualOpenings(openings, lengthAlongWall);
  const segments = wallSegments(
    lengthAlongWall,
    height,
    visualOpenings
  );

  const color =
    viewMode === 'heat'
      ? fluxColor
      : materialColor;

  return (
    <group
      position={center}
      rotation={[0, azimuthRad, 0]}
    >
      {segments.map((r, index) => {
        const width = r.x2 - r.x;
        const segmentHeight = r.z2 - r.z;

        const cx =
          r.x +
          width / 2 -
          lengthAlongWall / 2;

        const cy =
          r.z +
          segmentHeight / 2;

        return (
          <Box
            key={index}
            position={[cx, cy, 0]}
            args={[
              width,
              segmentHeight,
              thickness,
            ]}
            color={color}
          />
        );
      })}

      {visualOpenings
        .filter((o) => o.type === 'window')
        .map((o, index) => {
          const cx =
            o.offset_x_m +
            o.width_m / 2 -
            lengthAlongWall / 2;

          const cy =
            o.offset_z_m +
            o.height_m / 2;

          return (
            <mesh
              key={`glazing-${index}`}
              position={[cx, cy, 0]}
            >
              <boxGeometry
                args={[
                  o.width_m * 0.94,
                  o.height_m * 0.94,
                  Math.max(
                    thickness * 0.3,
                    0.02
                  ),
                ]}
              />

              <meshPhysicalMaterial
                color="#8fd0e8"
                roughness={0.08}
                transparent
                opacity={0.5}
                transmission={0.35}
              />
            </mesh>
          );
        })}

      {visualOpenings
        .filter((o) => o.type === 'door')
        .map((o, index) => {
          const cx = o.offset_x_m + o.width_m / 2 - lengthAlongWall / 2;
          const cy = o.height_m / 2;
          return (
            <mesh key={`door-${index}`} position={[cx, cy, 0]}>
              <boxGeometry args={[o.width_m * 0.96, o.height_m * 0.98, Math.max(thickness * 0.42, 0.03)]} />
              <meshStandardMaterial color="#6b4b35" roughness={0.55} />
            </mesh>
          );
        })}
    </group>
  );
}

function Roof({
  length,
  width,
  height,
  slopeDeg,
  orientationDeg,
  color,
}) {
  const slope = Math.max(0, Number(slopeDeg) || 0);
  const halfWidth = width / 2;
  const rise = halfWidth * Math.tan((slope * Math.PI) / 180);
  const panelRun = Math.max(halfWidth, Math.sqrt(halfWidth ** 2 + rise ** 2));
  const panelAngle = Math.atan2(rise, halfWidth);
  const baseY = height + (slope === 0 ? 0.08 : 0);

  if (slope < 1) {
    return (
      <mesh position={[0, baseY + 0.06, 0]} rotation={[0, (orientationDeg * Math.PI) / 180, 0]}>
        <boxGeometry args={[length * 1.05, 0.12, width * 1.05]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
    );
  }

  return (
    <group rotation={[0, (orientationDeg * Math.PI) / 180, 0]}>
      <mesh position={[0, baseY + rise / 2, -halfWidth / 2]} rotation={[panelAngle, 0, 0]}>
        <boxGeometry args={[length * 1.06, 0.12, panelRun * 1.04]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[0, baseY + rise / 2, halfWidth / 2]} rotation={[-panelAngle, 0, 0]}>
        <boxGeometry args={[length * 1.06, 0.12, panelRun * 1.04]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh position={[0, height + rise + 0.02, 0]}>
        <boxGeometry args={[length * 1.06, 0.14, 0.16]} />
        <meshStandardMaterial color="#4a3b2b" roughness={0.7} />
      </mesh>
    </group>
  );
}

function HeatLegend() {
  const stops = [0, 10, 20, 30, 40];

  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 18,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(10, 18, 30, 0.86)',
        backdropFilter: 'blur(10px)',
        color: '#fff',
        fontSize: 11,
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.25)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          marginBottom: 7,
          letterSpacing: '0.03em',
        }}
      >
        HEAT LOSS
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {stops.map((value) => (
          <div key={value}>
            <div
              style={{
                width: 42,
                height: 7,
                background:
                  fluxToColor(value),
              }}
            />

            <div
              style={{
                marginTop: 3,
                opacity: 0.75,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 5,
          opacity: 0.6,
        }}
      >
        W/m²
      </div>
    </div>
  );
}

const emptyWall = (cardinal) => ({
  cardinal,
  structural_material_id:
    'local_stone_masonry',
  insulation_material_id:
    'expanded_polystyrene_eps',
  structural_thickness_m: null,
  insulation_thickness_m: null,
  openings: [],
});

function MetricCard({
  label,
  value,
  accent,
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 130,
        padding: '14px 16px',
        borderRadius: 14,
        background: '#ffffff',
        border: '1px solid #e3e8ef',
        boxShadow:
          '0 4px 16px rgba(15,23,42,0.05)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: '#7a8698',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 21,
          fontWeight: 750,
          color: accent || '#172033',
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function DigitalTwinModule({
  siteId,
  seed = null,
  designInput = null,
  baselineResult = null,
}) {
  const [materials, setMaterials] =
    useState([]);

  const [dims, setDims] = useState({
    length_m: 6,
    width_m: 4,
    ceiling_height_m: 2.6,
  });

  const [orientationDeg, setOrientationDeg] =
    useState(0);

  const [purpose, setPurpose] = useState(
    'civilian_permanent'
  );

  const [walls, setWalls] = useState(
    CARDINALS.map(emptyWall)
  );

  const [roof, setRoof] = useState({
    structural_material_id:
      'local_stone_masonry',
    insulation_material_id:
      'expanded_polystyrene_eps',
    slope_deg: 11,
    orientation_deg: 180,
  });

  const [design, setDesign] =
    useState(null);

  const inputPreview = useMemo(() => designInputToVisualModel(designInput), [designInput]);
  const displayDesign = useMemo(() => {
    if (design) return design;
    if (!inputPreview) return null;
    return { model: inputPreview, surfaces: [] };
  }, [design, inputPreview]);

  // The optimizer model predates Person 2's opening schema. When both are
  // present, keep the optimizer's thermal result but overlay the latest
  // user-entered openings in the visual twin so the video reflects the design
  // the user actually configured.
  const visualModel = useMemo(() => {
    if (!displayDesign?.model) return null;
    if (!inputPreview || !seed) return displayDesign.model;
    return {
      ...displayDesign.model,
      length_m: inputPreview.length_m,
      width_m: inputPreview.width_m,
      ceiling_height_m: inputPreview.ceiling_height_m,
      orientation_deg: inputPreview.orientation_deg,
      walls: inputPreview.walls.map((inputWall) => {
        const optimizedWall = displayDesign.model.walls?.find((w) => w.cardinal === inputWall.cardinal);
        return {
          ...(optimizedWall || inputWall),
          cardinal: inputWall.cardinal,
          openings: inputWall.openings,
        };
      }),
      roof: {
        ...(displayDesign.model.roof || {}),
        slope_deg: inputPreview.roof.slope_deg ?? displayDesign.model.roof?.slope_deg ?? 0,
      },
    };
  }, [displayDesign, inputPreview, seed]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [viewMode, setViewMode] =
    useState('heat');

  const [cutaway, setCutaway] =
    useState(null);

  const [showConfig, setShowConfig] =
    useState(false);

  // Phase E: fields the optimizer sets that this form has no controls for.
  // They must ride along on every regenerate, otherwise "Generate design"
  // would silently swap the optimizer's floor / leakage for the defaults and
  // the numbers would stop matching the Pareto point.
  const [extras, setExtras] =
    useState(null);

  const [dayOfYear, setDayOfYear] =
    useState(15);

  const [appliedSeedNonce, setAppliedSeedNonce] =
    useState(null);

  const [seedInfo, setSeedInfo] =
    useState(null);

  // Phase E: open a design that came from the optimizer (or any saved
  // ShelterModel). Adjusting state during render is React's documented
  // pattern for "reset state when a prop changes" and avoids an effect.
  if (seed && seed.nonce !== appliedSeedNonce) {
    const m = seed.design.model;

    setAppliedSeedNonce(seed.nonce);
    setDims({
      length_m: m.length_m,
      width_m: m.width_m,
      ceiling_height_m: m.ceiling_height_m,
    });
    setOrientationDeg(m.orientation_deg);
    setPurpose(m.occupancy.purpose);
    setWalls(m.walls);
    setRoof(m.roof);
    setExtras({
      floor: m.floor,
      leakage_area_cm2: m.leakage_area_cm2,
    });
    setDayOfYear(seed.dayOfYear ?? 15);
    setDesign(seed.design);
    setSeedInfo({
      label: seed.label,
      optimizerComfortC: seed.optimizerComfortC,
      deltaC: seed.comfortDeltaC,
      reproduces: seed.reproducesOptimizer,
      slopeDeg: m.roof.slope_deg,
      heightM: m.ceiling_height_m,
      snowKpa: seed.roofSnowLoadKpa,
    });
    setError(null);
  }

  useEffect(() => {
    fetch(
      `${API}/materials`
    )
      .then((response) =>
        response.json()
      )
      .then(setMaterials)
      .catch(() => {});
  }, []);

  const structuralOpts =
    materials.filter((m) =>
      m.category.startsWith(
        'structural'
      )
    );

  const insulationOpts =
    materials.filter(
      (m) =>
        m.category === 'insulation'
    );

  const glazingOpts =
    materials.filter(
      (m) =>
        m.category === 'glazing'
    );

  const updateWall = (
    cardinal,
    patch
  ) => {
    setWalls((current) =>
      current.map((wall) =>
        wall.cardinal === cardinal
          ? {
              ...wall,
              ...patch,
            }
          : wall
      )
    );
  };

  const addWindow = (cardinal) => {
    const wall = walls.find(
      (w) =>
        w.cardinal === cardinal
    );

    updateWall(cardinal, {
      openings: [
        ...wall.openings,
        {
          type: 'window',
          width_m: 1.2,
          height_m: 1.0,
          offset_x_m: 0.5,
          offset_z_m: 0.9,
          glazing_material_id:
            glazingOpts[0]?.id ||
            'double_glazed_low_e_window',
        },
      ],
    });
  };

  const removeWindow = (
    cardinal,
    index
  ) => {
    const wall = walls.find(
      (w) =>
        w.cardinal === cardinal
    );

    updateWall(cardinal, {
      openings:
        wall.openings.filter(
          (_, i) =>
            i !== index
        ),
    });
  };

  const generate = async () => {
    setLoading(true);
    setError(null);

    const payload = {
      model: {
        name: `Design ${new Date().toLocaleTimeString()}`,
        site_id: siteId || 'leh',
        length_m: dims.length_m,
        width_m: dims.width_m,
        ceiling_height_m:
          dims.ceiling_height_m,
        orientation_deg:
          orientationDeg,

        occupancy: {
          purpose,
          headcount: 4,
        },

        walls,

        roof,

        ...(extras || {}),
      },

      day_of_year: dayOfYear,
    };

    try {
      const response = await fetch(
        `${API}/shelter/design`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(
            payload
          ),
        }
      );

      if (!response.ok) {
        const detail =
          await response
            .json()
            .catch(() => ({}));

        throw new Error(
          detail.detail ||
            `Request failed: ${response.status}`
        );
      }

      setDesign(
        await response.json()
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const surfaceByName = useMemo(() => {
    const map = {};

    (displayDesign?.surfaces || []).forEach(
      (surface) => {
        map[surface.name] =
          surface;
      }
    );

    return map;
  }, [displayDesign]);

  const wallGeometry = useMemo(() => {
    if (!visualModel) return null;

    const model = visualModel;

    const wallLength = {
      N: model.length_m,
      S: model.length_m,
      E: model.width_m,
      W: model.width_m,
    };

    const baseAzimuth = {
      N: 0,
      E: 90,
      S: 180,
      W: 270,
    };

    const thickness = {
      N: 0,
      E: 0,
      S: 0,
      W: 0,
    };

    CARDINALS.forEach(
      (cardinal) => {
        const wall =
          (model.walls || []).find(
            (w) =>
              w.cardinal ===
              cardinal
          ) || emptyWall(cardinal);

        // Optimizer designs may provide resolved_thicknesses, while a
        // Person 2 design-input preview does not. Both are valid Digital
        // Twin inputs, so never dereference the optimizer-only object.
        const resolved = design?.resolved_thicknesses || {};

        const structural =
          resolved[`${cardinal}_structural`] ??
          wall.structural_thickness_m ??
          0.3;

        const insulation =
          wall.insulation_material_id
            ? resolved[`${cardinal}_insulation`] ??
              wall.insulation_thickness_m ??
              0.08
            : 0;

        thickness[cardinal] =
          structural +
          insulation;
      }
    );

    return CARDINALS.map(
      (cardinal) => {
        const wall =
          (model.walls || []).find(
            (w) =>
              w.cardinal ===
              cardinal
          ) || emptyWall(cardinal);

        const rad =
          ((baseAzimuth[cardinal] +
            model.orientation_deg) *
            Math.PI) /
          180;

        const offsetDistance =
          cardinal === 'N' ||
          cardinal === 'S'
            ? model.width_m / 2
            : model.length_m / 2;

        const cx =
          Math.sin(rad) *
          offsetDistance;

        const cz =
          Math.cos(rad) *
          offsetDistance;

        const surface =
          surfaceByName[
            `wall_${cardinal}`
          ];

        const material =
          materials.find(
            (m) =>
              m.id ===
              wall.structural_material_id
          );

        return {
          cardinal,
          lengthAlongWall:
            wallLength[cardinal],
          thickness:
            thickness[cardinal],
          openings:
            wall.openings,
          azimuthRad: rad,
          center: [cx, 0, cz],

          materialColor:
            CATEGORY_COLOR[
              material?.category
            ] || '#b0b0b0',

          fluxColor:
            fluxToColor(
              surface?.heat_flux_wm2
            ),

          heatFlux:
            surface?.heat_flux_wm2,
        };
      }
    );
  }, [
    displayDesign,
    materials,
    surfaceByName,
  ]);

  const achievedTemp = design?.achieved_min_indoor_c ?? baselineResult?.min_indoor_temp_c ?? null;
  const targetTemp = design?.target_min_indoor_c ?? null;
  const thermalGap = achievedTemp == null || targetTemp == null ? null : targetTemp - achievedTemp;
  const thermalStatus = thermalGap == null ? 'Preview' : thermalGap <= 0 ? 'Target met' : 'Below target';

  const totalHeatLoss = useMemo(() => {
    return (
      displayDesign?.surfaces?.reduce(
        (sum, surface) =>
          sum +
          (surface.heat_loss_w || 0),
        0
      ) || 0
    );
  }, [displayDesign]);

  return (
    <div
      style={{
        maxWidth: 1500,
        margin: '0 auto',
        paddingBottom: 40,
      }}
    >
      {/* CONFIGURATION */}

      {showConfig && (
        <div
          style={{
            background:
              '#ffffff',
            border:
              '1px solid #e1e7ef',
            borderRadius: 16,
            padding: 18,
            marginBottom: 18,
            boxShadow:
              '0 5px 22px rgba(15,23,42,0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'space-between',
              marginBottom: 14,
            }}
          >
            <div>
              <strong
                style={{
                  fontSize: 15,
                }}
              >
                Design controls
              </strong>

              <div
                style={{
                  fontSize: 12,
                  color: '#7a8698',
                  marginTop: 3,
                }}
              >
                Modify the shelter,
                then regenerate the
                thermal design.
              </div>
            </div>

            <span
              style={{
                padding:
                  '5px 9px',
                borderRadius: 999,
                background:
                  '#edf7f2',
                color:
                  '#18794e',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              LIVE SOLVER
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(145px, 1fr))',
              gap: 10,
              marginBottom: 15,
            }}
          >
            {[
              [
                'Length',
                dims.length_m,
                (value) =>
                  setDims({
                    ...dims,
                    length_m:
                      Number(value),
                  }),
                0.5,
              ],
              [
                'Width',
                dims.width_m,
                (value) =>
                  setDims({
                    ...dims,
                    width_m:
                      Number(value),
                  }),
                0.5,
              ],
              [
                'Height',
                dims.ceiling_height_m,
                (value) =>
                  setDims({
                    ...dims,
                    ceiling_height_m:
                      Number(value),
                  }),
                0.1,
              ],
              [
                'Orientation',
                orientationDeg,
                (value) =>
                  setOrientationDeg(
                    Number(value)
                  ),
                5,
              ],
            ].map(
              ([
                label,
                value,
                setter,
                step,
              ]) => (
                <label
                  key={label}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#6c7789',
                  }}
                >
                  {label} (m)
                  <input
                    type="number"
                    value={value}
                    step={step}
                    onChange={(e) =>
                      setter(
                        e.target.value
                      )
                    }
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: 5,
                      boxSizing:
                        'border-box',
                      padding:
                        '9px 10px',
                      borderRadius: 8,
                      border:
                        '1px solid #d9e0e9',
                      background:
                        '#f9fbfd',
                    }}
                  />
                </label>
              )
            )}

            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#6c7789',
              }}
            >
              Purpose
              <select
                value={purpose}
                onChange={(e) =>
                  setPurpose(
                    e.target.value
                  )
                }
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 5,
                  padding:
                    '9px 10px',
                  borderRadius: 8,
                  border:
                    '1px solid #d9e0e9',
                  background:
                    '#f9fbfd',
                }}
              >
                {PURPOSES.map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#6c7789',
              }}
            >
              Roof slope (°)
              <input
                type="number"
                value={roof.slope_deg}
                step="1"
                onChange={(e) =>
                  setRoof({
                    ...roof,
                    slope_deg:
                      Number(
                        e.target.value
                      ),
                  })
                }
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 5,
                  boxSizing:
                    'border-box',
                  padding:
                    '9px 10px',
                  borderRadius: 8,
                  border:
                    '1px solid #d9e0e9',
                  background:
                    '#f9fbfd',
                }}
              />
            </label>
          </div>

          <div
            style={{
              overflowX:
                'auto',
              border:
                '1px solid #e5e9ef',
              borderRadius: 10,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse:
                  'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      '#f5f7fa',
                    color:
                      '#6d7788',
                    textAlign:
                      'left',
                  }}
                >
                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    Wall
                  </th>
                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    Structure
                  </th>
                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    Insulation
                  </th>
                  <th
                    style={{
                      padding: 9,
                    }}
                  >
                    Openings
                  </th>
                </tr>
              </thead>

              <tbody>
                {walls.map(
                  (wall) => (
                    <tr
                      key={
                        wall.cardinal
                      }
                      style={{
                        borderTop:
                          '1px solid #edf0f4',
                      }}
                    >
                      <td
                        style={{
                          padding: 9,
                          fontWeight: 800,
                        }}
                      >
                        {wall.cardinal}
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        <select
                          value={
                            wall.structural_material_id
                          }
                          onChange={(e) =>
                            updateWall(
                              wall.cardinal,
                              {
                                structural_material_id:
                                  e.target.value,
                              }
                            )
                          }
                        >
                          {structuralOpts.map(
                            (material) => (
                              <option
                                key={
                                  material.id
                                }
                                value={
                                  material.id
                                }
                              >
                                {
                                  material.name
                                }
                              </option>
                            )
                          )}
                        </select>
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        <select
                          value={
                            wall.insulation_material_id ||
                            ''
                          }
                          onChange={(e) =>
                            updateWall(
                              wall.cardinal,
                              {
                                insulation_material_id:
                                  e.target
                                    .value ||
                                  null,
                              }
                            )
                          }
                        >
                          <option value="">
                            None
                          </option>

                          {insulationOpts.map(
                            (material) => (
                              <option
                                key={
                                  material.id
                                }
                                value={
                                  material.id
                                }
                              >
                                {
                                  material.name
                                }
                              </option>
                            )
                          )}
                        </select>
                      </td>

                      <td
                        style={{
                          padding: 9,
                        }}
                      >
                        {wall.openings.length ===
                        0 ? (
                          <span
                            style={{
                              color:
                                '#8993a3',
                            }}
                          >
                            No windows
                          </span>
                        ) : (
                          wall.openings.map(
                            (
                              opening,
                              index
                            ) => (
                              <span
                                key={
                                  index
                                }
                                style={{
                                  display:
                                    'inline-flex',
                                  alignItems:
                                    'center',
                                  gap: 5,
                                  marginRight:
                                    5,
                                  marginBottom:
                                    3,
                                  padding:
                                    '4px 7px',
                                  borderRadius:
                                    6,
                                  background:
                                    '#eaf4fb',
                                  color:
                                    '#27627d',
                                }}
                              >
                                {
                                  opening.width_m
                                }
                                ×
                                {
                                  opening.height_m
                                }
                                m

                                <button
                                  onClick={() =>
                                    removeWindow(
                                      wall.cardinal,
                                      index
                                    )
                                  }
                                  style={{
                                    border:
                                      'none',
                                    background:
                                      'transparent',
                                    cursor:
                                      'pointer',
                                    color:
                                      '#a33',
                                  }}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          )
                        )}

                        <button
                          onClick={() =>
                            addWindow(
                              wall.cardinal
                            )
                          }
                          style={{
                            marginLeft: 4,
                          }}
                        >
                          + window
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems:
                'center',
              gap: 10,
              marginTop: 14,
            }}
          >
            <button
              onClick={generate}
              disabled={loading}
              style={{
                padding:
                  '10px 18px',
                borderRadius: 9,
                border: 'none',
                background:
                  '#183b63',
                color: '#fff',
                cursor: loading
                  ? 'wait'
                  : 'pointer',
                fontWeight: 750,
              }}
            >
              {loading
                ? 'Solving thermal design…'
                : 'Generate design'}
            </button>

            {error && (
              <div
                style={{
                  color:
                    '#b42318',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EMPTY STATE */}

      {!displayDesign && (
        <div
          style={{
            minHeight: 420,
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            borderRadius: 18,
            border:
              '1px dashed #cbd4df',
            background:
              'linear-gradient(135deg,#f8fafc,#eef3f8)',
            color: '#6d7788',
          }}
        >
          <div
            style={{
              textAlign:
                'center',
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontSize: 44,
                marginBottom: 12,
              }}
            >
              🏔️
            </div>

            <strong
              style={{
                display:
                  'block',
                color:
                  '#273449',
                fontSize: 17,
                marginBottom: 7,
              }}
            >
              No shelter generated yet
            </strong>

            <span
              style={{
                fontSize: 13,
              }}
            >
              Configure the shelter
              above and generate a
              design to create the
              parametric digital twin.
            </span>
          </div>
        </div>
      )}

      {/* GENERATED DESIGN */}

      {displayDesign && wallGeometry && (
        <>
          {/* ARCHITECTURAL STUDIO HEADER */}
          <div style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'13px 16px', marginBottom:10, background:'#fff',
            border:'1px solid #dfe5ec', borderRadius:12, boxShadow:'0 3px 14px rgba(15,23,42,.04)'
          }}>
            <div>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:'.12em',color:'#6b7890',textTransform:'uppercase'}}>HIMKAVACH · ARCHITECTURAL + THERMAL DESIGN STUDIO</div>
              <div style={{fontSize:21,fontWeight:800,color:'#162238',marginTop:3}}>Digital Twin</div>
              <div style={{fontSize:12,color:'#758196',marginTop:2}}>
                {seedInfo?.label || visualModel.name || 'Shelter Design'} · {Number(visualModel.length_m||0).toFixed(1)} × {Number(visualModel.width_m||0).toFixed(1)} × {Number(visualModel.ceiling_height_m||0).toFixed(1)} m
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{padding:'7px 10px',border:'1px solid #d9e2ec',borderRadius:999,fontSize:10,fontWeight:800,color:'#58708e',background:'#f8fafc'}}>● SELECTED DESIGN</span>
              <button onClick={()=>setShowConfig(!showConfig)} style={{padding:'9px 13px',border:'1px solid #cfd9e5',borderRadius:8,background:'#fff',fontWeight:750,color:'#1e2d42',cursor:'pointer'}}>
                {showConfig ? 'Hide inputs' : 'Design inputs'}
              </button>
            </div>
          </div>

          {/* BREADCRUMB / LOCATION STRIP */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 4px 9px',fontSize:10,fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'#7b879a'}}>
            <div style={{display:'flex',gap:9,alignItems:'center'}}>
              <span>DESIGN</span><span>→</span><span>SIMULATION</span><span>→</span><span>OPTIMIZATION</span><span>→</span><span style={{color:'#1f4f86'}}>DIGITAL TWIN</span>
            </div>
            <div style={{fontSize:10,letterSpacing:'.04em',textTransform:'none',fontWeight:650}}>{siteId || 'Site'} · Orientation {Number(visualModel.orientation_deg ?? orientationDeg).toFixed(0)}°</div>
          </div>

          {/* DESIGN STUDIO WORKSPACE */}
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 355px',gap:10,alignItems:'stretch'}}>
            <div style={{minWidth:0}}>
              {/* VIEWPORT TOOLBAR */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',border:'1px solid #dfe5ec',borderBottom:0,borderRadius:'12px 12px 0 0',padding:'8px 10px'}}>
                <div style={{display:'flex',gap:2,background:'#eef2f6',padding:3,borderRadius:8}}>
                  <button onClick={()=>setViewMode('material')} style={{border:0,borderRadius:6,padding:'7px 11px',background:viewMode==='material'?'#fff':'transparent',boxShadow:viewMode==='material'?'0 1px 3px rgba(15,23,42,.12)':'none',fontSize:11,fontWeight:800,color:'#23354d'}}>Material</button>
                  <button onClick={()=>setViewMode('heat')} style={{border:0,borderRadius:6,padding:'7px 11px',background:viewMode==='heat'?'#fff':'transparent',boxShadow:viewMode==='heat'?'0 1px 3px rgba(15,23,42,.12)':'none',fontSize:11,fontWeight:800,color:'#23354d'}}>Thermal</button>
                  <button style={{border:0,borderRadius:6,padding:'7px 11px',background:'transparent',fontSize:11,fontWeight:800,color:'#728096',cursor:'default'}}>Solar</button>
                  <button style={{border:0,borderRadius:6,padding:'7px 11px',background:'transparent',fontSize:11,fontWeight:800,color:'#728096',cursor:'default'}}>Cutaway</button>
                </div>
                <div style={{display:'flex',gap:3,background:'#eef2f6',padding:3,borderRadius:8}}>
                  {['Iso','N','S','E','W','Plan'].map((v,i)=><button key={v} style={{border:0,borderRadius:6,padding:'7px 9px',background:i===0?'#fff':'transparent',boxShadow:i===0?'0 1px 3px rgba(15,23,42,.12)':'none',fontSize:10,fontWeight:800,color:'#33455d'}}>{v}</button>)}
                </div>
              </div>

              {/* 3D VIEWPORT */}
              <div style={{position:'relative',height:590,border:'1px solid #dfe5ec',borderRadius:'0 0 12px 12px',overflow:'hidden',background:'linear-gradient(180deg,#f4f7fa 0%,#eaf0f5 52%,#dfe6ec 100%)',boxShadow:'0 8px 25px rgba(15,23,42,.06)'}}>
                <Canvas camera={{position:[8,5.5,8],fov:42}} shadows>
                  <ambientLight intensity={0.75}/>
                  <directionalLight position={[8,12,6]} intensity={1.3} castShadow/>
                  <hemisphereLight skyColor="#edf3f8" groundColor="#9aa5b5" intensity={0.35}/>
                  <mesh position={[0,-0.06,0]}>
                    <boxGeometry args={[visualModel.length_m*1.5,0.1,visualModel.width_m*1.5]}/>
                    <meshStandardMaterial color="#a8b1bb" roughness={1}/>
                  </mesh>
                  {wallGeometry.map((wall)=><Wall key={wall.cardinal} {...wall} viewMode={viewMode} height={visualModel.ceiling_height_m} cutaway={cutaway}/>) }
                  <Roof length={visualModel.length_m} width={visualModel.width_m} height={visualModel.ceiling_height_m} slopeDeg={visualModel.roof?.slope_deg ?? roof.slope_deg} orientationDeg={visualModel.roof?.orientation_deg ?? roof.orientation_deg} color="#39465a"/>
                  <Grid args={[30,30]} cellColor="#c3ceda" sectionColor="#9aaabd" fadeDistance={22} position={[0,0.002,0]}/>
                  <OrbitControls enableDamping minDistance={3} maxDistance={20}/>
                </Canvas>

                {viewMode==='heat' && <HeatLegend/>}
                <div style={{position:'absolute',top:12,left:12,padding:'6px 9px',borderRadius:7,background:'rgba(255,255,255,.9)',border:'1px solid #dce3eb',fontSize:10,fontWeight:850,letterSpacing:'.07em',color:'#34465e'}}>{viewMode==='heat'?'THERMAL FIELD':'MATERIAL VIEW'}</div>
                <div style={{position:'absolute',top:12,right:12,display:'flex',gap:6}}>
                  <span style={{padding:'6px 8px',borderRadius:7,background:'rgba(255,255,255,.9)',border:'1px solid #dce3eb',fontSize:10,fontWeight:800,color:'#52657d'}}>↻ Orbit</span>
                  <span style={{padding:'6px 8px',borderRadius:7,background:'rgba(255,255,255,.9)',border:'1px solid #dce3eb',fontSize:10,fontWeight:800,color:'#52657d'}}>⌕ Zoom</span>
                </div>
                <div style={{position:'absolute',left:14,bottom:14,display:'flex',gap:6}}>
                  <span style={{padding:'6px 9px',borderRadius:7,background:'rgba(255,255,255,.94)',border:'1px solid #dce3eb',fontSize:10,fontWeight:850,color:'#34465e'}}>MATERIAL</span>
                  <span style={{padding:'6px 9px',borderRadius:7,background:'rgba(255,255,255,.94)',border:'1px solid #dce3eb',fontSize:10,fontWeight:850,color:thermalStatus==='Target met'?'#18794e':'#8a5a00'}}>{thermalStatus==='Target met'?'TARGET MET':'THERMAL REVIEW'}</span>
                </div>
                <div style={{position:'absolute',right:15,bottom:14,width:34,height:34,border:'1px solid #b8c5d3',borderRadius:'50%',background:'rgba(255,255,255,.9)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:850,color:'#263c56',fontSize:12}}>N</div>
              </div>
            </div>

            {/* ARCHITECTURAL INSPECTOR */}
            <div style={{background:'#fff',border:'1px solid #dfe5ec',borderRadius:12,overflow:'hidden',boxShadow:'0 6px 20px rgba(15,23,42,.05)'}}>
              <div style={{padding:'15px 16px 13px',borderBottom:'1px solid #e8edf2'}}>
                <div style={{fontSize:10,fontWeight:850,letterSpacing:'.1em',color:'#68768a',textTransform:'uppercase'}}>Shelter Studio Inspector</div>
                <div style={{fontSize:18,fontWeight:800,color:'#18283d',marginTop:4}}>S Wall</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:'1px solid #e8edf2'}}>
                {['Properties','Envelope','Openings','Climate'].map((t,i)=><button key={t} style={{border:0,borderRight:i<3?'1px solid #edf0f4':'none',padding:'11px 4px',background:i===0?'#f4f8fc':'#fff',fontSize:9,fontWeight:850,color:i===0?'#1f568c':'#718097'}}>{t}</button>)}
              </div>

              {(() => {
                const iw = walls.find(w=>w.cardinal==='S') || walls[0] || {};
                const mat = materials.find(m=>m.id===iw.structural_material_id)?.name || iw.structural_material_id || 'Not specified';
                const ins = materials.find(m=>m.id===iw.insulation_material_id)?.name || iw.insulation_material_id || 'Not specified';
                const surface = (displayDesign?.surfaces || []).find(x=>String(x.name||'').toLowerCase().includes('s'));
                const openings = (visualModel?.walls || []).find(w=>w.cardinal==='S')?.openings || [];
                return <>
                  <div style={{padding:14}}>
                    <div style={{padding:'8px 10px',border:'1px solid #dce4ed',borderRadius:8,fontSize:10,fontWeight:850,color:'#35526f',background:'#f8fafc',textTransform:'uppercase'}}>S Facade</div>
                    <div style={{marginTop:10,display:'grid',gap:0}}>
                      {[
                        ['Structural material',mat],
                        ['Structural thickness',`${Number(iw.thickness_m ?? 0).toFixed(2)} m`],
                        ['Insulation',ins],
                        ['Insulation thickness',`${Number(iw.insulation_thickness_m ?? 0).toFixed(2)} m`],
                        ['Openings',`${openings.length} configured`],
                        ['Area',surface?.area_m2!=null?`${Number(surface.area_m2).toFixed(1)} m²`:'—'],
                        ['U-value',surface?.u_value_wm2k!=null?`${Number(surface.u_value_wm2k).toFixed(3)} W/m²K`:'—'],
                        ['Heat loss',surface?.heat_loss_w!=null?`${Number(surface.heat_loss_w).toFixed(0)} W`:'—'],
                      ].map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #edf1f5',fontSize:11}}><span style={{color:'#718096'}}>{k}</span><strong style={{color:'#26374c',textAlign:'right',maxWidth:'58%'}}>{v}</strong></div>)}
                    </div>
                  </div>
                  <div style={{margin:'0 14px 14px',padding:12,border:'1px solid #e1e7ee',borderRadius:9,background:'#f8fafc'}}>
                    <div style={{fontSize:10,fontWeight:850,color:'#52657b',textTransform:'uppercase',letterSpacing:'.06em'}}>Design performance</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:9}}>
                      <div><div style={{fontSize:10,color:'#7a8798'}}>Min indoor</div><strong style={{fontSize:17,color:'#1f527f'}}>{(achievedTemp ?? 0).toFixed(1)}°C</strong></div>
                      <div><div style={{fontSize:10,color:'#7a8798'}}>Target</div><strong style={{fontSize:17,color:'#26374c'}}>{(targetTemp ?? 18).toFixed(1)}°C</strong></div>
                    </div>
                  </div>
                </>;
              })()}
            </div>
          </div>

          {/* STUDIO FOOTER / ASSEMBLY SUMMARY */}
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
            <div style={{padding:'10px 13px',border:'1px solid #dfe5ec',borderRadius:9,background:'#fff'}}><div style={{fontSize:9,fontWeight:850,color:'#7a8798',textTransform:'uppercase'}}>Envelope</div><div style={{fontSize:12,fontWeight:800,color:'#26384e',marginTop:3}}>Wall + roof assembly</div></div>
            <MetricCard label="Thermal" value={achievedTemp==null?'Preview':`${achievedTemp.toFixed(1)}°C`} />
            <MetricCard label="Material cost" value={(design?.estimated_material_cost_inr ?? design?.material_cost_inr)==null?'—':`₹${Math.round(design?.estimated_material_cost_inr ?? design?.material_cost_inr).toLocaleString()}`} />
            <MetricCard label="Surface heat loss" value={`${Math.round(totalHeatLoss)} W`} />
          </div>

          {/* SURFACE ANALYSIS — kept as existing data, only visually restyled */}
          <div style={{marginTop:10,background:'#fff',border:'1px solid #dfe5ec',borderRadius:12,overflow:'hidden',boxShadow:'0 4px 16px rgba(15,23,42,.035)'}}>
            <div style={{padding:'13px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #e8edf2'}}>
              <div><strong style={{fontSize:14,color:'#26384e'}}>Surface heat-loss analysis</strong><div style={{fontSize:11,color:'#7b8697',marginTop:3}}>Solver-derived surface performance</div></div>
              <span style={{fontSize:10,fontWeight:800,color:'#718096'}}>{displayDesign?.surfaces?.length || 0} surfaces</span>
            </div>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr style={{background:'#f7f9fb',color:'#697589',textAlign:'left'}}>{['Surface','Area','U-value','Heat flux','Heat loss'].map(h=><th key={h} style={{padding:'9px 13px',fontWeight:850}}>{h}</th>)}</tr></thead><tbody>{(displayDesign?.surfaces||[]).map(surface=><tr key={surface.name} style={{borderTop:'1px solid #edf0f4'}}><td style={{padding:'9px 13px',fontWeight:750}}>{surface.name}</td><td style={{padding:'9px 13px'}}>{Number(surface.area_m2??0).toFixed(1)} m²</td><td style={{padding:'9px 13px'}}>{Number(surface.u_value_wm2k??0).toFixed(3)}</td><td style={{padding:'9px 13px',fontWeight:750,color:fluxToColor(surface.heat_flux_wm2)}}>{Number(surface.heat_flux_wm2??0).toFixed(1)} W/m²</td><td style={{padding:'9px 13px'}}>{Number(surface.heat_loss_w??0).toFixed(0)} W</td></tr>)}</tbody></table></div>
          </div>
        </>
      )}
    </div>
  );
}