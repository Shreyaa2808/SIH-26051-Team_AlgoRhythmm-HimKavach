import { useState } from 'react';
import ConfigForm from './components/ConfigForm';
import RetrofitForm from './components/RetrofitForm';
import RetrofitResults from './components/RetrofitResults';

function App() {
  const [mode, setMode] = useState(null); // null | "new" | "retrofit"
  const [simResult, setSimResult] = useState(null);
  const [retrofitResult, setRetrofitResult] = useState(null);

  return (
    <div className="app-container">
      <h1>LADAKH-ADAPT — Shelter Thermal Simulator</h1>

      {mode === null && (
        <div className="mode-select">
          <h2>What are you designing?</h2>
          <button onClick={() => setMode('new')}>Design New Shelter</button>
          <button onClick={() => setMode('retrofit')}>Retrofit Existing Shelter</button>
        </div>
      )}

      {mode === 'new' && (
        <>
          <button className="back-btn" onClick={() => setMode(null)}>← Back</button>
          <ConfigForm onResult={setSimResult} />
          {simResult && (
            <div className="results">
              <h2>Results</h2>
              <p>Min indoor temp: {simResult.min_indoor_temp_c.toFixed(1)}°C</p>
              <p>Max indoor temp: {simResult.max_indoor_temp_c.toFixed(1)}°C</p>
              <p>Wall U-value: {simResult.wall_u_value_wm2k.toFixed(3)} W/m²K</p>
              <p>Safety passed: {simResult.safety_passed ? '✅ Yes' : '❌ No'}</p>
            </div>
          )}
        </>
      )}

      {mode === 'retrofit' && (
        <>
          <button className="back-btn" onClick={() => setMode(null)}>← Back</button>
          <RetrofitForm onResult={setRetrofitResult} />
          <RetrofitResults data={retrofitResult} />
        </>
      )}
    </div>
  );
}

export default App;