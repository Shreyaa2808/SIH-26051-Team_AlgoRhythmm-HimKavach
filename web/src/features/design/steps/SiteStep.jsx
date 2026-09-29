import { useState } from 'react';
import LocationPicker from '../../../components/LocationPicker';
import DesignDayPicker from '../../../components/DesignDayPicker';
import ClimatePreview from './ClimatePreview';

export default function SiteStep({ design, update, errors, showErrors, onLocationChange, onDesignDayChange }) {
  const { site } = design;
  const [changing, setChanging] = useState(false);
  const hasSite = Boolean(site.siteId);

  const handleResolved = (data) => {
    update('site', {
      siteId: data.site_id,
      label: data.label,
      latitude: data.lat,
      longitude: data.lon,
      elevationM: data.elevation_m,
      climateCached: data.climate_cached,
    });
    setChanging(false);
    onLocationChange?.(data);
  };

  const handleDesignDay = (id) => {
    update('site', { designDay: id });
    onDesignDayChange?.(id);
  };

  return (
    <div className="dw-step">
      <header className="dw-step-head">
        <h2>Site</h2>
        <p>Where will the shelter stand? Location sets the climate data and the design conditions used for every result.</p>
      </header>

      {hasSite && !changing && (
        <div className="dw-card">
          <div className="dw-card-row">
            <div>
              <div className="dw-eyebrow">Selected site</div>
              <h3 className="dw-site-name">{site.label || site.siteId}</h3>
            </div>
            <button type="button" className="dw-btn dw-btn-ghost" onClick={() => setChanging(true)}>
              Change location
            </button>
          </div>
          <dl className="dw-facts">
            <div><dt>Latitude</dt><dd>{site.latitude != null ? Number(site.latitude).toFixed(4) : '—'}</dd></div>
            <div><dt>Longitude</dt><dd>{site.longitude != null ? Number(site.longitude).toFixed(4) : '—'}</dd></div>
            <div><dt>Elevation</dt><dd>{site.elevationM != null ? `${Number(site.elevationM).toFixed(0)} m` : '—'}</dd></div>
            <div>
              <dt>Climate data</dt>
              <dd>{site.climateCached === false ? 'Fetched just now' : site.climateCached ? 'Cached locally' : 'Loaded'}</dd>
            </div>
          </dl>
        </div>
      )}

      {(!hasSite || changing) && (
        <div className="dw-card">
          <LocationPicker onResolved={handleResolved} />
          {changing && (
            <button type="button" className="dw-btn dw-btn-ghost" onClick={() => setChanging(false)}>
              Keep current site
            </button>
          )}
        </div>
      )}

      {showErrors && errors.map((e) => <p key={e} className="dw-error">{e}</p>)}

      {hasSite && (
        <>
          <div className="dw-card">
            <h3>Design conditions</h3>
            <p className="dw-muted">The scenario every simulation and optimization will be judged against.</p>
            <DesignDayPicker value={site.designDay} onChange={handleDesignDay} />
          </div>

          <div className="dw-card">
            <h3>Climate preview</h3>
            <ClimatePreview siteId={site.siteId} designDay={site.designDay} />
          </div>
        </>
      )}
    </div>
  );
}
