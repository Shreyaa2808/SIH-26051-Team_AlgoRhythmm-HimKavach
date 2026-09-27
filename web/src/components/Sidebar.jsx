import ClimateStatusBadge from './ClimateStatusBadge';

const TABS = [
  { id: 'siting', label: 'Micro-Siting', icon: '📍' },
  { id: 'climate', label: 'Climate Engine', icon: '📈' },
  { id: 'materials', label: 'Materials DB', icon: '🧱' },
  { id: 'twin', label: '3D Digital Twin', icon: '🧊' },
  { id: 'optimize', label: 'Multi-Objective', icon: '🔥' },
  { id: 'sandbox', label: 'Bulk / Sandbox', icon: '🏘️' },
  { id: 'benchmark', label: 'ANSYS Benchmark', icon: '✅' },
  { id: 'telemetry', label: 'Real-Time Telemetry', icon: '📡' },
];

export default function Sidebar({ active, onChange, unlockedTabs, siteLabel, scenarioLabel }) {
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <img src="/logo.jpeg" alt="HimKavach" className="sidebar-logo" />
      </div>

    <div className="sidebar-status">
  <div className="sidebar-status-row">
    <span className="status-dot" />
    Station: <strong>{siteLabel || '—'}</strong>
  </div>
  <div className="sidebar-status-row">
    🗓️ <strong>{scenarioLabel || 'No scenario'}</strong>
  </div>
  <ClimateStatusBadge />
</div>

      <nav className="sidebar-nav">
        {TABS.map((t, i) => {
          const unlocked = unlockedTabs.includes(t.id);
          return (
            <button
              key={t.id}
              className={`sidebar-tab ${active === t.id ? 'active' : ''} ${!unlocked ? 'locked' : ''}`}
              onClick={() => unlocked && onChange(t.id)}
              disabled={!unlocked}
            >
              <span className="sidebar-tab-num">{i + 1}</span>
              <span className="sidebar-tab-icon">{t.icon}</span>
              <span className="sidebar-tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="pill-live">● RC Physics Engine</span>
      </div>
    </div>
  );
}