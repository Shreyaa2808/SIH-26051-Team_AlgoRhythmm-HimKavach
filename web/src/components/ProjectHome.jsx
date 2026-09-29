import { useEffect, useMemo, useState } from 'react';
import { projectApi, useProject } from '../project/ProjectContext';
import { JOURNEY } from '../project/projectSchema';
import { ErrorBanner, LoadingState, StepHeader } from './shared/Shared';
import { DashboardSidebar } from './Sidebar';
import TopBar from './TopBar';
import Icon from './Icons';

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');
const modeLabel = (m) => (m === 'retrofit' ? 'Retrofit' : 'New build');

const FLOW = [
  ['pin', 'Choose the site', 'Pick the post location on the map'],
  ['home', 'Define the shelter', 'Set up the shelter and run a baseline'],
  ['flame', 'Optimize', 'Balance comfort, cost, weight and carbon'],
  ['cube', 'Digital twin', 'Inspect the chosen design in 3D'],
  ['file', 'Blueprint', 'Export drawings and reports'],
];

function stepLabel(id) {
  return JOURNEY.find((j) => j.id === id)?.label ?? 'Project';
}

function HeroArt() {
  const stars = [[60, 40, 2.5], [180, 90, 2], [330, 30, 2], [470, 70, 3], [560, 25, 2], [90, 150, 1.6], [400, 140, 1.8]];
  return (
    <svg viewBox="0 0 600 300" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity="0.7" />
      ))}
      <polygon points="0,300 140,150 230,235 350,70 470,220 560,140 600,180 600,300" fill="rgba(255,255,255,0.14)" />
      <polygon points="350,70 300,150 335,135 355,165 385,130 410,150" fill="rgba(255,255,255,0.55)" />
      <polygon points="0,300 90,210 180,270 300,170 420,265 520,190 600,250 600,300" fill="rgba(255,255,255,0.22)" />
      <polygon points="0,300 120,250 240,290 380,230 500,285 600,240 600,300" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

