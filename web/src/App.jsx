import { useState } from 'react';
import SiteMap from './components/SiteMap';
import ConfigForm from './components/ConfigForm';
import RetrofitForm from './components/RetrofitForm';
import RetrofitResults from './components/RetrofitResults';
import TemperatureChart from './components/TemperatureChart';
import OptimizeResults from './components/OptimizeResults';

function App() {
  const [siteId, setSiteId] = useState(null);
  const [mode, setMode] = useState(null); // null | "new" | "retrofit"
  const [simResult, setSimResult] = useState(null);
  const [retrofitResult, setRetrofitResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  const runOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: simResult.site_id,
          day_of_year: simResult.day_of_year,
        }),
      });
      const data = await res.json();
      setOptimizeResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setOptimizing(false);
    }
  };

  const handleNewSimResult = (data) => {
    setSimResult(data);
    setOptimizeResult(null);
  };

  const resetAll = () => {
    setSiteId(null);
    setMode(null);
    setSimResult(null);
    setRetrofitResult(null);
    setOptimizeResult(null);
  };

  return (
    <div className="app-container">
      <h1>LADAKH-ADAPT — Shelter Thermal Simulator</h1>
      <p className="tagline">Physics-validated shelter design for extreme high-altitude climates</p>

      {!siteId && <SiteMap onSelect={setSiteId} />}

      {siteId && mode === null && (
        <>
          <button className="back-btn" onClick={() => setSiteId(null)}>← Change site</button>
          <div className="mode-select">
            <h2>Designing for {siteId[0].toUpperCase() + siteId.slice(1)} — what next?</h2>
            <button onClick={() => setMode('new')}>Design New Shelter</button>
            <button onClick={() => setMode('retrofit')}>Retrofit Existing Shelter</button>
          </div>
        </>
      )}

      {siteId && mode === 'new' && (
        <>
          <button className="back-btn" onClick={() => setMode(null)}>← Back</button>
          <ConfigForm defaultSiteId={siteId} onResult={handleNewSimResult} />

          {simResult && (
            <div className="results">
              <h2>Results</h2>
              <TemperatureChart
                hours={simResult.hours}
                indoorTemps={simResult.indoor_temp_c}
                outdoorTemps={simResult.outdoor_temp_c}
              />
              <p>Min indoor temp: {simResult.min_indoor_temp_c.toFixed(1)}°C</p>
              <p>Max indoor temp: {simResult.max_indoor_temp_c.toFixed(1)}°C</p>
              <p>Wall U-value: {simResult.wall_u_value_wm2k.toFixed(3)} W/m²K</p>
              <p>Safety passed: {simResult.safety_passed ? '✅ Yes' : '❌ No'}</p>
{simResult.night_gate_hours_closed > 0 && (
  <p>🌙 Night Gate closed for {simResult.night_gate_hours_closed.toFixed(0)} hours</p>
)}

              <button className="primary-btn" onClick={runOptimize} disabled={optimizing}>
                {optimizing ? 'Optimizing (may take a moment)...' : 'Optimize This Design'}
              </button>
            </div>
          )}

          <OptimizeResults data={optimizeResult} />
        </>
      )}

      {siteId && mode === 'retrofit' && (
        <>
          <button className="back-btn" onClick={() => setMode(null)}>← Back</button>
          <RetrofitForm defaultSiteId={siteId} onResult={setRetrofitResult} />
          <RetrofitResults data={retrofitResult} />
        </>
      )}
    </div>
  );
}

export default App;