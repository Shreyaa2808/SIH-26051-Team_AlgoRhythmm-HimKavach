"""
Run this AFTER data/climate/fetch_nasa_power.py has produced
data/climate/<site_id>_<year>.json for leh/siachen/dras, on a machine with
real internet access (this sandbox's egress allowlist blocks
power.larc.nasa.gov — see x-deny-reason: host_not_allowed).

Checks, per site:
  - file exists and matches the naming convention _load_climate_for_site()
    in api/routes/simulate.py and api/routes/optimize.py / retrofit.py
    look for (<site_id>_*.json)
  - parses with ClimateSeries.from_power_json() (same loader the API uses)
  - full year of hourly records (8760 or 8784 on a leap year) with no gaps
  - every field NASA POWER sometimes fills with its "no data" sentinel
    (-999) is caught, not silently passed through as a real temperature
  - each field's values fall in a physically plausible range for these
    high-altitude Himalayan sites (loose bounds — this is a sanity check,
    not a scientific validation; Phase 2's actual validation is against
    the HIAL/FHNW reference in data/climate/leh_hial_reference.json)

Exits 0 and prints a per-site summary if everything looks sane; exits 1
and prints exactly what's wrong (missing file, gap, out-of-range value,
sentinel value) if not. Meant to gate "should I trust this cache enough to
run /simulate against it" before wiring up a demo, not as a CI test.

Usage:
    python3 data/climate/validate_climate_data.py
    python3 data/climate/validate_climate_data.py leh          # one site
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, for `from data.climate...` imports

from data.climate.loader import ClimateSeries

CLIMATE_DIR = Path(__file__).parent

SITES = {
    "leh": {"elevation_m": 3500},
    "siachen": {"elevation_m": 5500},
    "dras": {"elevation_m": 3230},
}

POWER_NO_DATA_SENTINEL = -999.0

# Loose physical plausibility bounds for these sites/fields. Wide on
# purpose (Siachen can plausibly hit -40C; GHI can spike over 1200 W/m2 at
# high altitude with fresh snow albedo boosting diffuse component) — the
# point is to catch UNIT ERRORS and SENTINEL LEAKAGE, not to second-guess
# every real extreme reading.
BOUNDS = {
    "temp_c": (-50.0, 35.0),
    "rh_pct": (0.0, 100.0),
    "wind_ms": (0.0, 40.0),
    "ghi_wm2": (0.0, 1300.0),
    "pressure_kpa": (45.0, 90.0),  # ~45 kPa at Siachen's 5500m, ~90 kPa sea-level-ish floor
    "lw_down_wm2": (50.0, 450.0),
}

FIELD_NAMES = list(BOUNDS.keys())


def _find_cache_file(site_id: str) -> Path | None:
    matches = sorted(CLIMATE_DIR.glob(f"{site_id}_*.json"))
    return matches[0] if matches else None


def validate_site(site_id: str) -> list[str]:
    """Returns a list of problem strings; empty list = all clear."""
    problems: list[str] = []

    path = _find_cache_file(site_id)
    if path is None:
        return [
            f"no cached file found (looked for {CLIMATE_DIR}/{site_id}_*.json) — "
            f"run fetch_nasa_power.py on a machine with internet access first"
        ]

    try:
        cs = ClimateSeries.from_power_json(path, site_id=site_id)
    except Exception as e:
        return [f"{path.name}: failed to parse with ClimateSeries.from_power_json(): {e!r}"]

    n = len(cs.timestamps)
    if n not in (8760, 8784):
        problems.append(
            f"{path.name}: expected a full year of hourly records (8760, or "
            f"8784 on a leap year), got {n}. Every downstream day_of_year "
            f"lookup in api/routes/*.py assumes a complete year — a partial "
            f"cache will silently serve the wrong day or index out of range."
        )

    series_by_field = {
        "temp_c": cs.temp_c,
        "rh_pct": cs.rh_pct,
        "wind_ms": cs.wind_ms,
        "ghi_wm2": cs.ghi_wm2,
        "pressure_kpa": cs.pressure_kpa,
        "lw_down_wm2": cs.lw_down_wm2,
    }

    for field, values in series_by_field.items():
        lo, hi = BOUNDS[field]
        sentinel_hits = sum(1 for v in values if v is None or abs(v - POWER_NO_DATA_SENTINEL) < 1e-6)
        if sentinel_hits:
            problems.append(
                f"{path.name}: {field} has {sentinel_hits} POWER no-data sentinel "
                f"(-999) or null value(s) — these are NOT real readings and will "
                f"corrupt the physics if passed to simulate() as-is."
            )
        out_of_range = [(i, v) for i, v in enumerate(values) if v is not None and not (lo <= v <= hi)]
        # don't flag sentinel values twice under "out of range" too
        out_of_range = [(i, v) for i, v in out_of_range if abs(v - POWER_NO_DATA_SENTINEL) > 1e-6]
        if out_of_range:
            worst = max(out_of_range, key=lambda iv: abs(iv[1] - (lo if abs(iv[1]-lo) < abs(iv[1]-hi) else hi)))
            problems.append(
                f"{path.name}: {field} has {len(out_of_range)} value(s) outside "
                f"the plausible range [{lo}, {hi}] for this site — e.g. index "
                f"{worst[0]} ({cs.timestamps[worst[0]]}) = {worst[1]}. Could be a "
                f"real extreme, a unit mismatch, or a parsing bug — check it by hand."
            )

    return problems


def summarize_site(site_id: str) -> None:
    path = _find_cache_file(site_id)
    if path is None:
        return
    cs = ClimateSeries.from_power_json(path, site_id=site_id)
    print(
        f"  {site_id:10s} {path.name:24s} n={len(cs.timestamps):5d}  "
        f"T=[{min(cs.temp_c):6.1f}, {max(cs.temp_c):5.1f}]C  "
        f"GHI_max={max(cs.ghi_wm2):6.0f}W/m2  "
        f"wind_max={max(cs.wind_ms):4.1f}m/s"
    )


def main() -> int:
    requested = sys.argv[1:] if len(sys.argv) > 1 else list(SITES.keys())
    unknown = [s for s in requested if s not in SITES]
    if unknown:
        print(f"Unknown site id(s): {unknown}. Valid: {list(SITES)}")
        return 1

    all_problems: dict[str, list[str]] = {}
    for site_id in requested:
        all_problems[site_id] = validate_site(site_id)

    if any(all_problems.values()):
        print("CLIMATE DATA VALIDATION: FAILED\n")
        for site_id, problems in all_problems.items():
            if problems:
                print(f"[{site_id}]")
                for p in problems:
                    print(f"  - {p}")
                print()
        print("Fix the above before trusting /simulate, /optimize, or /retrofit/rank results against real data.")
        return 1

    print("CLIMATE DATA VALIDATION: PASSED\n")
    for site_id in requested:
        summarize_site(site_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())