const SITES = [
  { id: 'leh', label: 'Leh', elevation: '3,500 m', note: 'HIAL/DIHAR reference site, coldest validated data' },
  { id: 'siachen', label: 'Siachen', elevation: '5,500 m', note: 'Extreme altitude, highest risk tier' },
  { id: 'dras', label: 'Dras', elevation: '3,230 m', note: '"Gateway to Ladakh", among coldest inhabited places in India' },
];

export default function SiteMap({ onSelect }) {
  return (
    <div className="site-map">
      <h2>Select a Site</h2>
      <p className="form-note">Choose a location to design or retrofit a shelter for.</p>
      <div className="intervention-grid">
        {SITES.map((s) => (
          <div key={s.id} className="intervention-card site-card" onClick={() => onSelect(s.id)}>
            <h3>{s.label}</h3>
            <p>Elevation: {s.elevation}</p>
            <p>{s.note}</p>
            <p className="delta">Click to select →</p>
          </div>
        ))}
      </div>
    </div>
  );
}