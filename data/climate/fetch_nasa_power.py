"""
Pulls hourly climate data from NASA POWER for the three target sites and
caches it as JSON in data/climate/<site_id>_<year>.json.

Run locally (needs outbound internet — this sandbox doesn't have it):
    python3 data/climate/fetch_nasa_power.py

NASA POWER hourly point API:
    https://power.larc.nasa.gov/api/temporal/hourly/point

No API key required. Rate limit: be polite, ~1 request/site is enough for
a full year of hourly data (returned in one JSON blob).
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

BASE_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"

# Site coordinates. Elevation is passed so POWER can adjust pressure/temp
# where possible; T2M etc. are still 2m-agl model reanalysis, so expect
# a few degrees of bias at extreme high-altitude sites (Siachen) — flag
# this in Phase 2 validation, don't treat POWER output as ground truth there.
SITES = {
    "leh": {"lat": 34.1526, "lon": 77.5771, "elevation_m": 3500},
    "siachen": {"lat": 35.5000, "lon": 77.0000, "elevation_m": 5500},
    "dras": {"lat": 34.4333, "lon": 75.7667, "elevation_m": 3230},
}

# Parameters: T2M (air temp), RH2M (rel humidity), WS10M (wind speed),
# ALLSKY_SFC_SW_DWN (global horizontal irradiance), PS (surface pressure),
# ALLSKY_SFC_LW_DWN (downward longwave, needed for Swinbank sky-radiation
# cross-check in Phase 1).
PARAMETERS = "T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN,PS,ALLSKY_SFC_LW_DWN"

YEAR = 2025  # most recent full year with complete POWER coverage as of 2026
OUT_DIR = Path(__file__).parent


def fetch_site(site_id: str, lat: float, lon: float, elevation_m: float) -> dict:
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
    resp = requests.get(BASE_URL, params=params, timeout=120)
    resp.raise_for_status()
    return resp.json()


def main():
    for site_id, cfg in SITES.items():
        print(f"Fetching {site_id} ({cfg['lat']}, {cfg['lon']}, {cfg['elevation_m']}m)...")
        data = fetch_site(site_id, cfg["lat"], cfg["lon"], cfg["elevation_m"])
        out_path = OUT_DIR / f"{site_id}_{YEAR}.json"
        out_path.write_text(json.dumps(data, indent=2))
        print(f"  -> saved {out_path} ({out_path.stat().st_size / 1024:.0f} KB)")
        time.sleep(1)  # be polite between requests


if __name__ == "__main__":
    main()
