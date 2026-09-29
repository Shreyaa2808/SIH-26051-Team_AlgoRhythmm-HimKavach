import { fmtDateTime, text, NOT_AVAILABLE } from '../common/format';

/**
 * Identifies WHICH design every output belongs to and lets the user switch
 * between saved designs. Used at the top of Blueprint / Export / Monitoring.
 */
export default function SelectedDesignHeader({
  projects, projectId, onProjectChange, project, trace, selection, error, loading,
}) {
  return (
    <div className="op-design-header">
      <div className="op-design-id">
        <div className="op-eyebrow">Selected design</div>
        <h2 className="op-design-name">{project ? text(project.name, 'Unnamed design') : 'No design selected'}</h2>
        {project ? (
          <dl className="op-meta">
            <div><dt>Project</dt><dd>{text(trace?.projectName, 'Not specified')}</dd></div>
            <div><dt>Design ID</dt><dd className="op-mono">{text(project.id, NOT_AVAILABLE)}</dd></div>
            <div><dt>Site</dt><dd>{trace?.siteLabel ? `${trace.siteLabel} (${trace.siteId})` : text(trace?.siteId, NOT_AVAILABLE)}</dd></div>
            <div><dt>Last saved</dt><dd>{fmtDateTime(project.updatedAt)}</dd></div>
            {selection?.label ? <div><dt>Optimizer pick</dt><dd>{selection.label}</dd></div> : null}
          </dl>
        ) : null}
      </div>
      <div className="op-design-picker">
        <label htmlFor="op-design-select">Saved designs</label>
        <select
          id="op-design-select"
          value={projectId || ''}
          onChange={(e) => e.target.value && onProjectChange?.(e.target.value)}
          disabled={!projects?.length}
        >
          <option value="" disabled>{projects?.length ? '— choose a design —' : 'No saved designs'}</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>{text(p.name, 'Unnamed design')} · {p.site_id}</option>
          ))}
        </select>
        {loading ? <span className="op-note">Loading design…</span> : null}
      </div>
      {error ? <p className="op-error">{error}</p> : null}
    </div>
  );
}

export function NoDesignState({ projectsError, hasProjects }) {
  return (
    <div className="op-empty-state">
      <h3>Select a design before generating outputs.</h3>
      <p>
        {hasProjects
          ? 'Choose a saved design above, or open one from the Multi-Objective tab (Open in 3D / Open Blueprint).'
          : 'No saved designs yet — run a design in Micro-Siting or pick a result in the Multi-Objective tab first.'}
      </p>
      {projectsError ? <p className="op-error">{projectsError}</p> : null}
    </div>
  );
}
