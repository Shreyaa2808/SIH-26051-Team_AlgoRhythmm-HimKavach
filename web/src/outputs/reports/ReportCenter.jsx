import { useState } from 'react';
import '../outputs.css';
import useSelectedDesign from '../useSelectedDesign';
import SelectedDesignHeader, { NoDesignState } from '../SelectedDesignHeader';
import ValidationStatus from '../../validation/ValidationStatus';
import ArchitectReport from './ArchitectReport';
import EngineeringReport from './EngineeringReport';
import SimulationExport from './SimulationExport';
import { buildProjectJson } from '../outputsService';
import { downloadBlob, slug } from '../../common/format';

/** EXPORT DESIGN — one place to produce every deliverable for the selected design. */
export default function ReportCenter({ projectId, selection, location, onProjectChange, onNavigate }) {
  const d = useSelectedDesign({ projectId, selection, location });
  const { project } = d;
  const [doc, setDoc] = useState(null); // 'architect' | 'engineering' | null

  const geometryOk = d.drawing?.ok === true;
  const hasSim = Boolean(project?.sim);

  const exportJson = () => {
    const json = buildProjectJson(project, d.trace, d.selection);
    if (!json) return;
    downloadBlob(json, `${slug(project.name)}-${(project.id ?? 'design').slice(0, 8)}-project.json`, 'application/json');
  };

  return (
    <div className="op-page">
      <div className="module-header op-noprint">
        <div>
          <div className="eyebrow">Deliverables</div>
          <h2>Export Center</h2>
          <p>Generate the architect package, the engineering report and the simulation data for the selected design.</p>
        </div>
      </div>

      <div className="op-noprint">
        <SelectedDesignHeader
          projects={d.projects} projectId={projectId} onProjectChange={(id) => { setDoc(null); onProjectChange?.(id); }}
          project={project} trace={d.trace} selection={d.selection} error={d.error} loading={d.loading}
        />
      </div>

      {!projectId || (!d.loading && !project) ? (
        <div className="op-noprint"><NoDesignState projectsError={d.projectsError} hasProjects={d.projects.length > 0} /></div>
      ) : null}

      {project ? (
        <>
          <div className="op-noprint">
            <ValidationStatus validation={d.validation} />
            <div className="op-export-grid">
              <section className="op-card op-export-card">
                <h3 className="op-card-title">Architect package</h3>
                <p className="op-export-what">Drawings for an architect or civil engineer.</p>
                <ul className="op-checklist"><li>Plan</li><li>Elevations (N, E, S, W)</li><li>Section</li><li>Material schedule</li></ul>
                {!geometryOk ? (
                  <p className="op-empty">Detailed blueprint cannot be generated because geometry information is incomplete.</p>
                ) : null}
                <button className="primary-btn op-btn" disabled={!geometryOk} onClick={() => setDoc('architect')}>
                  Generate Architect Package
                </button>
                <button className="op-btn op-btn-secondary" onClick={() => onNavigate?.('blueprint')}>Open Blueprint viewer</button>
              </section>

              <section className="op-card op-export-card">
                <h3 className="op-card-title">Engineering report</h3>
                <p className="op-export-what">Technical documentation of inputs, thermal results and validation.</p>
                <ul className="op-checklist"><li>Site &amp; climate source</li><li>Design inputs</li><li>Thermal results &amp; 24 h graph</li><li>Optimization</li><li>Validation status</li></ul>
                {!hasSim ? <p className="op-empty">Run a simulation before generating the engineering report.</p> : null}
                <button className="primary-btn op-btn" disabled={!hasSim} onClick={() => setDoc('engineering')}>
                  Generate Engineering Report
                </button>
              </section>

              <section className="op-card op-export-card">
                <h3 className="op-card-title">Simulation data</h3>
                <SimulationExport project={project} trace={d.trace} />
              </section>

              <section className="op-card op-export-card">
                <h3 className="op-card-title">Project data</h3>
                <p className="op-export-what">The design model, its saved simulation result and the traceability block, as JSON.</p>
                <button className="primary-btn op-btn" onClick={exportJson}>Export Project JSON</button>
              </section>
            </div>
          </div>

          {doc ? (
            <div className="op-docview">
              <div className="op-doctoolbar op-noprint">
                <strong>{doc === 'architect' ? 'Architect package' : 'Engineering report'} — {project.name}</strong>
                <span className="op-note">Use “Print / Save as PDF” and choose “Save as PDF” as the destination.</span>
                <button className="primary-btn op-btn" onClick={() => window.print()}>Print / Save as PDF</button>
                <button className="op-btn op-btn-secondary" onClick={() => setDoc(null)}>Close preview</button>
              </div>
              <div className={`op-print-root ${doc === 'architect' ? 'op-print-landscape' : 'op-print-portrait'}`}>
                {doc === 'architect' ? (
                  <ArchitectReport drawing={d.drawing} trace={d.trace} schedule={d.schedule} />
                ) : (
                  <EngineeringReport
                    project={project} trace={d.trace} site={d.site} selection={d.selection}
                    drawing={d.drawing} schedule={d.schedule} validation={d.validation} telemetry={d.telemetry}
                  />
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
