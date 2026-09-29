import { DocPage } from './ReportShell';
import PlanView from '../blueprint/PlanView';
import ElevationView from '../blueprint/ElevationView';
import SectionView from '../blueprint/SectionView';
import MaterialSchedule, { OpeningSchedule } from '../blueprint/MaterialSchedule';

/** Architect package: plan, four elevations, section, schedules — each sheet carries design identity. */
export default function ArchitectReport({ drawing, trace, schedule }) {
  if (!drawing?.ok) {
    return (
      <p className="op-empty">
        Detailed blueprint cannot be generated because geometry information is incomplete.
        {drawing?.issues?.length ? ` (${drawing.issues.join(' ')})` : ''}
      </p>
    );
  }
  const doc = 'Architect package';
  return (
    <div className="op-doc">
      <DocPage docTitle={doc} trace={trace} landscape title="Sheet A-01 · Plan">
        <PlanView model={drawing} trace={trace} sheetNo="A-01" />
        <h4 className="op-h4">Opening schedule</h4>
        <OpeningSchedule openings={drawing.openings} />
      </DocPage>
      {['N', 'E', 'S', 'W'].map((c, i) => (
        <DocPage key={c} docTitle={doc} trace={trace} landscape title={`Sheet A-0${i + 2} · ${{ N: 'North', E: 'East', S: 'South', W: 'West' }[c]} elevation`}>
          <ElevationView model={drawing} cardinal={c} trace={trace} sheetNo={`A-0${i + 2}`} />
        </DocPage>
      ))}
      <DocPage docTitle={doc} trace={trace} landscape title="Sheet A-06 · Section A–A">
        <SectionView model={drawing} trace={trace} sheetNo="A-06" />
      </DocPage>
      <DocPage docTitle={doc} trace={trace} landscape title="Sheet A-07 · Material schedule">
        <MaterialSchedule rows={schedule} />
        <p className="op-note">
          Values come from the selected design and the materials database. Layers are listed outside → inside.
          "Not specified" means the model / database holds no value; nothing has been assumed.
        </p>
      </DocPage>
    </div>
  );
}
