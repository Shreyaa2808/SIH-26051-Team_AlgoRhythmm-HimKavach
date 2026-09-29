import { Component, useState } from 'react';
import './project/project.css';
import './project/shell.css';

import { ProjectProvider, useProject } from './project/ProjectContext';
import { JOURNEY } from './project/projectSchema';
import { exportOptimizeCSV, fetchInstantiate, fetchOptimize } from './project/actions';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ProjectHome, { ProjectOverview } from './components/ProjectHome';
import { ComingSoon, LoadingState, StepHeader } from './components/shared/Shared';

import LocationPicker from './components/LocationPicker';
import ConfigForm from './components/ConfigForm';
import { NewDesignPage, isFeatureOn } from './features/design';
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
import BlueprintViewer from './features/outputs/blueprint/BlueprintViewer';
import ReportCenter from './features/outputs/reports/ReportCenter';
import TelemetryDashboard from './features/telemetry/TelemetryDashboard';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: '#e0453f' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

function Journey() {
  const { project, step, saveState, update, setStep, close } = useProject();

  // Preserved from the other App.jsx: lets the user explicitly choose
  // New Shelter vs Retrofit while still using the ProjectProvider architecture.
  const [designMode, setDesignMode] = useState(null);
  const useNewWizard = isFeatureOn('newDesignWizard');

  // Temporary UI-only state (not saved in the project)
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState(null);
  const [optimizeOptions, setOptimizeOptions] = useState({
    optimizeRoofSlope: true,
    optimizeCeilingHeight: false,
    groundSnowKpa: '0',
    maxSnowKpa: '',
  });

  const [instantiating, setInstantiating] = useState(false);
  const [instantiateError, setInstantiateError] = useState(null);
  const [sandboxSeed, setSandboxSeed] = useState(null);
  const [outputProjectId, setOutputProjectId] = useState(null);
  const [designSelection, setDesignSelection] = useState(null);

  const active = step;
  const siteId = project.site?.site_id ?? null;
  const designDay = project.scenario?.designDay ?? 'coldest_winter_night';
  const isRetrofit = project.mode === 'retrofit';

  const effectiveDesignMode =
    designMode ??
    (isRetrofit ? 'retrofit' : project.mode === 'new' ? 'new' : null);

  const nextStep = (id) =>
    JOURNEY[JOURNEY.findIndex((j) => j.id === id) + 1]?.id;

  const prevStep = (id) =>
    JOURNEY[JOURNEY.findIndex((j) => j.id === id) - 1]?.id;

  const goNext = (id) => () => setStep(nextStep(id));
  const goBack = (id) => () => setStep(prevStep(id));

  const clearResults = {
    baseline: null,
    optimizedDesigns: [],
    optimizerRun: null,
    selectedDesign: null,
    outputs: {},
  };

  // ---------- handlers ----------

  const changeLocation = () => {
    setDesignMode(null);
    setOutputProjectId(null);
    setDesignSelection(null);

    update(
      { site: null, ...clearResults },
      'Site cleared'
    );
  };

  const handleNewSimResult = (data) => {
    update(
      {
        baseline: data,
        optimizedDesigns: [],
        optimizerRun: null,
        selectedDesign: null,
      },
      'Baseline simulation run'
    );

    setStep('baseline');
  };

  const handleRetrofitResult = (data) => {
    update(
      { baseline: data },
      'Retrofit baseline analysed'
    );

    setStep('baseline');
  };

  const runOptimize = async () => {
    const site = project.baseline?.site_id ?? siteId;

    if (!site) return;

    setOptimizing(true);
    setOptimizeError(null);
    setStep('optimize');

    try {
      const data = await fetchOptimize({
        siteId: site,
        designDay,
        options: optimizeOptions,
      });

      update(
        {
          optimizerRun: data,
          optimizedDesigns:
            data.curated_designs || data.pareto_front || [],
        },
        'Optimization run'
      );

      setInstantiateError(null);
    } catch (err) {
      console.error(err);

      update({
        optimizerRun: null,
        optimizedDesigns: [],
      });

      setOptimizeError(err.message);
    } finally {
      setOptimizing(false);
    }
  };

  const openDesign = async (design, target, label) => {
    const run = project.optimizerRun;

    if (!run) return;

    setInstantiating(true);
    setInstantiateError(null);

    try {
      const data = await fetchInstantiate({
        optimizeResult: run,
        design,
        label,
      });

      setOutputProjectId(data.project_id);

      setDesignSelection({
        projectId: data.project_id,
        source: 'optimizer',
        label,
        design: data.design,
        context: project,
        designDay,
        dayOfYear: run.day_of_year,
        optimizerComfortC: data.optimizer_comfort_c,
        comfortDeltaC: data.comfort_delta_c,
        reproducesOptimizer: data.reproduces_optimizer,
      });

      if (target === 'blueprint') {
        update(
          {
            outputs: {
              ...project.outputs,
              blueprintProjectId: data.project_id,
            },
          },
          `Blueprint generated: ${label}`
        );

        setStep('output');
      } else {
        update(
          {
            selectedDesign: {
              nonce: data.project_id,
              design: data.design,
              dayOfYear: run.day_of_year,
              label,
              optimizerComfortC: data.optimizer_comfort_c,
              comfortDeltaC: data.comfort_delta_c,
              reproducesOptimizer: data.reproduces_optimizer,
              roofSnowLoadKpa: data.roof_snow_load_kpa,
            },
          },
          `Design selected: ${label}`
        );

        setStep('twin');
      }
    } catch (err) {
      console.error(err);
      setInstantiateError(err.message);
    } finally {
      setInstantiating(false);
    }
  };

  const handleUseInSandbox = (d) => {
    setSandboxSeed({
      cost_inr: d.cost_inr,
      weight_kg: d.weight_kg,
      floor_area_m2: 16.0,
      carbon_kgco2e: d.carbon_kgco2e,
    });

    setStep('sandbox');
  };

  // ---------- baseline results (new-build) ----------

  const sim = project.baseline;

  const renderBaseline = () => {
    if (isRetrofit) {
      return <RetrofitResults data={sim} />;
    }

    return (
      <div className="results">
        <h2>Results</h2>

        <TemperatureChart
          hours={sim.hours}
          indoorTemps={sim.indoor_temp_c}
          outdoorTemps={sim.outdoor_temp_c}
        />

        <p>
          Min indoor temp: {sim.min_indoor_temp_c.toFixed(1)}°C
        </p>

        <p>
          Max indoor temp: {sim.max_indoor_temp_c.toFixed(1)}°C
        </p>

        <p>
          Wall U-value: {sim.wall_u_value_wm2k.toFixed(3)} W/m²K
        </p>

        <p>
          Safety passed:{' '}
          {sim.safety_passed ? '✅ Yes' : '❌ No'}
        </p>

        {sim.night_gate_hours_closed > 0 && (
          <p>
            🌙 Night Gate closed for{' '}
            {sim.night_gate_hours_closed.toFixed(0)} hours
          </p>
        )}
      </div>
    );
  };

  // ---------- step screens ----------

  const renderStep = () => {
    switch (active) {
      case 'project':
        return (
          <ProjectOverview
            onContinue={() => setStep('site')}
          />
        );

      case 'site':
        return (
          <div>
            <StepHeader
              stepId="site"
              title="Site"
              description="Choose where the shelter will be built."
              onBack={goBack('site')}
              onNext={
                project.site && designMode
                  ? goNext('site')
                  : undefined
              }
            />

            {!project.site ? (
              <LocationPicker
                onResolved={(loc) => {
                  update(
                    { site: loc },
                    `Site set: ${loc.label}`
                  );

                  setDesignMode(null);
                }}
              />
            ) : designMode === null ? (
              <>
                <div className="results hk-site-card">
                  <div>
                    <h3 style={{ margin: 0 }}>
                      {project.site.label}
                    </h3>

                    <p>
                      Elevation:{' '}
                      {project.site.elevation_m != null
                        ? `${Number(
                            project.site.elevation_m
                          ).toFixed(0)} m`
                        : '—'}
                    </p>
                  </div>

                  <button
                    className="back-btn"
                    onClick={changeLocation}
                  >
                    Change location
                  </button>
                </div>

                <div className="mode-select">
                  <h2>
                    Designing for {project.site.label}{' '}
                    {project.site.elevation_m != null
                      ? `(${Number(
                          project.site.elevation_m
                        ).toFixed(0)} m)`
                      : ''}{' '}
                    — what next?
                  </h2>

                  <button
                    onClick={() => {
                      update(
                        { mode: 'new' },
                        'New shelter selected'
                      );

                      setDesignMode('new');
                      setStep('shelter');
                    }}
                  >
                    Design New Shelter
                  </button>

                  <button
                    onClick={() => {
                      update(
                        { mode: 'retrofit' },
                        'Retrofit selected'
                      );

                      setDesignMode('retrofit');
                      setStep('shelter');
                    }}
                  >
                    Retrofit Existing Shelter
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="results hk-site-card">
                  <div>
                    <h3 style={{ margin: 0 }}>
                      {project.site.label}
                    </h3>

                    <p>
                      Elevation:{' '}
                      {project.site.elevation_m != null
                        ? `${Number(
                            project.site.elevation_m
                          ).toFixed(0)} m`
                        : '—'}
                    </p>
                  </div>

                  <button
                    className="back-btn"
                    onClick={() => {
                      setDesignMode(null);
                      changeLocation();
                    }}
                  >
                    ← Change location
                  </button>
                </div>

                <div className="mode-select">
                  <h2>
                    {designMode === 'retrofit'
                      ? 'Retrofit Existing Shelter'
                      : 'Design New Shelter'}
                  </h2>

                  <button
                    className="back-btn"
                    onClick={() => setDesignMode(null)}
                  >
                    ← Change design mode
                  </button>
                </div>
              </>
            )}
          </div>
        );

      case 'shelter':
        return (
          <div>
            <StepHeader
              stepId="shelter"
              title={
                isRetrofit
                  ? 'Existing shelter'
                  : 'Shelter'
              }
              description={
                isRetrofit
                  ? 'Describe the existing shelter to analyse its weak points.'
                  : 'Define the shelter and run the baseline simulation.'
              }
              onBack={() => {
                setDesignMode(null);
                setStep('site');
              }}
            />

            {effectiveDesignMode === 'new' ? (
              <>
                <button
                  className="back-btn"
                  onClick={() => setDesignMode(null)}
                >
                  ← Back
                </button>

                {useNewWizard ? (
                  <NewDesignPage
                    location={project.site}
                    designDay={designDay}
                    onLocationChange={(loc) =>
                      update(
                        { site: loc },
                        `Site set: ${loc.label}`
                      )
                    }
                    onDesignDayChange={(v) =>
                      update({
                        scenario: {
                          ...project.scenario,
                          designDay: v,
                        },
                      })
                    }
                    onBaselineResult={handleNewSimResult}
                    currentResult={sim}
                  />
                ) : (
                  <ConfigForm
                    defaultSiteId={siteId}
                    designDay={designDay}
                    onResult={handleNewSimResult}
                  />
                )}
              </>
            ) : (
              <>
                {isRetrofit ? (
                  <RetrofitForm
                    defaultSiteId={siteId}
                    designDay={designDay}
                    onResult={handleRetrofitResult}
                  />
                ) : (
                  <ConfigForm
                    defaultSiteId={siteId}
                    designDay={designDay}
                    onResult={handleNewSimResult}
                  />
                )}
              </>
            )}
          </div>
        );

      case 'design':
        return (
          <div>
            <StepHeader
              stepId="design"
              title="Design"
              description="Browse the material database used by the simulation."
              onBack={goBack('design')}
              onNext={goNext('design')}
              nextDisabled={!project.baseline}
              nextLabel="Baseline →"
            />

            <ComingSoon
              title="Design wizard"
              owner="Shelter input team"
            >
              Materials, openings and operations inputs will be
              collected here.
            </ComingSoon>

            <MaterialsModule />
          </div>
        );

      case 'baseline':
        return (
          <div>
            <StepHeader
              stepId="baseline"
              title="Baseline"
              description="How the shelter performs before any optimization."
              onBack={goBack('baseline')}
              onNext={runOptimize}
              nextLabel={
                optimizing ? 'Optimizing…' : 'Optimize →'
              }
              nextDisabled={optimizing}
            />

            {sim && renderBaseline()}
          </div>
        );

      case 'optimize':
        return (
          <div>
            <StepHeader
              stepId="optimize"
              title="Optimize"
              description="Find designs that balance comfort, cost, weight and carbon."
              onBack={goBack('optimize')}
              onNext={project.selectedDesign ? goNext('optimize') : undefined}
             nextLabel="Digital Twin →"
            />

            {optimizing && (
              <LoadingState text="Running the optimizer…" />
            )}

            <OptimizeModule
              data={project.optimizerRun}
              error={optimizeError}
              running={optimizing}
              canRun={Boolean(
                project.baseline?.site_id ?? siteId
              )}
              options={optimizeOptions}
              onOptionsChange={setOptimizeOptions}
              onRerun={runOptimize}
              onExportCSV={() =>
                exportOptimizeCSV(project.optimizerRun)
              }
              onExportPDF={() => window.print()}
              onUseInSandbox={handleUseInSandbox}
              onOpenDesign={openDesign}
              instantiating={instantiating}
              instantiateError={instantiateError}
            />
          </div>
        );

      case 'twin':
        return (
          <div>
            <StepHeader
              stepId="twin"
              title="Digital Twin"
              description="See the selected design in 3D."
              onBack={goBack('twin')}
              onNext={goNext('twin')}
              nextLabel="Validate →"
            />

            <DigitalTwinModule
              siteId={siteId}
              seed={project.selectedDesign}
            />
          </div>
        );

      case 'validate':
        return (
          <div>
            <StepHeader
              stepId="validate"
              title="Validate"
              description="Check the model against benchmarks and live data."
              onBack={goBack('validate')}
              onNext={goNext('validate')}
              nextLabel="Output →"
            />

            <BenchmarkModule />

            <TelemetryDashboard
              projectId={outputProjectId}
              selection={designSelection}
              location={project.site}
              onProjectChange={setOutputProjectId}
            />
          </div>
        );

      case 'output':
        return (
          <div>
            <StepHeader
              stepId="output"
              title="Output"
              description="Blueprints and reports for the final design."
              onBack={goBack('output')}
            />

            <BlueprintViewer
              projectId={
                outputProjectId ??
                project.outputs?.blueprintProjectId ??
                null
              }
              selection={designSelection}
              location={project.site}
              onProjectChange={setOutputProjectId}
              onNavigate={setStep}
            />

            <ReportCenter
              projectId={
                outputProjectId ??
                project.outputs?.blueprintProjectId ??
                null
              }
              selection={designSelection}
              location={project.site}
              onProjectChange={setOutputProjectId}
              onNavigate={setStep}
            />
          </div>
        );

      case 'climate':
        return (
          <ClimateModule
            siteId={siteId}
            designDay={designDay}
            onScenarioChange={(v) =>
              update({
                scenario: {
                  ...project.scenario,
                  designDay: v,
                },
              })
            }
            onPickLocation={() => setStep('site')}
          />
        );

      case 'sandbox':
        return <SandboxModule seed={sandboxSeed} />;

      default:
        return null;
    }
  };

  return (
    <div className="hk-shell">
      <Sidebar
        active={active}
        onChange={setStep}
        project={project}
        onHome={close}
      />

      <div className="hk-main">
        <TopBar
          project={project}
          saveState={saveState}
          onHome={close}
        />

        <div className="hk-page journey">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { project } = useProject();

  return project ? <Journey /> : <ProjectHome />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ProjectProvider>
        <Shell />
      </ProjectProvider>
    </ErrorBoundary>
  );
}