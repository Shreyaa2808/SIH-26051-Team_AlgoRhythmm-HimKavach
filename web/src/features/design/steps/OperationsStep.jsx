import {
  ACTIVITIES, HEATING_TYPES, VENTILATION_TYPES, LIMITS, deriveOperations, occupiedHours,
} from '../designInput.js';
import NumberField from '../fields/NumberField.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const hoursClosed = (close, open) => (Number(close) === Number(open) ? 0 : (Number(open) - Number(close) + 24) % 24);

export default function OperationsStep({ design, update, errors, showErrors }) {
  const ops = design.operations;
  const shelter = design.shelter;
  const d = deriveOperations(design);
  const set = (patch) => update('operations', patch);
  const setGate = (patch) => update('operations', { nightGate: patch });
  const gate = ops.nightGate;
  const act = ACTIVITIES.find((a) => a.id === ops.activity) || ACTIVITIES[0];
  const canMatch = ['night', 'custom'].includes(shelter.occupancyPattern) && shelter.scheduleStartHour !== shelter.scheduleEndHour;

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>Operations</h2>
        <p>How the shelter is used day to day: what people do inside, how it is heated and aired, and whether it has a Night Gate.</p>
      </header>

      <div className="dw-card">
        <h3>Activity and internal heat</h3>
        <div className="dw-segment" role="radiogroup" aria-label="Occupant activity">
          {ACTIVITIES.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={ops.activity === a.id}
              className={ops.activity === a.id ? 'active' : ''} onClick={() => set({ activity: a.id })}>
              {a.label} · {a.wPerPerson} W
            </button>
          ))}
        </div>
        <div className="dw-grid">
          <NumberField label="Lighting and equipment" unit="W" value={ops.internalLoadsW} min={0} max={LIMITS.internalLoadsW[1]} step="10"
            onChange={(v) => set({ internalLoadsW: v })} hint="Lamps, chargers, radios, cooking gear." />
        </div>
        <dl className="dw-facts dw-facts-tight">
          <div><dt>People ({shelter.occupants} × {act.wPerPerson} W)</dt><dd>{d.metabolicW} W</dd></div>
          <div><dt>Lighting and equipment</dt><dd>{d.internalLoadsW} W</dd></div>
          <div><dt>Heater</dt><dd>{d.heatingW} W</dd></div>
          <div><dt>Total heat gain</dt><dd>{Math.round(d.sensibleHeatW)} W{d.overridden ? ' (manual)' : ''}</dd></div>
        </dl>
        <label className="dw-check">
          <input type="checkbox" checked={d.overridden}
            onChange={(e) => set({ sensibleHeatOverrideW: e.target.checked ? Math.round(d.computedW) : null })} />
          Enter total heat gain manually
        </label>
        {d.overridden && (
          <NumberField label="Total heat gain" unit="W" value={ops.sensibleHeatOverrideW} min={0} max={LIMITS.sensibleHeatW[1]} step="10"
            onChange={(v) => set({ sensibleHeatOverrideW: v })} hint={`Calculated value would be ${Math.round(d.computedW)} W.`} />
        )}
        <p className="dw-muted">
          The solver applies this heat for all 24 h. Your occupancy schedule ({occupiedHours(shelter.scheduleStartHour, shelter.scheduleEndHour)} h/day) is not applied yet, so night-time results may be optimistic.
        </p>
      </div>

      <div className="dw-card">
        <h3>Heating</h3>
        <div className="dw-grid">
          <label className="dw-field">
            <span>Heating type</span>
            <select value={ops.heatingType} onChange={(e) => {
              const t = e.target.value;
              set(t === 'none' ? { heatingType: t, heatingW: 0, coGenerationLpm: 0 } : { heatingType: t });
            }}>
              {HEATING_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          {ops.heatingType !== 'none' && (
            <NumberField label="Heater output" unit="W" value={ops.heatingW} min={0} max={LIMITS.heatingW[1]} step="50"
              onChange={(v) => set({ heatingW: v })} hint="Heat delivered into the room." />
          )}
          {ops.heatingType !== 'none' && (
            <NumberField label="CO generation" unit="L/min" value={ops.coGenerationLpm} min={0} max={LIMITS.coGenerationLpm[1]} step="0.01"
              onChange={(v) => set({ coGenerationLpm: v })} hint="Combustion gas released into the room. 0 if flued outdoors or electric." />
          )}
        </div>
        {ops.heatingType === 'stove' && !(Number(ops.coGenerationLpm) > 0) && (
          <p className="dw-warn">A stove burns fuel and releases CO. With 0 entered, the safety check assumes no combustion gases reach the room.</p>
        )}
        {ops.heatingType === 'electric' && Number(ops.coGenerationLpm) > 0 && (
          <p className="dw-muted">Electric heaters produce no CO. You can set CO generation back to 0.</p>
        )}
      </div>

      <div className="dw-card">
        <h3>Ventilation</h3>
        <div className="dw-segment" role="radiogroup" aria-label="Ventilation type">
          {VENTILATION_TYPES.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={ops.ventilationType === v.id}
              className={ops.ventilationType === v.id ? 'active' : ''} onClick={() => set({ ventilationType: v.id })}>
              {v.label}
            </button>
          ))}
        </div>
        <p className="dw-muted">
          {ops.ventilationType === 'infiltration'
            ? 'Air exchange comes from gaps and wind/stack effect, set by the leakage area on the Openings step.'
            : 'The solver has no separate vent or fan model. Your choice is saved for the report; raise the leakage area on the Openings step to represent extra airflow.'}
        </p>
      </div>

      <div className="dw-card">
        <div className="dw-card-row">
          <h3>Night Gate</h3>
          <label className="dw-switch">
            <input type="checkbox" checked={Boolean(gate.enabled)} onChange={(e) => setGate({ enabled: e.target.checked })} />
            <span>{gate.enabled ? 'On' : 'Off'}</span>
          </label>
        </div>
        <p className="dw-muted">An insulated shutter or curtain over the entrance, closed at night. It is modelled as reduced air leakage while closed; it does not add insulation value.</p>
        {gate.enabled && (
          <>
            <div className="dw-grid">
              <label className="dw-field">
                <span>Closes at</span>
                <select value={gate.closeHour} onChange={(e) => setGate({ closeHour: Number(e.target.value) })}>
                  {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                </select>
              </label>
              <label className="dw-field">
                <span>Opens at</span>
                <select value={gate.openHour} onChange={(e) => setGate({ openHour: Number(e.target.value) })}>
                  {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                </select>
              </label>
              <NumberField label="Leakage while closed" unit="cm²" value={gate.closedLeakageCm2} min={LIMITS.gateLeakageCm2[0]} max={LIMITS.gateLeakageCm2[1]} step="5"
                onChange={(v) => setGate({ closedLeakageCm2: v })}
                hint={`Must be below the normal ${design.openings.leakageAreaCm2} cm² to have any effect.`} />
            </div>
            <p className="dw-muted">Closed about <strong>{hoursClosed(gate.closeHour, gate.openHour)} h</strong> per day.</p>
            {canMatch && (
              <button type="button" className="dw-btn dw-btn-ghost dw-btn-sm"
                onClick={() => setGate({ closeHour: shelter.scheduleStartHour % 24, openHour: shelter.scheduleEndHour % 24 })}>
                Match occupancy hours ({hh(shelter.scheduleStartHour % 24)}–{hh(shelter.scheduleEndHour % 24)})
              </button>
            )}
          </>
        )}
      </div>

      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}
    </div>
  );
}
