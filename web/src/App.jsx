import { useState } from 'react';
import Sidebar from './components/Sidebar';
import LocationPicker from './components/LocationPicker';
import ConfigForm from './components/ConfigForm';
import RetrofitForm from './components/RetrofitForm';
import RetrofitResults from './components/RetrofitResults';
import TemperatureChart from './components/TemperatureChart';
import ClimateModule from './components/ClimateModule';
import MaterialsModule from './components/MaterialsModule';
import OptimizeModule from './components/OptimizeModule';
import BenchmarkModule from './components/BenchmarkModule';
import TelemetryModule from './components/TelemetryModule';
import DigitalTwinModule from './components/DigitalTwinModule';

function App() {
  const [activeTab, setActiveTab] = useState('siting');
  // location replaces the old fixed-3-site `siteId` string: it's whatever
  // POST /location/resolve returned for a map click / typed coordinates /
  // a searched place name -- { site_id, lat, lon, elevation_m, label, area_m2 }.
  const [location, setLocation] = useState(null);
  const siteId = location?.site_id ?? null;
  const [designDay, setDesignDay] = useState('coldest_winter_night');
  const [designMode, setDesignMode] = useState(null);

  const [simResult, setSimResult] = useState(null);
  const [retrofitResult, setRetrofitResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  const unlockedTabs = ['siting', 'climate', 'materials', 'twin', 'optimize', 'benchmark', 'telemetry'];

  const runOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await fetch('http://localhost:8000/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: simResult.site_id, design_day: designDay }),
      });
      const data = await res.json();
      setOptimizeResult(data);
      setActiveTab('optimize');
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

  const exportOptimizeCSV = () => {
    if (!optimizeResult) return;
    const rows = optimizeResult.pareto_front;
    const headers = Object.keys(rows[0]).join(',');
    const body = rows.map((r) => Object.values(r).join(',')).join('\n');
    const blob = new Blob([headers + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ladakh_adapt_designs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOptimizePDF = () => window.print();

  return (
    <div className="app-shell">
      <Sidebar
        active={activeTab}
        onChange={setActiveTab}
        unlockedTabs={unlockedTabs}
        siteLabel={location?.label ?? null}
        scenarioLabel={designDay}
      />

      <div className="main-content">
        {activeTab === 'siting' && (
          <div>
            {!siteId && <LocationPicker onResolved={setLocation} />}

            {siteId && designMode === null && (
              <>
                <button className="back-btn" onClick={() => setLocation(null)}>← Change location</button>
                <div className="mode-select">
                  <h2>Designing for {location.label} ({location.elevation_m.toFixed(0)} m) — what next?</h2>
                  <button onClick={() => setDesignMode('new')}>Design New Shelter</button>
                  <button onClick={() => setDesignMode('retrofit')}>Retrofit Existing Shelter</button>
                </div>
              </>
            )}

            {siteId && designMode === 'new' && (
              <>
                <button className="back-btn" onClick={() => setDesignMode(null)}>← Back</button>
                <ConfigForm defaultSiteId={siteId} designDay={designDay} onResult={handleNewSimResult} />

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
                      {optimizing ? 'Optimizing...' : 'Optimize This Design →'}
                    </button>
                  </div>
                )}
              </>
            )}

            {siteId && designMode === 'retrofit' && (
              <>
                <button className="back-btn" onClick={() => setDesignMode(null)}>← Back</button>
                <RetrofitForm defaultSiteId={siteId} designDay={designDay} onResult={setRetrofitResult} />
                <RetrofitResults data={retrofitResult} />
              </>
            )}
          </div>
        )}

        {activeTab === 'climate' && (
          <ClimateModule siteId={siteId || 'leh'} designDay={designDay} onScenarioChange={setDesignDay} />
        )}

        {activeTab === 'materials' && <MaterialsModule />}

{activeTab === 'twin' && <DigitalTwinModule simResult={simResult} />}
        

        {activeTab === 'optimize' && (
          <OptimizeModule data={optimizeResult} onExportCSV={exportOptimizeCSV} onExportPDF={exportOptimizePDF} />
        )}

        {activeTab === 'benchmark' && <BenchmarkModule />}

        {activeTab === 'telemetry' && <TelemetryModule siteId={siteId || 'leh'} />}
      </div>
    </div>
  );
}

export default App;