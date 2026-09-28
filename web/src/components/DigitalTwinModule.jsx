import { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

const CARDINALS = ['N', 'E', 'S', 'W'];

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

  const segments = wallSegments(
    lengthAlongWall,
    height,
    openings
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

      {openings
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
  const rise =
    (width / 2) *
    Math.tan(
      (slopeDeg * Math.PI) / 180
    );

  const slopeLength =
    Math.sqrt(
      (width * width) / 4 +
        rise * rise
    ) * 2;

  return (
    <mesh
      position={[
        0,
        height + rise / 2,
        0,
      ]}
      rotation={[
        (-slopeDeg * Math.PI) / 180,
        (orientationDeg * Math.PI) / 180,
        0,
      ]}
    >
      <boxGeometry
        args={[
          length * 1.06,
          0.12,
          slopeLength * 1.04,
        ]}
      />

      <meshStandardMaterial
        color={color}
        roughness={0.6}
      />
    </mesh>
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

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [viewMode, setViewMode] =
    useState('heat');

  const [cutaway, setCutaway] =
    useState(null);

  const [showConfig, setShowConfig] =
    useState(true);

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
      'http://localhost:8000/materials'
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
        'http://localhost:8000/shelter/design',
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

    (design?.surfaces || []).forEach(
      (surface) => {
        map[surface.name] =
          surface;
      }
    );

    return map;
  }, [design]);

  const wallGeometry = useMemo(() => {
    if (!design) return null;

    const model = design.model;

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
          model.walls.find(
            (w) =>
              w.cardinal ===
              cardinal
          );

        const structural =
          design
            .resolved_thicknesses[
              `${cardinal}_structural`
            ] ??
          wall.structural_thickness_m ??
          0.3;

        const insulation =
          wall.insulation_material_id
            ? design
                .resolved_thicknesses[
                  `${cardinal}_insulation`
                ] ??
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
          model.walls.find(
            (w) =>
              w.cardinal ===
              cardinal
          );

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
    design,
    materials,
    surfaceByName,
  ]);

  const totalHeatLoss = useMemo(() => {
    return (
      design?.surfaces?.reduce(
        (sum, surface) =>
          sum +
          (surface.heat_loss_w || 0),
        0
      ) || 0
    );
  }, [design]);

  return (
    <div
      style={{
        maxWidth: 1500,
        margin: '0 auto',
        paddingBottom: 40,
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'flex-start',
          gap: 20,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing:
                '0.12em',
              color: '#738095',
              textTransform:
                'uppercase',
              marginBottom: 5,
            }}
          >
            Module 4 · Digital Twin
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 28,
              color: '#182235',
            }}
          >
            3D Thermal Shelter
          </h2>

          <p
            style={{
              margin:
                '6px 0 0',
              color: '#697589',
              fontSize: 13,
            }}
          >
            Parametric geometry with
            solver-derived heat flux.
          </p>
        </div>

        <button
          onClick={() =>
            setShowConfig(
              !showConfig
            )
          }
          style={{
            padding:
              '10px 15px',
            borderRadius: 10,
            border:
              '1px solid #d7dee8',
            background: '#fff',
            cursor: 'pointer',
            fontWeight: 650,
          }}
        >
          {showConfig
            ? 'Hide Design Controls'
            : 'Show Design Controls'}
        </button>
      </div>

      {/* OPTIMIZER PROVENANCE (Phase E) */}

      {seedInfo && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 12,
            background: '#eef4ff',
            border: '1px solid #cfe0ff',
            color: '#24406f',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>
            Loaded from optimizer
            {seedInfo.label
              ? ` — ${seedInfo.label}`
              : ''}
            .
          </strong>{' '}
          Roof slope{' '}
          {seedInfo.slopeDeg.toFixed(0)}°,
          ceiling{' '}
          {seedInfo.heightM.toFixed(2)} m
          {seedInfo.snowKpa != null &&
          seedInfo.snowKpa > 0
            ? `, roof snow load ${seedInfo.snowKpa.toFixed(2)} kPa`
            : ''}
          .{' '}
          {seedInfo.reproduces === true &&
            `Re-simulated coldest hour matches the optimizer (${seedInfo.optimizerComfortC.toFixed(1)}°C).`}
          {seedInfo.reproduces === false &&
            `Re-simulated coldest hour differs from the optimizer by ${seedInfo.deltaC.toFixed(2)}°C.`}
          {' '}The optimizer's design has
          no windows — add some below and
          regenerate to see the trade-off.
        </div>
      )}

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

      {!design && (
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

      {design &&
        wallGeometry && (
          <>
            {/* MODEL HEADER */}

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                marginBottom: 10,
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 17,
                    color:
                      '#1c293b',
                  }}
                >
                  {design.model.name ||
                    'Shelter Design'}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color:
                      '#7b8697',
                    marginTop: 3,
                  }}
                >
                  {design.model.length_m}
                  {' × '}
                  {design.model.width_m}
                  {' × '}
                  {
                    design.model
                      .ceiling_height_m
                  }
                  {' m'}
                  {' · '}
                  {siteId ||
                    'leh'}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 7,
                }}
              >
                <button
                  onClick={() =>
                    setViewMode(
                      viewMode ===
                        'heat'
                        ? 'material'
                        : 'heat'
                    )
                  }
                  style={{
                    padding:
                      '8px 12px',
                    borderRadius: 8,
                    border:
                      '1px solid #d7dee8',
                    background:
                      '#fff',
                    fontWeight: 700,
                    cursor:
                      'pointer',
                  }}
                >
                  {viewMode ===
                  'heat'
                    ? '🌡 Heat map'
                    : '🧱 Materials'}
                </button>

                <select
                  value={
                    cutaway || ''
                  }
                  onChange={(e) =>
                    setCutaway(
                      e.target.value ||
                        null
                    )
                  }
                  style={{
                    padding:
                      '8px 10px',
                    borderRadius: 8,
                    border:
                      '1px solid #d7dee8',
                    background:
                      '#fff',
                  }}
                >
                  <option value="">
                    No cutaway
                  </option>

                  {CARDINALS.map(
                    (cardinal) => (
                      <option
                        key={
                          cardinal
                        }
                        value={
                          cardinal
                        }
                      >
                        Hide {cardinal}{' '}
                        wall
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            {/* MAIN 3D + KPI LAYOUT */}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(0, 1fr) 285px',
                gap: 14,
                alignItems:
                  'stretch',
              }}
            >
              {/* 3D VIEW */}

              <div
                style={{
                  position:
                    'relative',
                  height: 560,
                  minHeight: 500,
                  borderRadius: 18,
                  overflow:
                    'hidden',
                  background:
                    'linear-gradient(180deg,#dbe7f3 0%,#eef3f7 55%,#dce2e7 100%)',
                  border:
                    '1px solid #d3dce7',
                  boxShadow:
                    '0 8px 28px rgba(15,23,42,0.09)',
                }}
              >
                <Canvas
                  camera={{
                    position: [
                      8,
                      5.5,
                      8,
                    ],
                    fov: 42,
                  }}
                  shadows
                >
                  <ambientLight
                    intensity={0.75}
                  />

                  <directionalLight
                    position={[
                      8,
                      12,
                      6,
                    ]}
                    intensity={1.3}
                    castShadow
                  />

                  <hemisphereLight
                    skyColor="#e8f0f8"
                    groundColor="#9aa5b5"
                    intensity={0.35}
                  />

                  <mesh
                    position={[
                      0,
                      -0.06,
                      0,
                    ]}
                  >
                    <boxGeometry
                      args={[
                        design.model
                          .length_m *
                          1.5,
                        0.1,
                        design.model
                          .width_m *
                          1.5,
                      ]}
                    />

                    <meshStandardMaterial
                      color="#a8b1bb"
                      roughness={1}
                    />
                  </mesh>

                  {wallGeometry.map(
                    (wall) => (
                      <Wall
                        key={
                          wall.cardinal
                        }
                        {...wall}
                        viewMode={
                          viewMode
                        }
                        height={
                          design.model
                            .ceiling_height_m
                        }
                        cutaway={
                          cutaway
                        }
                      />
                    )
                  )}

                  <Roof
                    length={
                      design.model
                        .length_m
                    }
                    width={
                      design.model
                        .width_m
                    }
                    height={
                      design.model
                        .ceiling_height_m
                    }
                    slopeDeg={
                      design.model
                        .roof?.slope_deg ??
                      roof.slope_deg
                    }
                    orientationDeg={
                      design.model
                        .roof
                        ?.orientation_deg ??
                      roof.orientation_deg
                    }
                    color="#39465a"
                  />

                  <Grid
                    args={[
                      30,
                      30,
                    ]}
                    cellColor="#b9c7d6"
                    sectionColor="#92a4b8"
                    fadeDistance={22}
                    position={[
                      0,
                      0.002,
                      0,
                    ]}
                  />

                  <OrbitControls
                    enableDamping
                    minDistance={3}
                    maxDistance={20}
                  />
                </Canvas>

                {viewMode ===
                  'heat' && (
                  <HeatLegend />
                )}

                <div
                  style={{
                    position:
                      'absolute',
                    top: 14,
                    left: 14,
                    padding:
                      '7px 10px',
                    borderRadius:
                      8,
                    background:
                      'rgba(255,255,255,0.86)',
                    backdropFilter:
                      'blur(8px)',
                    fontSize: 11,
                    fontWeight: 750,
                    color:
                      '#344054',
                  }}
                >
                  {viewMode ===
                  'heat'
                    ? 'THERMAL FIELD'
                    : 'MATERIAL VIEW'}
                </div>
              </div>

              {/* KPI PANEL */}

              <div
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    background:
                      '#fff',
                    border:
                      '1px solid #e1e7ef',
                    boxShadow:
                      '0 5px 20px rgba(15,23,42,0.05)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        '#7b8697',
                      fontWeight: 800,
                      textTransform:
                        'uppercase',
                      letterSpacing:
                        '0.07em',
                    }}
                  >
                    Thermal result
                  </div>

                  <div
                    style={{
                      fontSize: 29,
                      fontWeight: 800,
                      marginTop: 8,
                      color:
                        design.met_target
                          ? '#18824a'
                          : '#c53a32',
                    }}
                  >
                    {design.achieved_min_indoor_c.toFixed(
                      1
                    )}
                    °C
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color:
                        '#7b8697',
                    }}
                  >
                    Minimum indoor
                    temperature
                  </div>
                </div>

                <MetricCard
                  label="Target"
                  value={`${design.target_min_indoor_c.toFixed(
                    1
                  )}°C`}
                />

                <MetricCard
                  label="Target status"
                  value={
                    design.met_target
                      ? '✓ Met'
                      : '✕ Not met'
                  }
                  accent={
                    design.met_target
                      ? '#18824a'
                      : '#c53a32'
                  }
                />

                <MetricCard
                  label="Material cost"
                  value={`₹${Math.round(
                    design.estimated_material_cost_inr
                  ).toLocaleString()}`}
                />

                <MetricCard
                  label="Total surface heat loss"
                  value={`${Math.round(
                    totalHeatLoss
                  )} W`}
                />

                <MetricCard
                  label="Safety"
                  value={
                    design.safety_passed
                      ? '✓ Passed'
                      : '✕ Failed'
                  }
                  accent={
                    design.safety_passed
                      ? '#18824a'
                      : '#c53a32'
                  }
                />
              </div>
            </div>

            {/* SURFACE ANALYSIS */}

            <div
              style={{
                marginTop: 16,
                background:
                  '#fff',
                border:
                  '1px solid #e1e7ef',
                borderRadius: 16,
                overflow:
                  'hidden',
                boxShadow:
                  '0 5px 20px rgba(15,23,42,0.04)',
              }}
            >
              <div
                style={{
                  padding:
                    '15px 18px',
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  alignItems:
                    'center',
                  borderBottom:
                    '1px solid #edf0f4',
                }}
              >
                <div>
                  <strong>
                    Surface heat-loss analysis
                  </strong>

                  <div
                    style={{
                      fontSize: 11,
                      color:
                        '#7b8697',
                      marginTop: 3,
                    }}
                  >
                    Derived from each
                    surface's U-value
                    and simulated
                    temperature difference.
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 11,
                    color:
                      '#7b8697',
                  }}
                >
                  {design.surfaces
                    ?.length || 0}{' '}
                  surfaces
                </span>
              </div>

              <div
                style={{
                  overflowX:
                    'auto',
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
                          '#f7f9fb',
                        color:
                          '#697589',
                        textAlign:
                          'left',
                      }}
                    >
                      <th
                        style={{
                          padding:
                            '10px 14px',
                        }}
                      >
                        Surface
                      </th>
                      <th
                        style={{
                          padding:
                            '10px 14px',
                        }}
                      >
                        Area
                      </th>
                      <th
                        style={{
                          padding:
                            '10px 14px',
                        }}
                      >
                        U-value
                      </th>
                      <th
                        style={{
                          padding:
                            '10px 14px',
                        }}
                      >
                        Heat flux
                      </th>
                      <th
                        style={{
                          padding:
                            '10px 14px',
                        }}
                      >
                        Heat loss
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(design.surfaces ||
                      []).map(
                      (surface) => (
                        <tr
                          key={
                            surface.name
                          }
                          style={{
                            borderTop:
                              '1px solid #edf0f4',
                          }}
                        >
                          <td
                            style={{
                              padding:
                                '10px 14px',
                              fontWeight:
                                700,
                            }}
                          >
                            {surface.name}
                          </td>

                          <td
                            style={{
                              padding:
                                '10px 14px',
                            }}
                          >
                            {surface.area_m2.toFixed(
                              1
                            )}{' '}
                            m²
                          </td>

                          <td
                            style={{
                              padding:
                                '10px 14px',
                            }}
                          >
                            {surface.u_value_wm2k.toFixed(
                              3
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                '10px 14px',
                              fontWeight:
                                750,
                              color:
                                fluxToColor(
                                  surface.heat_flux_wm2
                                ),
                            }}
                          >
                            {surface.heat_flux_wm2.toFixed(
                              1
                            )}{' '}
                            W/m²
                          </td>

                          <td
                            style={{
                              padding:
                                '10px 14px',
                            }}
                          >
                            {surface.heat_loss_w.toFixed(
                              0
                            )}{' '}
                            W
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
    </div>
  );
}