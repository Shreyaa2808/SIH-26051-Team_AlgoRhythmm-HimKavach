"""
Phase 5 (Person A half) — offline/cache status metadata.

Doesn't load or normalize a full year of hourly data (that's loader.py's
job) — just enough to answer "do we have this site cached, and how fresh
is it?" cheaply, for the frontend's Phase 5 "using cached climate data
from [date]" indicator (README/roadmap, Phase 5 section) and for a
connectivity-status check that doesn't require an actual /simulate call.

`cached_at` is the JSON file's own mtime on disk — a proxy for "when this
was fetched", since fetch_nasa_power.py doesn't currently stamp the file
with its own fetch time (see that script's docstring). This is good enough
to show "cached as of <date>" but is NOT the same as the data's own
coverage window (`year_start`/`year_end`), which comes from the NASA POWER
response's own `header.start`/`header.end` fields instead. Don't conflate
the two in the UI: a file fetched yesterday still correctly reports
2025-01-01..2025-12-31 as its coverage window.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

CLIMATE_DIR = Path(__file__).resolve().parent


@dataclass
class SiteClimateStatus:
    site_id: str
    cached: bool
    source_file: str | None
    year_start: str | None  # "YYYYMMDD", as NASA POWER reports it
    year_end: str | None
    record_count: int | None
    cached_at: str | None  # ISO 8601 UTC, from file mtime


def get_site_status(site_id: str) -> SiteClimateStatus:
    matches = sorted(CLIMATE_DIR.glob(f"{site_id}_*.json"))
    if not matches:
        return SiteClimateStatus(
            site_id=site_id, cached=False, source_file=None,
            year_start=None, year_end=None, record_count=None, cached_at=None,
        )

    path = matches[0]
    raw = json.loads(path.read_text())
    header = raw.get("header", {})
    # NOTE: raw["times"] (if present) is NASA POWER's own metadata dict
    # describing time FORMAT (keys like "data"/"process"), not a list of
    # timestamps -- do not use it as a record count. The real per-hour
    # timestamps live as the keys of properties.parameter.T2M (same place
    # loader.py's ClimateSeries.from_power_json reads them from).
    params = raw.get("properties", {}).get("parameter", {})
    record_count = len(params.get("T2M", {})) or None

    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)

    return SiteClimateStatus(
        site_id=site_id,
        cached=True,
        source_file=path.name,
        year_start=header.get("start"),
        year_end=header.get("end"),
        record_count=record_count,
        cached_at=mtime.isoformat(),
    )


def get_all_site_status(site_ids: list[str]) -> list[SiteClimateStatus]:
    return [get_site_status(s) for s in site_ids]
