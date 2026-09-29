import { useState } from 'react';
import DesignThermalPanel from './DesignThermalPanel';

export default function ViewSimulation({ result, design }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'contents' }}>
      <button type="button" className="export-btn" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide thermal simulation' : 'View thermal simulation'}
      </button>
      {open && (
        <div style={{ flexBasis: '100%', width: '100%' }}>
          <DesignThermalPanel
            siteId={result.site_id}
            dayOfYear={result.day_of_year}
            design={design}
            context={result.context}
          />
        </div>
      )}
    </div>
  );
}