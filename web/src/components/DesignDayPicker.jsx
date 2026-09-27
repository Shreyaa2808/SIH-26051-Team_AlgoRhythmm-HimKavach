import { useState, useEffect } from 'react';

export default function DesignDayPicker({ value, onChange }) {
  const [scenarios, setScenarios] = useState([]);

  useEffect(() => {
    fetch('http://localhost:8000/design-day-scenarios')
      .then((res) => res.json())
      .then(setScenarios)
      .catch(() => setScenarios([])); // falls back to empty; caller should handle
  }, []);

  if (scenarios.length === 0) {
    return <p className="form-note">Loading design-day scenarios...</p>;
  }

  return (
    <div className="scenario-grid">
      {scenarios.map((s) => (
        <div
          key={s.id}
          className={`scenario-card ${value === s.id ? 'active' : ''}`}
          onClick={() => onChange(s.id)}
        >
          <h4>{s.label}</h4>
          <p>{s.description}</p>
        </div>
      ))}
    </div>
  );
}