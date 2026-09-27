import { useState } from 'react';
import Sidebar from './components/Sidebar';
import SiteMap from './components/SiteMap';
import ConfigForm from './components/ConfigForm';
import RetrofitForm from './components/RetrofitForm';
import RetrofitResults from './components/RetrofitResults';
import TemperatureChart from './components/TemperatureChart';
import ClimateModule from './components/ClimateModule';
import MaterialsModule from './components/MaterialsModule';
import OptimizeModule from './components/OptimizeModule';
import BenchmarkModule from './components/BenchmarkModule';

const SITE_LABELS = { leh: 'Leh (Capital)', siachen: 'Siachen', dras: 'Dras' };

function App() {
  const [activeTab, setActiveTab] = useState('siting');
  const [siteId, setSiteId] = useState(null);
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
        siteLabel={siteId ? SITE_LABELS[siteId] : null}
        scenarioLabel={designDay}
      />

      <div className="main-content">
        {activeTab === 'siting' && (
          <div>
            {!siteId && <SiteMap onSelect={setSiteId} />}

            {siteId && designMode === null && (
              <>
                <button className="back-btn" onClick={() => setSiteId(null)}>← Change site</button>
                <div className="mode-select">
                  <h2>Designing for {SITE_LABELS[siteId]} — what next?</h2>
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

        {activeTab === 'twin' && (
          <div className="module-header">
            <div>
              <div className="eyebrow">Module 4 · 3D Parametric Digital Twin</div>
              <h2>Interactive 3D Thermal Field</h2>
              <p>Coming soon.</p>
            </div>
          </div>
        )}

        {activeTab === 'optimize' && (
          <OptimizeModule data={optimizeResult} onExportCSV={exportOptimizeCSV} onExportPDF={exportOptimizePDF} />
        )}

        {activeTab === 'benchmark' && <BenchmarkModule />}

        {activeTab === 'telemetry' && (
          <div className="module-header">
            <div>
              <div className="eyebrow">Module 7 · Real-Time Telemetry</div>
              <h2>Live Sensor Stream</h2>
              <p>Coming soon.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;