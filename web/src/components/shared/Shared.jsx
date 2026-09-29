// Person 1: shared UI pieces every step can reuse.
import { JOURNEY } from '../../project/projectSchema';

export function LoadingState({ text = 'Loading…' }) {
  return (
    <div className="hk-loading" role="status">
      <span className="hk-spinner" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry, onDismiss }) {
  if (!message) return null;
  return (
    <div className="hk-error" role="alert">
      <span className="hk-error-text">⚠️ {message}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
      {onDismiss && <button onClick={onDismiss}>✕</button>}
    </div>
  );
}

/** Back (left) / Next (right) bar + step title. Both buttons are the same size. */
export function StepHeader({ stepId, title, description, onBack, onNext, nextLabel = 'Next →', nextDisabled }) {
  const idx = JOURNEY.findIndex((j) => j.id === stepId);
  return (
    <div className="hk-step-header">
      <div className="hk-step-bar">
        {onBack ? (
          <button className="hk-nav-btn" onClick={onBack}>
            ← Back
          </button>
        ) : (
          <span className="hk-nav-spacer" />
        )}
        {idx >= 0 && (
          <div className="hk-step-kicker">
            Step {idx + 1} of {JOURNEY.length}
          </div>
        )}
        {onNext ? (
          <button className="hk-nav-btn" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </button>
        ) : (
          <span className="hk-nav-spacer" />
        )}
      </div>
      <div className="hk-step-title">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

/** Placeholder card for steps that another teammate will build. */
export function ComingSoon({ title, owner, children }) {
  return (
    <div className="results hk-coming">
      <h3>{title}</h3>
      <p>{children}</p>
      {owner && <span className="hk-owner">Owner: {owner}</span>}
    </div>
  );
}