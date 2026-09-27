import { useState, useEffect } from 'react';

const VIEW_ORDER = ['plan', 'elevation_N', 'elevation_E', 'elevation_S', 'elevation_W', 'section'];
const VIEW_LABEL = {
  plan: 'Plan View',
  elevation_N: 'Elevation N',
  elevation_E: 'Elevation E',
  elevation_S: 'Elevation S',
  elevation_W: 'Elevation W',
  section: 'Section A-A',
};

export default function BlueprintModule() {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [views, setViews] = useState(null);
  const [activeView, setActiveView] = useState('plan');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/shelter/projects')
      .then((res) => res.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch((err) => setError('Could not load saved projects: ' + err.message));
  }, []);

  const loadPreview = async (projectId) => {
    setSelectedId(projectId);
    setViews(null);
    setError(null);
    setLoading(true);

    try {
      const projRes = await fetch(`http://localhost:8000/shelter/projects/${projectId}`);
      if (!projRes.ok) throw new Error(`project fetch failed (${projRes.status})`);
      const proj = await projRes.json();

      const previewRes = await fetch('http://localhost:8000/blueprint/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: proj.model,
          resolved_thicknesses: proj.last_sim?.resolved_thicknesses || {},
        }),
      });
      if (!previewRes.ok) throw new Error(`blueprint preview failed (${previewRes.status})`);
      const data = await previewRes.json();
      setViews(data.views);
      setActiveView('plan');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!selectedId) return;
    window.open(`http://localhost:8000/blueprint/projects/${selectedId}/pdf`, '_blank');
  };

  return (
    <div className="blueprint-module">
      <h2>Professional Blueprint Output</h2>
      <p className="subtitle">
        Plan, four elevations, and a section — generated live from the shelter's
        own ShelterModel schema (real per-wall thicknesses, opening positions,
        and roof slope), not a screenshot of the 3D twin.
      </p>

      {error && <p className="error-text">{error}</p>}

      {!projects.length && !error && (
        <p>No saved shelter designs yet — run a design in "Micro-Siting" first.</p>
      )}

      {!!projects.length && (
        <div className="project-picker">
          <label>Select a saved design: </label>
          <select
            value={selectedId || ''}
            onChange={(e) => e.target.value && loadPreview(e.target.value)}
          >
            <option value="" disabled>
              — choose a project —
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.site_id})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <p>Generating drawing set…</p>}

      {views && (
        <>
          <div className="view-tabs">
            {VIEW_ORDER.map((v) => (
              <button
                key={v}
                className={`view-tab-btn ${activeView === v ? 'active' : ''}`}
                onClick={() => setActiveView(v)}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>

          <div
            className="blueprint-preview"
            dangerouslySetInnerHTML={{ __html: views[activeView] }}
          />

          <button className="primary-btn" onClick={downloadPdf}>
            Download Full Drawing Set (PDF)
          </button>
        </>
      )}
    </div>
  );
}
