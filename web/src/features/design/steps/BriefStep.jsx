import {
  SHELTER_TYPES, USAGES, SEASONS, OCCUPANCY_PATTERNS, LIMITS, occupiedHours,
} from '../designInput.js';

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const fmt = (h) => `${String(h % 24).padStart(2, '0')}:00${h === 24 ? ' (end of day)' : ''}`;

export default function BriefStep({ design, update, errors, showErrors }) {
  const { shelter, site } = design;
  const hours = occupiedHours(shelter.scheduleStartHour, shelter.scheduleEndHour);
  const [minOcc, maxOcc] = LIMITS.occupants;

  const setOccupants = (n) => update('shelter', { occupants: Math.min(maxOcc, Math.max(minOcc, n)) });

  const setPattern = (id) => {
    const p = OCCUPANCY_PATTERNS.find((x) => x.id === id);
    if (id === 'custom') update('shelter', { occupancyPattern: id });
    else update('shelter', { occupancyPattern: id, scheduleStartHour: p.startHour, scheduleEndHour: p.endHour });
  };

  const seasonClash =
    (shelter.season === 'winter' && String(site.designDay).includes('summer')) ||
    (shelter.season === 'summer' && String(site.designDay).includes('winter'));

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>Shelter brief</h2>
        <p>What are you building, who will use it, and when? These decide the internal heat and the comfort you design for.</p>
      </header>

      <div className="dw-card dw-grid">
        <label className="dw-field">
          <span>Shelter type</span>
          <select value={shelter.type} onChange={(e) => update('shelter', { type: e.target.value })}>
            {SHELTER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        <label className="dw-field">
          <span>Usage</span>
          <select value={shelter.usage} onChange={(e) => update('shelter', { usage: e.target.value })}>
            {USAGES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        <label className="dw-field">
          <span>Design season</span>
          <select value={shelter.season} onChange={(e) => update('shelter', { season: e.target.value })}>
            {SEASONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        <div className="dw-field">
          <span>Occupants</span>
          <div className="dw-stepper">
            <button type="button" aria-label="Fewer occupants" onClick={() => setOccupants(Number(shelter.occupants) - 1)}>−</button>
            <input
              type="number"
              min={minOcc}
              max={maxOcc}
              value={shelter.occupants}
              onChange={(e) => setOccupants(Number(e.target.value))}
            />
            <button type="button" aria-label="More occupants" onClick={() => setOccupants(Number(shelter.occupants) + 1)}>+</button>
          </div>
        </div>
      </div>

      {seasonClash && (
        <p className="dw-warn">
          Your design season ({shelter.season}) doesn&apos;t match the design-day scenario chosen on the Site step. Results
          will reflect the scenario, not the season.
        </p>
      )}

      <div className="dw-card">
        <h3>Occupancy schedule</h3>
        <div className="dw-chips" role="radiogroup" aria-label="Occupancy pattern">
          {OCCUPANCY_PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={shelter.occupancyPattern === p.id}
              className={`dw-chip ${shelter.occupancyPattern === p.id ? 'active' : ''}`}
              onClick={() => setPattern(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="dw-grid dw-grid-2">
          <label className="dw-field">
            <span>From</span>
            <select
              value={shelter.scheduleStartHour}
              disabled={shelter.occupancyPattern !== 'custom'}
              onChange={(e) => update('shelter', { scheduleStartHour: Number(e.target.value) })}
            >
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{fmt(h)}</option>)}
            </select>
          </label>
          <label className="dw-field">
            <span>To</span>
            <select
              value={shelter.scheduleEndHour}
              disabled={shelter.occupancyPattern !== 'custom'}
              onChange={(e) => update('shelter', { scheduleEndHour: Number(e.target.value) })}
            >
              {HOURS.map((h) => <option key={h} value={h}>{fmt(h)}</option>)}
            </select>
          </label>
        </div>
        <p className="dw-muted">
          Occupied about <strong>{hours} h</strong> per day.
          {shelter.occupancyPattern !== 'continuous' &&
            ' Note: the solver currently applies internal heat gain for all 24 h, so results may be optimistic outside these hours.'}
        </p>
      </div>

      {Number(shelter.occupants) === 0 && <p className="dw-warn">With 0 occupants there is no body heat in the model.</p>}
      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}
    </div>
  );
}
