import { useState, useEffect } from 'react';

export default function ClimateStatusBadge() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/climate-status')
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  if (error) return null; // silently hide if the endpoint isn't available yet
  if (!status || !status.sites) return null;

  const mostRecent = status.sites
    .filter((s) => s.cached_at)
    .sort((a, b) => new Date(b.cached_at) - new Date(a.cached_at))[0];

  if (!mostRecent) {
    return (
      <div className="sidebar-status-row" style={{ color: 'var(--error)' }}>
        ⚠️ No cached climate data
      </div>
    );
  }

  const cachedDate = new Date(mostRecent.cached_at).toLocaleDateString();

  return (
    <div className="sidebar-status-row" title={`Coverage: ${mostRecent.year_start} to ${mostRecent.year_end}`}>
      📡 Cached from {cachedDate}
    </div>
  );
}