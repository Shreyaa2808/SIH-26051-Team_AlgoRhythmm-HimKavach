import { useState } from 'react';
import { MAX_NAME_LENGTH } from './projectStore.js';

const when = (t) => {
  try {
    return new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const STATUS = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved',
};

/**
 * Project header for the design wizard: editable name, autosave status,
 * and a small switcher (open / duplicate / delete / new).
 */
export default function ProjectBar({
  name, status, savedAt, persistent, projects, activeId,
  onRename, onNew, onOpen, onDuplicate, onDelete,
}) {
  const [draft, setDraft] = useState(null); // null = not editing the name
  const [open, setOpen] = useState(false);

  const commit = () => {
    const next = (draft ?? '').replace(/\s+/g, ' ').trim();
    setDraft(null);
    if (next && next !== name) onRename(next);
  };

  return (
    <section className="dw-projectbar" aria-label="Design project">
      <div className="dw-project-main">
        <div className="dw-project-icon" aria-hidden="true">⌂</div>
        <label className="dw-project-name">
          <span className="dw-eyebrow">Project</span>
          <input
            type="text"
            value={draft ?? name}
            maxLength={MAX_NAME_LENGTH}
            aria-label="Project name"
            onFocus={() => setDraft(name)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
            }}
          />
        </label>
        <span className="dw-project-context">ENGINEERING DESIGN</span>
        <span className={`dw-save dw-save-${status}`} title={savedAt ? `Last saved ${when(savedAt)}` : undefined} role="status">
          <i aria-hidden="true" />{STATUS[status]}
        </span>
      </div>

      <div className="dw-project-actions">
        <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          My designs ({projects.length}) {open ? '▴' : '▾'}
        </button>
        <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={onNew}>+ New design</button>
      </div>

      {!persistent && (
        <p className="dw-warn dw-project-warn">
          Autosave is unavailable in this browser (private mode or storage full). Your work stays until you close or refresh this tab.
        </p>
      )}

      {open && (
        <ul className="dw-project-list">
          {projects.length === 0 && <li className="dw-muted">No saved designs yet.</li>}
          {projects.map((p) => (
            <li key={p.id} className={p.id === activeId ? 'current' : undefined}>
              <div className="dw-project-info">
                <strong>{p.name}</strong>
                <span className="dw-muted">
                  {[p.siteLabel || 'No site yet', p.hasBaseline ? 'baseline run' : null, when(p.updatedAt)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="dw-project-row-actions">
                {p.id === activeId
                  ? <span className="dw-badge">Open</span>
                  : <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={() => { setOpen(false); onOpen(p.id); }}>Open</button>}
                <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm" onClick={() => onDuplicate(p.id)}>Duplicate</button>
                <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm dw-btn-danger" onClick={() => onDelete(p.id, p.name)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