/** New project page: name + mode, then the guided journey starts. */
function NewProjectPage({ onCancel }) {
  const { create } = useProject();
  const [name, setName] = useState('');
  const [mode, setMode] = useState('new');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await create(name, mode);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  const types = [
    ['new', 'home', 'New Build', 'Design a shelter from scratch for a chosen site.'],
    ['retrofit', 'wrench', 'Retrofit', 'Analyse an existing shelter and improve its weak points.'],
  ];

  return (
    <>
      <div className="hk-new-title">
        <h1>New Shelter Design</h1>
        <p>Give your project a name and choose how you want to begin.</p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="hk-new-wrap">
        <div className="hk-panel">
          <form onSubmit={handleCreate}>
            <label className="hk-lbl" htmlFor="hk-pname">
              Project name
            </label>
            <input
              id="hk-pname"
              className="hk-new-input"
              type="text"
              value={name}
              maxLength={120}
              placeholder="e.g. Nubra Personnel Shelter"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />

            <div className="hk-lbl" style={{ marginTop: '1.4rem', color: '#1c2333' }}>
              Project type
            </div>
            <div className="hk-types">
              {types.map(([id, icon, title, sub]) => (
                <button
                  type="button"
                  key={id}
                  className={`hk-type ${mode === id ? 'sel' : ''}`}
                  onClick={() => setMode(id)}
                >
                  <span className="hk-ico" style={{ width: 36, height: 36 }}>
                    <Icon name={icon} />
                  </span>
                  <strong>{title}</strong>
                  <span className="d">{sub}</span>
                </button>
              ))}
            </div>

            <div className="hk-new-actions">
              <button type="button" className="hk-btn-ghost" onClick={onCancel}>
                ← Back
              </button>
              <button type="submit" className="hk-create" disabled={!name.trim() || creating}>
                {creating ? 'Creating…' : 'Create →'}
              </button>
            </div>
          </form>
        </div>

        <div className="hk-panel">
          <h3>What happens next</h3>
          <ul className="hk-next">
            {FLOW.map(([icon, t, d], i) => (
              <li key={t}>
                <span className="hk-ico">
                  <Icon name={icon} />
                </span>
                <div>
                  <strong>
                    {i + 1}. {t}
                  </strong>
                  <span className="s">{d}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/** Dashboard: hero, stats, workflow strip and project cards. */
function Dashboard({ onNew }) {
  const { open } = useProject();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [query, setQuery] = useState('');

  const refresh = () =>
    projectApi
      .list()
      .then(setList)
      .catch((e) => {
        setList([]);
        setError(`Could not load projects: ${e.message}`);
      });

  useEffect(() => {
    refresh();
  }, []);

  const handleOpen = async (id) => {
    setError(null);
    try {
      await open(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRename = async (id) => {
    if (!renameText.trim()) return;
    try {
      await projectApi.rename(id, renameText.trim());
      setRenamingId(null);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await projectApi.remove(p.id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const stats = useMemo(() => {
    const l = list ?? [];
    return [
      ['folder', l.length, 'Total projects'],
      ['home', l.filter((p) => p.mode !== 'retrofit').length, 'New builds'],
      ['wrench', l.filter((p) => p.mode === 'retrofit').length, 'Retrofits'],
      ['pin', l.filter((p) => p.site_label).length, 'Sites chosen'],
    ];
  }, [list]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!list) return [];
    if (!q) return list;
    return list.filter((p) => `${p.name} ${p.site_label ?? ''}`.toLowerCase().includes(q));
  }, [list, query]);

  return (
    <>
      <section className="hk-hero">
        <div className="hk-hero-copy">
          <div className="hk-hero-kicker">HimKavach · Shelter Design Studio</div>
          <h1>Design safer shelters for extreme cold</h1>
          <p>
            Simulate, optimize and validate thermally safe shelters for high-altitude posts — all
            the way from site selection to a ready-to-build blueprint.
          </p>
          <button className="hk-btn-white" onClick={onNew}>
            <Icon name="plus" /> New Shelter Design
          </button>
        </div>
        <div className="hk-hero-art">
          <HeroArt />
        </div>
      </section>

      <div className="hk-stats">
        {stats.map(([icon, n, label]) => (
          <div className="hk-stat" key={label}>
            <span className="hk-ico">
              <Icon name={icon} />
            </span>
            <div>
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hk-flow">
        {FLOW.map(([icon, t, d], i) => (
          <div className="hk-flow-item" key={t}>
            <span className="hk-ico">
              <Icon name={icon} />
            </span>
            <div>
              <strong>
                {i + 1}. {t}
              </strong>
              <span>{d}</span>
            </div>
          </div>
        ))}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="hk-sec-head">
        <h2>
          Your projects <span className="hk-count">{list?.length ?? 0}</span>
        </h2>
        <div className="hk-search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search projects or sites…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {list === null && <LoadingState text="Loading projects…" />}
      {list && list.length === 0 && (
        <div className="hk-empty">
          <h3>No projects yet</h3>
          <p>Start your first shelter design to see it here.</p>
          <button className="hk-btn-dark" onClick={onNew}>
            <Icon name="plus" /> New Shelter Design
          </button>
        </div>
      )}
      {list && list.length > 0 && shown.length === 0 && (
        <div className="hk-empty">No projects match “{query}”.</div>
      )}

      <div className="hk-grid">
        {shown.map((p) => (
          <div className="hk-card" key={p.id}>
            <div className="hk-card-top">
              <span className={`hk-chip ${p.mode === 'retrofit' ? 'retro' : 'new'}`}>
                <Icon name={p.mode === 'retrofit' ? 'wrench' : 'home'} />
                {modeLabel(p.mode)}
              </span>
              <span className="hk-card-prog">At: {stepLabel(p.step)}</span>
            </div>

            {renamingId === p.id ? (
              <div className="hk-rename-box">
                <input
                  type="text"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(p.id)}
                  autoFocus
                />
                <button onClick={() => handleRename(p.id)}>Save</button>
                <button onClick={() => setRenamingId(null)}>Cancel</button>
              </div>
            ) : (
              <h3 title={p.name}>{p.name}</h3>
            )}

            <div className="hk-card-meta">
              <Icon name="pin" />
              <span>{p.site_label || 'No site yet'}</span>
            </div>
            <div className="hk-card-meta">
              <Icon name="calendar" />
              <span title={fmt(p.updated_at)}>Updated {fmtDate(p.updated_at)}</span>
            </div>

            <div className="hk-card-actions">
              <button className="hk-act open" onClick={() => handleOpen(p.id)}>
                Open <Icon name="arrow" />
              </button>
              <button
                className="hk-act"
                onClick={() => {
                  setRenamingId(p.id);
                  setRenameText(p.name);
                }}
              >
                <Icon name="edit" /> Rename
              </button>
              <button className="hk-act del" onClick={() => handleDelete(p)}>
                <Icon name="trash" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Landing screen (no project open): dashboard, or the new-project page. */
export default function ProjectHome() {
  const [creating, setCreating] = useState(false);
  return (
    <div className="hk-shell">
      <DashboardSidebar
        view={creating ? 'new' : 'dashboard'}
        onDashboard={() => setCreating(false)}
        onNew={() => setCreating(true)}
      />
      <div className="hk-main">
        <TopBar
          trail={creating ? ['Dashboard', 'New project'] : ['Dashboard']}
          action={
            creating ? null : (
              <button className="hk-btn-dark" onClick={() => setCreating(true)}>
                <Icon name="plus" /> New Shelter Design
              </button>
            )
          }
        />
        <div className="hk-page">
          {creating ? (
            <NewProjectPage onCancel={() => setCreating(false)} />
          ) : (
            <Dashboard onNew={() => setCreating(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Journey step 1: project details, rename and history timeline. */
export function ProjectOverview({ onContinue }) {
  const { project, rename } = useProject();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.projectName);
  const history = [...(project.meta.history ?? [])].reverse();

  return (
    <div>
      <StepHeader
        stepId="project"
        title={project.projectName}
        description={`${modeLabel(project.mode)} project · created ${fmt(project.meta.createdAt)}`}
        onNext={onContinue}
        nextLabel="Continue →"
      />

      <div className="results">
        <h3>Project name</h3>
        {editing ? (
          <span className="hk-rename">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <button
              onClick={() => {
                rename(text);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <p>
            {project.projectName}{' '}
            <button
              className="hk-link"
              onClick={() => {
                setText(project.projectName);
                setEditing(true);
              }}
            >
              Rename
            </button>
          </p>
        )}
        <p>
          Site: <strong>{project.site?.label ?? 'not chosen yet'}</strong>
        </p>
      </div>

      <div className="results">
        <h3>Project history</h3>
        <ul className="hk-timeline">
          {history.map((h, i) => (
            <li key={i}>
              <span className="hk-tl-dot" />
              <div>
                <strong>{h.event}</strong>
                <small>{fmt(h.ts)}</small>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}