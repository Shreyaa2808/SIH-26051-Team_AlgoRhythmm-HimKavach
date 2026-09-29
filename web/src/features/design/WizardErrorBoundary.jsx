import { Component } from 'react';

/**
 * Keeps a crash inside one wizard step from blanking the whole app.
 * Resets automatically when `resetKey` changes (e.g. another project is opened).
 */
export default class WizardErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Design wizard crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="dw-card dw-crash" role="alert">
        <h3>This step hit a problem</h3>
        <p className="dw-muted">
          Your inputs are saved. Try again; if it keeps failing, start a fresh design and re-enter the inputs.
        </p>
        <pre className="dw-crash-msg">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="dw-inline">
          <button type="button" className="dw-btn dw-btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          {this.props.onReset && (
            <button type="button" className="dw-btn dw-btn-ghost" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>
              Start a new design
            </button>
          )}
        </div>
      </div>
    );
  }
}
