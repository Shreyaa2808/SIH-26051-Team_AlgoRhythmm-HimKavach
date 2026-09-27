import { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function TelemetryModule({ siteId }) {
  const [boxA, setBoxA] = useState([]); // uninsulated reference
  const [boxB, setBoxB] = useState([]); // LADAKH-ADAPT design
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const intervalRef = useRef(null);
  const hourRef = useRef(0);


  const startStream = async () => {
  setRunning(true);
  setBoxA([]);
  setBoxB([]);
  hourRef.current = 0;

  try {
    const [refRes, adaptRes] = await Promise.all([
      fetch('http://localhost:8000/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          design_day: 'coldest_winter_night',
          wall_material_id: 'sun_dried_mud_brick_adobe',
          insulation_material_id: 'expanded_polystyrene_eps',
          insulation_thickness_m: 0.01,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Box A simulate failed: ${r.status}`);
        return r.json();
      }),
      fetch('http://localhost:8000/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          design_day: 'coldest_winter_night',
          night_gate_enabled: true,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(`Box B simulate failed: ${r.status}`);
        return r.json();
      }),
    ]);

    intervalRef.current = setInterval(() => {
      const h = hourRef.current;
      if (h >= 24) {
        clearInterval(intervalRef.current);
        setRunning(false);
        return;
      }
      const point = {
        hour: refRes.hours[h],
        outdoor: refRes.outdoor_temp_c[h],
        boxA: refRes.indoor_temp_c[h],
        boxB: adaptRes.indoor_temp_c[h],
      };
      setBoxA((prev) => [...prev, point]);
      setCurrent(point);
      hourRef.current += 1;
    }, 400);
  } catch (err) {
    console.error(err);
    setRunning(false);
    alert('Could not start telemetry stream: ' + err.message);
  }
};

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <div>
      <div className="module-header">
        <div>
          <div className="eyebrow">Module 7 · Physical Prototype Sensor Ingestion</div>
          <h2>Live Dual-Stream Telemetry</h2>
          <p>Simulated 1 Hz stream comparing an uninsulated reference (Box A) against the LADAKH-ADAPT design (Box B).</p>
        </div>
        <button className="primary-btn" onClick={startStream} disabled={running} style={{ marginTop: 0 }}>
          {running ? '● Streaming...' : '▶ Start Telemetry Stream'}
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Outdoor Ambient</div>
          <div className="stat-value">{current ? `${current.outdoor.toFixed(1)}°C` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Box A (Uninsulated Ref)</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>
            {current ? `${current.boxA.toFixed(1)}°C` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Box B (LADAKH-ADAPT)</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>
            {current ? `${current.boxB.toFixed(1)}°C` : '—'}
          </div>
        </div>
      </div>

      <div className="chart-card">
        <h3>Real-Time Rolling Sensor Stream</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={boxA} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="rgba(150,170,210,0.25)" strokeDasharray="3 3" />
            <XAxis dataKey="hour" stroke="#5c6a85" tick={{ fontSize: 12 }} />
            <YAxis stroke="#5c6a85" tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(150,170,210,0.4)', borderRadius: 10 }} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Line type="monotone" dataKey="outdoor" name="Outdoor" stroke="#93a0b4" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="boxA" name="Box A (Ref)" stroke="#e0453f" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="boxB" name="Box B (Adaptive)" stroke="#17a672" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!running && boxA.length === 0 && (
        <p className="form-note" style={{ marginTop: '1rem' }}>
          Click "Start Telemetry Stream" to simulate a live 24-hour sensor feed built from real solver output for {siteId}.
        </p>
      )}
    </div>
  );
}