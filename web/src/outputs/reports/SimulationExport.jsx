import { useMemo, useState } from 'react';
import { downloadBlob, slug } from '../../common/format';
import { buildSimulationCsv } from '../outputsService';

/** CSV download card + column preview. */
export default function SimulationExport({ project, trace }) {
  const [includeHeader, setIncludeHeader] = useState(true);
  const built = useMemo(() => buildSimulationCsv(project, trace, { includeHeader }), [project, trace, includeHeader]);

  const onDownload = () => {
    if (!built) return;
    const name = `${slug(project?.name)}-${(project?.id ?? 'design').slice(0, 8)}-simulation.csv`;
    downloadBlob(built.csv, name, 'text/csv;charset=utf-8');
  };

  return (
    <div className="op-export-body">
      <p className="op-export-what">CSV contains hourly simulation data for engineering and research analysis.</p>
      {built ? (
        <>
          <p className="op-note">
            Columns: <code>{built.columns.join(', ')}</code> · {built.rows} rows. Only values returned by the
            simulation engine are exported; solar radiation, heat gain/loss and heating demand are not returned
            per hour by the API, so they are not included.
          </p>
          <label className="op-check">
            <input type="checkbox" checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} />
            Include traceability header (# comment lines — read with <code>pandas.read_csv(comment='#')</code>)
          </label>
        </>
      ) : (
        <p className="op-empty">Run a simulation before exporting simulation data.</p>
      )}
      <button className="primary-btn op-btn" disabled={!built} onClick={onDownload}>Download Simulation Data (CSV)</button>
    </div>
  );
}
