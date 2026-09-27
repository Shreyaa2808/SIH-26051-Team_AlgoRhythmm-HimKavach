export default function Header({ siteLabel, scenarioLabel }) {
  return (
    <div className="app-header">
      <div className="app-header-left">
        <div className="app-logo">🛡️</div>
        <div>
          <h1>HIM-KAVACH <span className="badge-tag">SIH PS-26051</span></h1>
          <p className="app-subtitle">Physics-Informed Climate-Adaptive Shelter Platform</p>
        </div>
      </div>
      <div className="app-header-right">
        <span className="pill">📍 Station: <strong>{siteLabel || '—'}</strong></span>
        <span className="pill">🗓️ Scenario: <strong>{scenarioLabel || '—'}</strong></span>
        <span className="pill pill-live">● RC Physics Engine</span>
      </div>
    </div>
  );
}