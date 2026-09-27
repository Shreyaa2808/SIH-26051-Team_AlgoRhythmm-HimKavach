import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

function tempToColor(t) {
  // maps roughly -30°C (deep blue) to +10°C (warm orange)
  const clamped = Math.max(-30, Math.min(10, t ?? -10));
  const frac = (clamped + 30) / 40; // 0 = coldest, 1 = warmest
  const r = Math.round(40 + frac * 215);
  const g = Math.round(70 + frac * 120);
  const b = Math.round(220 - frac * 170);
  return `rgb(${r},${g},${b})`;
}

function Wall({ position, args, rotation = [0, 0, 0], color }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}
function Shelter({ side, height, indoorColor, roofColor }) {
  const wallThickness = 0.15;
  const half = side / 2;

  const rise = side * 0.35;
  const ridgeY = height + rise;
  const slopeLength = Math.sqrt(half * half + rise * rise);
  const slopeAngle = Math.atan2(rise, half);

  return (
    <group>
      {/* Floor slab */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[side, 0.1, side]} />
        <meshStandardMaterial color="#8a93a8" />
      </mesh>

      {/* Four walls */}
      <Wall position={[0, height / 2, -half]} args={[side, height, wallThickness]} color={indoorColor} />
      <Wall position={[0, height / 2, half]} args={[side, height, wallThickness]} color={indoorColor} />
      <Wall position={[-half, height / 2, 0]} args={[wallThickness, height, side]} color={indoorColor} />
      <Wall position={[half, height / 2, 0]} args={[wallThickness, height, side]} color={indoorColor} />

      {/* Front roof slope (z = -half side): tilts down toward -z */}
      <mesh
        position={[0, (height + ridgeY) / 2, -half / 2]}
        rotation={[-slopeAngle, 0, 0]}
      >
        <boxGeometry args={[side * 1.08, 0.12, slopeLength]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>

      {/* Back roof slope (z = +half side): tilts down toward +z */}
      <mesh
        position={[0, (height + ridgeY) / 2, half / 2]}
        rotation={[slopeAngle, 0, 0]}
      >
        <boxGeometry args={[side * 1.08, 0.12, slopeLength]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>
    </group>
  );
}

function ColorLegend() {
  const stops = [-30, -20, -10, 0, 10];
  return (
    <div className="legend-card">
      <div className="legend-title">Surface Temperature</div>
      <div className="legend-bar">
        {stops.map((t, i) => (
          <div key={i} className="legend-swatch" style={{ background: tempToColor(t) }}>
            <span>{t}°C</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DigitalTwinModule({ simResult }) {
  const indoorColor = useMemo(
    () => tempToColor(simResult?.min_indoor_temp_c),
    [simResult]
  );

  if (!simResult) {
    return (
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 4 · 3D Parametric Digital Twin</div>
          <h2>Interactive 3D Thermal Field</h2>
          <p>Run a simulation from the Micro-Siting tab first — the 3D model is built from your actual design's geometry and temperature output.</p>
        </div>
      </div>
    );
  }

  const side = Math.sqrt(simResult.floor_area_m2 || 16);
  const height = simResult.ceiling_height_m || 2.4;

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 4 · 3D Parametric Digital Twin</div>
          <h2>Interactive 3D Thermal Field</h2>
          <p>Wall color reflects real indoor temperature from your last simulation ({simResult.min_indoor_temp_c?.toFixed(1)}°C coldest hour). Drag to orbit, scroll to zoom.</p>
        </div>
      </div>

      <div className="twin-canvas-wrap">
        <Canvas camera={{ position: [7, 5, 7], fov: 45 }} shadows>
          <ambientLight intensity={0.7} />
          <directionalLight position={[8, 10, 5]} intensity={1.1} castShadow />
          <hemisphereLight skyColor="#dfe7f5" groundColor="#8a93a8" intensity={0.4} />

          <Shelter side={side} height={height} indoorColor={indoorColor} roofColor="#3a4256" />

          <Grid
            args={[30, 30]}
            cellColor="#c3cfe4"
            sectionColor="#a9b8d4"
            fadeDistance={20}
            position={[0, 0.001, 0]}
          />

          <OrbitControls minDistance={4} maxDistance={20} />
        </Canvas>
        <ColorLegend />
      </div>

      <div className="stat-row" style={{ marginTop: '1rem' }}>
        <div className="stat-card">
          <div className="stat-label">Indoor (coldest hour)</div>
          <div className="stat-value">{simResult.min_indoor_temp_c?.toFixed(1)}°C</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wall U-value</div>
          <div className="stat-value">{simResult.wall_u_value_wm2k?.toFixed(3)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Safety</div>
          <div className="stat-value">{simResult.safety_passed ? '✅' : '❌'}</div>
        </div>
        {simResult.night_gate_hours_closed > 0 && (
          <div className="stat-card">
            <div className="stat-label">Night Gate</div>
            <div className="stat-value">🌙 Closed {simResult.night_gate_hours_closed.toFixed(0)}h</div>
          </div>
        )}
      </div>
    </div>
  );
}