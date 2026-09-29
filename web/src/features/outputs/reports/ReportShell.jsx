import { fmtDateTime, text, NOT_AVAILABLE } from '../../common/format';

/**
 * A printable page. EVERY page carries the design identification header, so a
 * loose printed sheet can always be traced back to its design.
 */
export function DocPage({ title, trace, children, landscape = false, docTitle }) {
  return (
    <section className={`op-docpage ${landscape ? 'op-docpage-landscape' : ''}`}>
      <header className="op-dochead">
        <div className="op-dochead-main">
          <span className="op-dochead-brand">HimKavach</span>
          <span className="op-dochead-doc">{docTitle}</span>
        </div>
        <div className="op-dochead-trace">
          <span><b>Project:</b> {text(trace?.projectName, 'Not specified')}</span>
          <span><b>Design:</b> {text(trace?.designName, NOT_AVAILABLE)}</span>
          <span><b>Design ID:</b> <span className="op-mono">{text(trace?.designId, NOT_AVAILABLE)}</span></span>
          <span><b>Site:</b> {trace?.siteLabel ? `${trace.siteLabel} (${trace.siteId})` : text(trace?.siteId, NOT_AVAILABLE)}</span>
          <span><b>Generated:</b> {fmtDateTime(trace?.generated)}</span>
        </div>
      </header>
      {title ? <h2 className="op-doctitle">{title}</h2> : null}
      <div className="op-docbody">{children}</div>
      <footer className="op-docfoot">
        <span>{docTitle} · {text(trace?.designName, NOT_AVAILABLE)} · {text(trace?.designId, '')}</span>
        <span>{text(trace?.modelVersion, 'Model/version: not available')}</span>
      </footer>
    </section>
  );
}

export function KV({ rows }) {
  return (
    <dl className="op-kv">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
