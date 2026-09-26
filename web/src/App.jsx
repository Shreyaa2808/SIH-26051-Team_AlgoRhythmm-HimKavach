import { useState } from 'react';
import ConfigForm from './components/ConfigForm';

function App() {
  const [result, setResult] = useState(null);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>LADAKH-ADAPT — Shelter Thermal Simulator</h1>
      <ConfigForm onResult={setResult} />

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Results</h2>
          <p>Min indoor temp: {result.min_indoor_temp_c.toFixed(1)}°C</p>
          <p>Max indoor temp: {result.max_indoor_temp_c.toFixed(1)}°C</p>
          <p>Wall U-value: {result.wall_u_value_wm2k.toFixed(3)} W/m²K</p>
          <p>Safety passed: {result.safety_passed ? '✅ Yes' : '❌ No'}</p>
        </div>
      )}
    </div>
  );
}

export default App;