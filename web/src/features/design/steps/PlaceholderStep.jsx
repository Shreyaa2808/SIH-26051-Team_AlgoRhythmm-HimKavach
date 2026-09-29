import { deriveGeometry } from '../designInput.js';

const COPY = {
  geometry: { title: 'Geometry', body: 'Length, width, height, shape and orientation.' },
  envelope: { title: 'Envelope', body: 'Walls, roof, floor and insulation — recommend, select or custom.' },
  openings: { title: 'Openings', body: 'Windows, doors, glazing and air leakage.' },
  operations: { title: 'Operations', body: 'Activity, heating, ventilation and internal loads.' },
};

/** Stand-in until the real step ships. Shows the defaults the baseline will use. */
export default function PlaceholderStep({ stepId, design }) {
  const c = COPY[stepId] || { title: stepId, body: '' };
  const g = deriveGeometry(design.geometry);
  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>{c.title}</h2>
        <p>{c.body}</p>
      </header>
      <div className="dw-card">
        <p className="dw-muted">
          This step arrives in an upcoming update. Until then the baseline uses safe defaults:
          {' '}{design.geometry.lengthM} × {design.geometry.widthM} × {design.geometry.heightM} m
          ({g.floorAreaM2.toFixed(0)} m² floor), stone masonry wall 0.30 m + EPS 0.10 m, no window, 200 cm² leakage.
        </p>
      </div>
    </div>
  );
}
