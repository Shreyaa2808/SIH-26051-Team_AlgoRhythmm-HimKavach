import { fmt, fmtMm, NOT_SPECIFIED } from '../../common/format';

/** Component | Material | Thickness | Properties — every value from the design/materials DB. */
export default function MaterialSchedule({ rows, compact = false }) {
  if (!rows?.length) {
    return <p className="op-empty">Material schedule unavailable: no design geometry loaded.</p>;
  }
  return (
    <table className={`op-table ${compact ? 'op-table-compact' : ''}`}>
      <thead>
        <tr>
          <th>Component</th>
          <th>Layer</th>
          <th>Material</th>
          <th>Thickness</th>
          <th>k (W/m·K)</th>
          <th>ρ (kg/m³)</th>
          <th>cp (J/kg·K)</th>
          <th>U-value (W/m²K)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.component}-${r.layer}-${i}`}>
            <td>{r.component}</td>
            <td>{r.layer}</td>
            <td>
              {r.materialName
                ? <>{r.materialName}{!r.inDatabase ? <span className="op-note"> (not in materials DB)</span> : null}</>
                : <span className="op-muted">Material not specified</span>}
            </td>
            <td>
              {r.thicknessM != null ? fmtMm(r.thicknessM) : <span className="op-muted">{NOT_SPECIFIED}</span>}
              {r.thicknessNote ? <span className="op-note"> ({r.thicknessNote})</span> : null}
            </td>
            <td>{r.props?.k != null ? fmt(r.props.k, 3, '', NOT_SPECIFIED) : <span className="op-muted">{NOT_SPECIFIED}</span>}</td>
            <td>{r.props?.rho != null ? fmt(r.props.rho, 0, '', NOT_SPECIFIED) : <span className="op-muted">{NOT_SPECIFIED}</span>}</td>
            <td>{r.props?.cp != null ? fmt(r.props.cp, 0, '', NOT_SPECIFIED) : <span className="op-muted">{NOT_SPECIFIED}</span>}</td>
            <td>{r.uValue != null ? fmt(r.uValue, 3, '', NOT_SPECIFIED) : <span className="op-muted">{NOT_SPECIFIED}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OpeningSchedule({ openings }) {
  if (!openings?.length) {
    return <p className="op-empty">No openings (windows, doors, vents) are defined in this design.</p>;
  }
  return (
    <table className="op-table op-table-compact">
      <thead>
        <tr>
          <th>ID</th><th>Type</th><th>Wall</th><th>Width</th><th>Height</th>
          <th>Sill height</th><th>Offset from left edge (outside view)</th>
        </tr>
      </thead>
      <tbody>
        {openings.map((o) => (
          <tr key={o.id}>
            <td>{o.id}</td>
            <td style={{ textTransform: 'capitalize' }}>{o.type}</td>
            <td>{o.wall}</td>
            <td>{fmt(o.widthM, 2, 'm')}</td>
            <td>{fmt(o.heightM, 2, 'm')}</td>
            <td>{fmt(o.sillM, 2, 'm')}</td>
            <td>{fmt(o.offsetXM, 2, 'm')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
