import Icon from './Icons';
import { JOURNEY, TOOLS, getStepStatus } from '../project/projectSchema';

const ICONS = {
  project: 'folder',
  site: 'pin',
  shelter: 'home',
  design: 'layers',
  baseline: 'chart',
  optimize: 'flame',
  twin: 'cube',
  validate: 'check',
  output: 'file',
  climate: 'thermo',
  sandbox: 'grid',
};

function Brand() {
  return (
    <div className="hk-side-brand">
      <img src="/logo.jpeg" alt="HimKavach" />
    </div>
  );
}

/** Sidebar shown on the dashboard / new-project page (no project open). */
export function DashboardSidebar({ view = 'dashboard', onDashboard, onNew }) {
  return (
    <aside className="hk-side">
      <Brand />
      <div className="hk-side-scroll">
        <div className="hk-side-label">Platform</div>
        <button
          className={`hk-side-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={onDashboard}
        >
          <Icon name="dashboard" />
          <span className="hk-side-text">Dashboard</span>
        </button>
        <button className={`hk-side-item ${view === 'new' ? 'active' : ''}`} onClick={onNew}>
          <Icon name="plus" />
          <span className="hk-side-text">New Shelter Design</span>
        </button>
      </div>
      <div className="hk-side-foot">
        <span className="hk-live">
          <span className="status-dot" /> <span>RC Physics Engine</span>
        </span>
      </div>
    </aside>
  );
}

/** Sidebar shown while a project is open (design journey). */
export default function Sidebar({ active, onChange, project, onHome }) {
  const status = getStepStatus(project);

  const renderItem = (t) => {
    const st = status[t.id];
    return (
      <button
        key={t.id}
        className={`hk-side-item ${active === t.id ? 'active' : ''}`}
        onClick={() => onChange(t.id)}
        title={t.label}
      >
        <Icon name={ICONS[t.id]} />
        <span className="hk-side-text">{t.label}</span>
        {st === 'done' && t.id !== 'project' && <span className="hk-side-state done">✓</span>}
      </button>
    );
  };

  const [overview, ...steps] = JOURNEY;

  return (
    <aside className="hk-side">
      <Brand />
      <div className="hk-side-scroll">
        <div className="hk-side-label">Platform</div>
        <button className="hk-side-item" onClick={onHome}>
          <Icon name="dashboard" />
          <span className="hk-side-text">Dashboard</span>
        </button>
        {renderItem(overview)}

        <div className="hk-side-label">Design journey</div>
        {steps.map(renderItem)}

        <div className="hk-side-label">Tools</div>
        {TOOLS.map(renderItem)}
      </div>
      <div className="hk-side-foot">
        <span className="hk-live">
          <span className="status-dot" /> <span>RC Physics Engine</span>
        </span>
      </div>
    </aside>
  );
}
