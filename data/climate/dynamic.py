"""
Resolves ANY lat/lon (from the map / coordinate / place-search picker)
into a usable site_id backed by real, live-fetched data.

This is the generalization of the old fixed three-site registry
(leh/siachen/dras in fetch_nasa_power.py). Nothing about that file
changes -- Leh/Siachen/Dras remain fast "preset" shortcuts -- but now
ANY point the user clicks on the map, types as coordinates, or finds
via place search gets the exact same treatment: live elevation, live
reverse-geocoded label, and a real fetched-and-cached NASA POWER year
for that EXACT coordinate (not a nearest-preset approximation).

Call chain: api/routes/location.py -> resolve_location() -> returns a
site_id that api/routes/simulate.py, optimize.py and retrofit.py
already accept, completely unchanged, via _get_site_coords().

No hardcoded coordinates or elevations live here -- everything is
fetched live on first use of a given point, then cached to disk for
offline replay (same "local-first" pattern as the three presets).
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import requests

CLIMATE_DIR = Path(__file__).resolve().parent
REGISTRY_PATH = CLIMATE_DIR / "custom_sites.json"

NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

# NASA POWER's most recent COMPLETE year at time of writing. A brand-new
# custom point always gets this year fetched fresh -- never a hardcoded
# temperature, only a hardcoded "which year to ask POWER for" constant,
# mirroring fetch_nasa_power.py's own YEAR constant.
YEAR = 2025

PARAMETERS = "T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN,PS,ALLSKY_SFC_LW_DWN"

# Nominatim's usage policy requires an identifying User-Agent.
HEADERS = {"User-Agent": "HimKavach-SIH26051-prototype/1.0"}


@dataclass
class ResolvedLocation:
    site_id: str
    lat: float
    lon: float
    elevation_m: float
    label: str
    climate_cached: bool


def _site_id_for(lat: float, lon: float) -> str:
    """Deterministic id from the exact coordinate (rounded to ~110m),
    so re-selecting the same map point reuses the cached climate file
    instead of re-fetching."""
    tag = f"custom_{lat:.3f}_{lon:.3f}"
    return tag.replace("-", "m").replace(".", "p")


def _load_registry() -> dict:
    if REGISTRY_PATH.exists():
        return json.loads(REGISTRY_PATH.read_text())
    return {}


def _save_registry(reg: dict) -> None:
    REGISTRY_PATH.write_text(json.dumps(reg, indent=2))


def get_elevation(lat: float, lon: float) -> float:
    """Live elevation lookup for an exact point -- never guessed/hardcoded."""
    resp = requests.get(
        OPEN_ELEVATION_URL, params={"locations": f"{lat},{lon}"}, timeout=20
    )
    resp.raise_for_status()
    results = resp.json()["results"]
    return float(results[0]["elevation"])


def search_places(query: str, limit: int = 6) -> list[dict]:
    """Forward geocode a typed place name into candidate lat/lon points
    for the map's search box (autocomplete-style picker)."""
    resp = requests.get(
        NOMINATIM_SEARCH_URL,
        params={"q": query, "format": "json", "limit": limit},
        headers=HEADERS,
        timeout=20,
    )
    resp.raise_for_status()
    return [
        {"label": r["display_name"], "lat": float(r["lat"]), "lon": float(r["lon"])}
        for r in resp.json()
    ]


def reverse_geocode(lat: float, lon: float) -> str:
    """Best-effort human-readable label for a raw map-click/coordinate
    point. Falls back to the coordinate string -- never blocks the flow."""
    try:
        resp = requests.get(
            NOMINATIM_REVERSE_URL,
            params={"lat": lat, "lon": lon, "format": "json"},
            headers=HEADERS,
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json().get("display_name", f"{lat:.4f}, {lon:.4f}")
    except Exception:
        return f"{lat:.4f}, {lon:.4f}"


def fetch_and_cache_climate(site_id: str, lat: float, lon: float, elevation_m: float) -> Path:
    """Pulls a full year of live NASA POWER hourly data for this exact
    point and writes it in the SAME format/location the rest of the
    engine already reads (data/climate/<site_id>_<year>.json) -- so
    ClimateSeries.from_power_json and the glob in simulate.py's
    _load_climate_for_site() work completely unchanged."""
    out_path = CLIMATE_DIR / f"{site_id}_{YEAR}.json"
    if out_path.exists():
        return out_path  # already cached for this exact point -> offline replay

    params = {
        "parameters": PARAMETERS,
        "community": "RE",
        "longitude": lon,
        "latitude": lat,
        "start": f"{YEAR}0101",
        "end": f"{YEAR}1231",
        "format": "JSON",
        "site-elevation": elevation_m,
        "time-standard": "LST",
    }
    resp = requests.get(NASA_POWER_URL, params=params, timeout=120)
    resp.raise_for_status()
    out_path.write_text(json.dumps(resp.json(), indent=2))
    return out_path


def resolve_location(
    lat: float,
    lon: float,
    elevation_m: float | None = None,
    label: str | None = None,
) -> ResolvedLocation:
    """
    Single entry point used by POST /location/resolve.

    - elevation_m: uses what the map/user supplied if given, else fetched
      live for the exact point.
    - label: uses what was supplied (e.g. a chosen search-result name),
      else reverse-geocoded live.
    - climate: fetched + cached on first use of this exact point; every
      resulting site_id is then usable by /simulate, /optimize and
      /retrofit exactly like "leh"/"siachen"/"dras" always were.
    """
    site_id = _site_id_for(lat, lon)

    if elevation_m is None:
        elevation_m = get_elevation(lat, lon)
    if label is None:
        label = reverse_geocode(lat, lon)

    fetch_and_cache_climate(site_id, lat, lon, elevation_m)

    registry = _load_registry()
    registry[site_id] = {
        "lat": lat,
        "lon": lon,
        "elevation_m": elevation_m,
        "label": label,
        "resolved_at": time.time(),
    }
    _save_registry(registry)

    return ResolvedLocation(
        site_id=site_id,
        lat=lat,
        lon=lon,
        elevation_m=elevation_m,
        label=label,
        climate_cached=True,
    )


def get_custom_site_coords(site_id: str) -> dict | None:
    """Looked up by simulate.py/_get_site_coords() whenever site_id
    isn't one of the three fixed presets. Returns None (not an
    exception) for unknown ids so callers can produce one clean 400."""
    registry = _load_registry()
    entry = registry.get(site_id)
    if entry is None:
        return None
    return {
        "lat": entry["lat"],
        "lon": entry["lon"],
        "elevation_m": entry["elevation_m"],
    }


def get_custom_site_label(site_id: str) -> str | None:
    registry = _load_registry()
    entry = registry.get(site_id)
    return entry["label"] if entry else None
