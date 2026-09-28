import { useState } from 'react';
import { API } from './api';
import Sidebar from './components/Sidebar';
import LocationPicker from './components/LocationPicker';
import ConfigForm from './components/ConfigForm';
import RetrofitForm from './components/RetrofitForm';
import RetrofitResults from './components/RetrofitResults';
import TemperatureChart from './components/TemperatureChart';
import ClimateModule from './components/ClimateModule';
import MaterialsModule from './components/MaterialsModule';
import OptimizeModule from './components/OptimizeModule';
import SandboxModule from './components/SandboxModule';
import BenchmarkModule from './components/BenchmarkModule';
import DigitalTwinModule from './components/DigitalTwinModule';
import TelemetryModule from './components/TelemetryModule';
import BlueprintModule from './components/BlueprintModule';

function App() {
  const [activeTab, setActiveTab] = useState('siting');

  const [location, setLocation] = useState(null);
  const siteId = location?.site_id ?? null;

  const [designDay, setDesignDay] = useState('coldest_winter_night');
  const [designMode, setDesignMode] = useState(null);

  const [simResult, setSimResult] = useState(null);
  const [retrofitResult, setRetrofitResult] = useState(null);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [sandboxSeed, setSandboxSeed] = useState(null);

  // Phase E: optimizer <-> 3D twin <-> blueprint wiring
  const [optimizeError, setOptimizeError] = useState(null);
  const [optimizeOptions, setOptimizeOptions] = useState({
    optimizeRoofSlope: true,
    optimizeCeilingHeight: false,
    groundSnowKpa: '0',
    maxSnowKpa: ''
  });
  const [instantiating, setInstantiating] = useState(false);
  const [instantiateError, setInstantiateError] = useState(null);
  const [twinSeed, setTwinSeed] = useState(null);
  const [blueprintProjectId, setBlueprintProjectId] = useState(null);

  const unlockedTabs = [
    'siting',
    'climate',
    'materials',
    'twin',
    'optimize',
    'sandbox',
    'benchmark',
    'telemetry',
    'blueprint'
  ];

  const errorText = (body, status) => {
    const d = body?.detail;
    if (typeof d === 'string') return d;
    if (d) return JSON.stringify(d);
    return `Request failed: ${status}`;
  };

  const runOptimize = async () => {
    const site = simResult?.site_id ?? siteId;
    if (!site) return;

    setOptimizing(true);
    setOptimizeError(null);

    try {
      const res = await fetch(`${API}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          site_id: site,
          design_day: designDay,
          optimize_roof_slope: optimizeOptions.optimizeRoofSlope,
          optimize_ceiling_height: optimizeOptions.optimizeCeilingHeight,
          ground_snow_load_kpa: Number(optimizeOptions.groundSnowKpa) || 0,
          max_roof_snow_load_kpa:
            optimizeOptions.maxSnowKpa === ''
              ? null
              : Number(optimizeOptions.maxSnowKpa)
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(errorText(data, res.status));
      }

      setOptimizeResult(data);
      setInstantiateError(null);
    } catch (err) {
      console.error(err);
      setOptimizeResult(null);
      setOptimizeError(err.message);
    } finally {
      setOptimizing(false);
      setActiveTab('optimize');
    }
  };

  // Phase E: turn one Pareto point into a saved ShelterModel and open it
  // in the 3D twin or the blueprint tab.
  const openDesign = async (design, target, label) => {
    if (!optimizeResult) return;

    const ctx = optimizeResult.context ?? {};

    setInstantiating(true);
    setInstantiateError(null);

    try {
      const res = await fetch(`${API}/optimize/instantiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          site_id: optimizeResult.site_id,
          day_of_year: optimizeResult.day_of_year,
          design,
          floor_area_m2: ctx.floor_area_m2 ?? 16,
          ceiling_height_m: ctx.ceiling_height_m ?? 2.4,
          roof_slope_deg: ctx.roof_slope_deg ?? 0,
          sensible_heat_w: ctx.sensible_heat_w ?? 200,
          ground_snow_load_kpa: ctx.ground_snow_load_kpa ?? 0,
          name: `Optimizer · ${label}`
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(errorText(data, res.status));
      }

      if (target === 'blueprint') {
        setBlueprintProjectId(data.project_id);
        setActiveTab('blueprint');
      } else {
        setTwinSeed({
          nonce: data.project_id,
          design: data.design,
          dayOfYear: optimizeResult.day_of_year,
          label,
          optimizerComfortC: data.optimizer_comfort_c,
          comfortDeltaC: data.comfort_delta_c,
          reproducesOptimizer: data.reproduces_optimizer,
          roofSnowLoadKpa: data.roof_snow_load_kpa
        });
        setActiveTab('twin');
      }
    } catch (err) {
      console.error(err);
      setInstantiateError(err.message);
    } finally {
      setInstantiating(false);
    }
  };

  const handleNewSimResult = (data) => {
    setSimResult(data);
    setOptimizeResult(null);
    setOptimizeError(null);
  };

  const exportOptimizeCSV = () => {
    if (!optimizeResult) return;

    const rows =
      optimizeResult.pareto_front ||
      optimizeResult.curated_designs ||
      [];

    if (!rows.length) return;

    const headers = Object.keys(rows[0]).join(',');

    const body = rows
      .map((r) =>
        Object.values(r)
          .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob(
      [headers + '\n' + body],
      { type: 'text/csv' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'himkavach_designs.csv';
    a.click();

    URL.revokeObjectURL(url);
  };

  const exportOptimizePDF = () => {
    window.print();
  };

  const handleUseInSandbox = (d) => {
    setSandboxSeed({
      cost_inr: d.cost_inr,
      weight_kg: d.weight_kg,
      floor_area_m2: 16.0,
      carbon_kgco2e: d.carbon_kgco2e
    });

    setActiveTab('sandbox');
  };

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

        {/* ================= LOCATION / SITING ================= */}

        {activeTab === 'siting' && (
          <div>

            {!siteId && (
              <LocationPicker
                onResolved={setLocation}
              />
            )}

            {siteId && designMode === null && (
              <>
                <button
                  className="back-btn"
                  onClick={() => {
                    setLocation(null);
                    setSimResult(null);
                    setRetrofitResult(null);
                    setOptimizeResult(null);
                    setOptimizeError(null);
                    setTwinSeed(null);
                    setBlueprintProjectId(null);
                  }}
                >
                  ← Change location
                </button>

                <div className="mode-select">

                  <h2>
                    Designing for {location.label}{' '}
                    ({location.elevation_m.toFixed(0)} m)
                    — what next?
                  </h2>

                  <button
                    onClick={() => setDesignMode('new')}
                  >
                    Design New Shelter
                  </button>

                  <button
                    onClick={() => setDesignMode('retrofit')}
                  >
                    Retrofit Existing Shelter
                  </button>

                </div>
              </>
            )}

            {siteId && designMode === 'new' && (
              <>
                <button
                  className="back-btn"
                  onClick={() => setDesignMode(null)}
                >
                  ← Back
                </button>

                <ConfigForm
                  defaultSiteId={siteId}
                  designDay={designDay}
                  onResult={handleNewSimResult}
                />

                {simResult && (
                  <div className="results">

                    <h2>Results</h2>

                    <TemperatureChart
                      hours={simResult.hours}
                      indoorTemps={simResult.indoor_temp_c}
                      outdoorTemps={simResult.outdoor_temp_c}
                    />

                    <p>
                      Min indoor temp:{' '}
                      {simResult.min_indoor_temp_c.toFixed(1)}°C
                    </p>

                    <p>
                      Max indoor temp:{' '}
                      {simResult.max_indoor_temp_c.toFixed(1)}°C
                    </p>

                    <p>
                      Wall U-value:{' '}
                      {simResult.wall_u_value_wm2k.toFixed(3)}
                      {' '}W/m²K
                    </p>

                    <p>
                      Safety passed:{' '}
                      {simResult.safety_passed
                        ? '✅ Yes'
                        : '❌ No'}
                    </p>

                    {simResult.night_gate_hours_closed > 0 && (
                      <p>
                        🌙 Night Gate closed for{' '}
                        {simResult.night_gate_hours_closed.toFixed(0)}
                        {' '}hours
                      </p>
                    )}

                    <button
                      className="primary-btn"
                      onClick={() => runOptimize()}
                      disabled={optimizing}
                    >
                      {optimizing
                        ? 'Optimizing...'
                        : 'Optimize This Design →'}
                    </button>

                  </div>
                )}
              </>
            )}

            {siteId && designMode === 'retrofit' && (
              <>
                <button
                  className="back-btn"
                  onClick={() => setDesignMode(null)}
                >
                  ← Back
                </button>

                <RetrofitForm
                  defaultSiteId={siteId}
                  designDay={designDay}
                  onResult={setRetrofitResult}
                />

                <RetrofitResults
                  data={retrofitResult}
                />
              </>
            )}

          </div>
        )}

        {/* ================= CLIMATE ================= */}

        {activeTab === 'climate' && (
          <ClimateModule
            siteId={siteId}
            designDay={designDay}
            onScenarioChange={setDesignDay}
            onPickLocation={() => setActiveTab('siting')}
          />
        )}

        {/* ================= MATERIALS ================= */}

        {activeTab === 'materials' && (
          <MaterialsModule />
        )}

        {/* ================= 3D DIGITAL TWIN ================= */}

        {activeTab === 'twin' && (
  <DigitalTwinModule
    siteId={siteId}
    seed={twinSeed}
  />
)}

        {/* ================= OPTIMIZER ================= */}

        {activeTab === 'optimize' && (
          <OptimizeModule
            data={optimizeResult}
            error={optimizeError}
            running={optimizing}
            canRun={Boolean(simResult?.site_id ?? siteId)}
            options={optimizeOptions}
            onOptionsChange={setOptimizeOptions}
            onRerun={() => runOptimize()}
            onExportCSV={exportOptimizeCSV}
            onExportPDF={exportOptimizePDF}
            onUseInSandbox={handleUseInSandbox}
            onOpenDesign={openDesign}
            instantiating={instantiating}
            instantiateError={instantiateError}
          />
        )}

        {/* ================= SANDBOX ================= */}

        {activeTab === 'sandbox' && (
          <SandboxModule
            seed={sandboxSeed}
          />
        )}

        {/* ================= ANSYS ================= */}

        {activeTab === 'benchmark' && (
          <BenchmarkModule />
        )}

        {/* ================= REAL-TIME TELEMETRY ================= */}

        {activeTab === 'telemetry' && (
          <TelemetryModule
            siteId={siteId}
          />
        )}

        {/* ================= BLUEPRINT OUTPUT ================= */}

        {activeTab === 'blueprint' && (
          <BlueprintModule
            initialProjectId={blueprintProjectId}
          />
        )}

      </div>
    </div>
  );
}

export default App;