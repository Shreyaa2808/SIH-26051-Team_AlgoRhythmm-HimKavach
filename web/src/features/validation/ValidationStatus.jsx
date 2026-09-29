import { STATUS } from './validationService';

const ICON = {
  [STATUS.AVAILABLE]: { ch: '✓', cls: 'ok', text: 'Available' },
  [STATUS.ATTENTION]: { ch: '!', cls: 'warn', text: 'Attention' },
  [STATUS.WAITING]: { ch: '○', cls: 'wait', text: 'Waiting' },
  [STATUS.DEMO]: { ch: '◐', cls: 'demo', text: 'Demo data only' },
  [STATUS.NOT_CONNECTED]: { ch: '○', cls: 'wait', text: 'Not connected' },
  [STATUS.NOT_LINKED]: { ch: '○', cls: 'wait', text: 'Not linked' },
};

/** "MODEL VALIDATION" checklist. */
export default function ValidationStatus({ validation, title = 'Model validation', compact = false }) {
  if (!validation) return null;
  return (
    <section className={`op-card op-validation ${compact ? 'op-validation-compact' : ''}`}>
      <h3 className="op-card-title">{title}</h3>
      <ul className="op-validation-list">
        {validation.items.map((it) => {
          const meta = ICON[it.status] ?? ICON[STATUS.WAITING];
          return (
            <li key={it.key} className={`op-vrow op-v-${meta.cls}`}>
              <span className="op-vicon" aria-hidden="true">{meta.ch}</span>
              <span className="op-vbody">
                <span className="op-vlabel">{it.label}</span>
                <span className="op-vstatus">{meta.text}</span>
                <span className="op-vdetail">{it.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
