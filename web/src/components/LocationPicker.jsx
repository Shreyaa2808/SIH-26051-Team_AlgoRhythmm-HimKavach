import { useState, useRef, useCallback } from 'react';
import { API, IS_DESKTOP, IS_OFFLINE } from '../api';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

// Leaflet's default marker icons reference image files that Vite doesn't
// bundle correctly out of the box -- point them at CDN URLs so the pin
// actually renders instead of showing a broken image.
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Ladakh region, used only to center the initial map view -- not a
// restriction on where the user can click. Any point on Earth resolves.
const DEFAULT_CENTER = [34.15, 77.6];
const DEFAULT_ZOOM = 8;

const PRESETS = [
  { id: 'leh', label: 'Leh', lat: 34.1526, lon: 77.5771, elevation_m: 3500 },
  { id: 'siachen', label: 'Siachen', lat: 35.5, lon: 77.0, elevation_m: 5500 },
  { id: 'dras', label: 'Dras', lat: 34.4333, lon: 75.7667, elevation_m: 3230 },
];

function ClickCatcher({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ position }) {
  const map = useMap();
  if (position) {
    map.flyTo(position, Math.max(map.getZoom(), 10), { duration: 0.6 });
  }
  return null;
}

export default function LocationPicker({ onResolved }) {
  const [marker, setMarker] = useState(null); // { lat, lon }
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [elevationPreview, setElevationPreview] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const pickPoint = useCallback(async (lat, lon, knownElevation = null) => {
    setMarker({ lat, lon });
    setLatInput(lat.toFixed(5));
    setLonInput(lon.toFixed(5));
    setElevationPreview(knownElevation);
    setError(null);

    if (IS_OFFLINE && knownElevation == null) return;

    try {
      const res = await fetch(`${API}/location/elevation?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
        setElevationPreview(data.elevation_m);
      }
    } catch {
      // Elevation preview is optional; confirmation performs the real check.
    }
  }, []);

  const handleMapClick = (lat, lon) => pickPoint(lat, lon);

  const handleCoordSubmit = (e) => {
    e.preventDefault();
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError('Enter valid numeric latitude and longitude.');
      return;
    }
    pickPoint(lat, lon);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pickPoint(pos.coords.latitude, pos.coords.longitude),
      (err) => setError('Could not get your location: ' + err.message)
    );
  };

  const handleSearchChange = (value) => {
    setQuery(value);
    setSearchResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (IS_OFFLINE) return;
    if (value.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API}/location/search?q=${encodeURIComponent(value)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  };

  const handlePickSearchResult = (r) => {
    setQuery(r.label);
    setSearchResults([]);
    pickPoint(r.lat, r.lon);
  };

  const handlePreset = (p) => pickPoint(p.lat, p.lon, p.elevation_m);

  const handleConfirm = async () => {
    if (!marker) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/location/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: marker.lat,
          lon: marker.lon,
          elevation_m: elevationPreview,
          area_m2: areaInput ? Number(areaInput) : null,
          label: query || null,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      onResolved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="location-picker">
      <h2>Select a Location</h2>
      <p className="form-note">
        {IS_DESKTOP
          ? 'Offline desktop mode: bundled climate data is available for Leh, Siachen and Dras. Previously cached custom sites can also be reopened.'
          : 'Click anywhere on the map, drop in coordinates, or search a place name. Elevation and climate are fetched live for the exact point and cached locally.'}
      </p>

      {!IS_OFFLINE && (
        <>
          <div className="location-search-row">
            <input
              type="text"
              placeholder="Search a place (e.g. Nubra Valley, Kargil...)"
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <button type="button" onClick={handleUseMyLocation} className="secondary-btn">
              📍 Use my location
            </button>
          </div>
          {searching && <p className="form-note">Searching…</p>}
          {searchResults.length > 0 && (
            <ul className="location-search-results">
              {searchResults.map((r, i) => (
                <li key={i} onClick={() => handlePickSearchResult(r)}>
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="preset-chip-row">
        {PRESETS.map((p) => (
          <button type="button" key={p.id} className="preset-chip" onClick={() => handlePreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      {!IS_OFFLINE && <div className="location-map-wrap">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '380px', width: '100%', borderRadius: '8px' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCatcher onPick={handleMapClick} />
          {marker && (
            <>
              <Marker position={[marker.lat, marker.lon]} icon={markerIcon} />
              <FlyTo position={[marker.lat, marker.lon]} />
            </>
          )}
        </MapContainer>
      </div>}

      <form className="config-form" onSubmit={handleCoordSubmit} style={{ marginTop: '1rem' }}>
        <div className="coord-input-row">
          <label>
            Latitude
            <input
              type="number"
              step="0.00001"
              placeholder="e.g. 34.1526"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="0.00001"
              placeholder="e.g. 77.5771"
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
            />
          </label>
          <label>
            Site area (m², optional)
            <input
              type="number"
              step="1"
              placeholder="e.g. 40"
              value={areaInput}
              onChange={(e) => setAreaInput(e.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="secondary-btn">Drop pin at these coordinates</button>
      </form>

      {marker && (
        <div className="stat-row" style={{ marginTop: '1rem' }}>
          <div className="stat-card">
            <div className="stat-label">Latitude</div>
            <div className="stat-value">{marker.lat.toFixed(4)}°</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Longitude</div>
            <div className="stat-value">{marker.lon.toFixed(4)}°</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Elevation</div>
            <div className="stat-value">
              {elevationPreview !== null ? `${elevationPreview.toFixed(0)} m` : '…'}
            </div>
            <div className="stat-note">{IS_OFFLINE ? "Bundled / cached data" : "Live lookup for this exact point"}</div>
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button
        type="button"
        className="primary-btn"
        disabled={!marker || resolving}
        onClick={handleConfirm}
        style={{ marginTop: '1rem' }}
      >
        {resolving ? 'Loading climate data…' : IS_OFFLINE ? 'Use offline site →' : 'Confirm location →'}
      </button>
    </div>
  );
}
