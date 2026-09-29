import { useState } from 'react';
import '../outputs.css';
import { apiUrl } from '../../../api';
import { downloadBlob, slug } from '../../common/format';
import useSelectedDesign from '../useSelectedDesign';
import SelectedDesignHeader, { NoDesignState } from '../SelectedDesignHeader';
import PlanView from './PlanView';
import ElevationView from './ElevationView';
import SectionView from './SectionView';
import MaterialSchedule, { OpeningSchedule } from './MaterialSchedule';

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'elevations', label: 'Elevations' },
  { id: 'section', label: 'Section' },
  { id: '3d', label: '3D' },
];
const ELEV = ['N', 'E', 'S', 'W'];

function saveSvg(svgId, filename) {
  const el = document.getElementById(svgId);
  if (!el) return;
  const clone = el.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.removeAttribute('style');
  const h = clone.getAttribute('viewBox')?.split(' ')[3];
  const w = clone.getAttribute('viewBox')?.split(' ')[2];
  if (w && h) { clone.setAttribute('width', w); clone.setAttribute('height', h); }
  downloadBlob(new XMLSerializer().serializeToString(clone), filename, 'image/svg+xml');
}

/** Architectural blueprint of the SELECTED design: plan / elevations / section / 3D. */
export default function BlueprintViewer({ projectId, selection, location, onProjectChange, onNavigate }) {
  const d = useSelectedDesign({ projectId, selection, location });
  const { project, drawing, trace } = d;
  const [tab, setTab] = useState('plan');
  const [elev, setElev] = useState('N');

  const base = `${slug(project?.name)}-${(project?.id ?? 'design').slice(0, 8)}`;
  const ok = drawing?.ok === true;

  return (
    <div className="op-page">
      <div className="module-header op-noprint">
        <div>
          <div className="eyebrow">Architectural output</div>
          <h2>Blueprint</h2>
          <p>Plan, elevations and section generated from the selected design's own geometry and materials — nothing is drawn that the model does not define.</p>
        </div>
      </div>

      <SelectedDesignHeader
        projects={d.projects} projectId={projectId} onProjectChange={onProjectChange}
        project={project} trace={trace} selection={d.selection} error={d.error} loading={d.loading}
      />

      {!projectId || (!d.loading && !project) ? (
        <NoDesignState projectsError={d.projectsError} hasProjects={d.projects.length > 0} />
      ) : null}

      {project && !ok ? (
        <div className="op-empty-state">
          <h3>Detailed blueprint cannot be generated because geometry information is incomplete.</h3>
          <ul>{(drawing?.issues ?? []).map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      ) : null}

      {project && ok ? (
        <>
          <div className="op-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id}
                className={`op-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
            <span className="op-tabs-spacer" />
            {/* <button className="op-btn primary-btn" onClick={() => onNavigate?.('exports')}>Download / Export Blueprint →</button> */}
          </div>

          {tab === 'plan' ? (
            <div className="op-sheet">
              <PlanView model={drawing} trace={trace} sheetNo="A-01" svgId="bp-svg-plan" />
              <div className="op-sheet-actions">
                <button className="op-btn op-btn-secondary" onClick={() => saveSvg('bp-svg-plan', `${base}-plan.svg`)}>Download plan (SVG)</button>
              </div>
              <h4 className="op-h4">Opening schedule</h4>
              <OpeningSchedule openings={drawing.openings} />
            </div>
          ) : null}

          {tab === 'elevations' ? (
            <div className="op-sheet">
              <div className="op-subtabs">
                {ELEV.map((c) => (
                  <button key={c} className={`op-subtab ${elev === c ? 'active' : ''}`} onClick={() => setElev(c)}>
                    {{ N: 'North', E: 'East', S: 'South', W: 'West' }[c]}
                  </button>
                ))}
              </div>
              <ElevationView model={drawing} cardinal={elev} trace={trace} sheetNo={`A-0${ELEV.indexOf(elev) + 2}`} svgId={`bp-svg-elev-${elev}`} />
              <div className="op-sheet-actions">
                <button className="op-btn op-btn-secondary" onClick={() => saveSvg(`bp-svg-elev-${elev}`, `${base}-elevation-${elev}.svg`)}>Download elevation (SVG)</button>
              </div>
              <h4 className="op-h4">Opening schedule</h4>
              <OpeningSchedule openings={drawing.openings} />
            </div>
          ) : null}

          {tab === 'section' ? (
            <div className="op-sheet">
              <SectionView model={drawing} trace={trace} sheetNo="A-06" svgId="bp-svg-section" />
              <div className="op-sheet-actions">
                <button className="op-btn op-btn-secondary" onClick={() => saveSvg('bp-svg-section', `${base}-section.svg`)}>Download section (SVG)</button>
              </div>
            </div>
          ) : null}

          {tab === '3d' ? (
            <div className="op-card">
              <h3 className="op-card-title">3D digital twin</h3>
              <p>The 3D model is rendered by the Digital Twin module. It shows the design last opened there from the Multi-Objective tab; open the same design (<strong>{project.name}</strong>) to keep 3D and drawings consistent.</p>
              <button className="primary-btn op-btn" onClick={() => onNavigate?.('twin')}>Open 3D Digital Twin</button>
            </div>
          ) : null}

          {tab !== '3d' ? (
            <div className="op-sheet">
              <h4 className="op-h4">Material schedule</h4>
              <MaterialSchedule rows={d.schedule} />
              <p className="op-note">
                Values come from the selected design and the materials database. Layers are listed outside → inside (structural, then insulation),
                the same order the thermal solver uses. "Not specified" = no value in the model/database. Drawings are not to scale — rely on the dimensions and graphic scale bar.
              </p>
              <p className="op-note">
                Legacy backend drawing set (CAD-style PDF, generated by the server):{' '}
                <a href={apiUrl(`/blueprint/projects/${encodeURIComponent(project.id)}/pdf`)} target="_blank" rel="noreferrer">download</a>.
                Its title block prints an approximate scale and uses fallback drawing thicknesses when none are resolved.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
