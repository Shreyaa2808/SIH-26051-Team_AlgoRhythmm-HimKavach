import Icon from './Icons';
import ClimateStatusBadge from './ClimateStatusBadge';

const SAVE = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed' };

/**
 * Top bar.
 *  - dashboard / new-project: breadcrumb trail + optional action button
 *  - project open: project name, mode, site + elevation, save state, back to dashboard
 */
export default function TopBar({ trail = [], action, project, saveState, onHome }) {
  const site = project?.site;
  const elev = site?.elevation_m != null ? `${Number(site.elevation_m).toFixed(0)} m` : null;

  return (
    <header className="hk-top">
      <div className="hk-crumbs">
        <span className="hk-crumb-chip">HimKavach</span>
        {project ? (
          <>
            <span className="hk-crumb-sep">/</span>
            <span className="hk-crumb-cur" title={project.projectName}>
              {project.projectName}
            </span>
          </>
        ) : (
          trail.map((t, i) => (
            <span key={t} style={{ display: 'contents' }}>
              <span className="hk-crumb-sep">/</span>
              <span className={i === trail.length - 1 ? 'hk-crumb-cur' : 'hk-crumb-dim'}>{t}</span>
            </span>
          ))
        )}
      </div>

      <div className="hk-top-right">
        {project ? (
          <>
            <span className={`hk-chip ${project.mode === 'retrofit' ? 'retro' : 'new'}`}>
              <Icon name={project.mode === 'retrofit' ? 'wrench' : 'home'} />
              {project.mode === 'retrofit' ? 'Retrofit' : 'New build'}
            </span>
            <span className="hk-chip site" title={site?.label || 'No site chosen yet'}>
              <Icon name="pin" />
              {site ? `${site.label}${elev ? ` · ${elev}` : ''}` : 'No site chosen'}
            </span>
            {SAVE[saveState] && (
              <span
                className={`hk-chip ${
                  saveState === 'saved' ? 'ok' : saveState === 'error' ? 'warn' : ''
                }`}
              >
                {SAVE[saveState]}
              </span>
            )}
            <button className="hk-btn-ghost" onClick={onHome}>
              <Icon name="back" /> Dashboard
            </button>
          </>
        ) : (
          <>
            <span className="hk-badge hk-chip-plain">
              <ClimateStatusBadge />
            </span>
            {action}
          </>
        )}
      </div>
    </header>
  );
}
