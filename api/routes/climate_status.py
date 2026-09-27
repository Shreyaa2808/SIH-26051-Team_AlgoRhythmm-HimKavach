"""
GET /climate-status — Phase 5 (Person A half) deliverable.

Lets the frontend show "using cached climate data from <date>" (Phase 5's
offline-indicator requirement) and know which of the three sites actually
have data cached, without needing to trigger a real /simulate call (which
would 404 on an uncached site) just to find out.

This does NOT fetch anything live — data/climate/fetch_nasa_power.py
(run locally, needs internet) is still the only way to populate/refresh
the cache. This endpoint only reports on what's already on disk.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from data.climate.status import get_all_site_status

router = APIRouter()

SITE_IDS = ["leh", "siachen", "dras"]


class SiteClimateStatusOut(BaseModel):
    site_id: str
    cached: bool
    source_file: str | None
    year_start: str | None
    year_end: str | None
    record_count: int | None
    cached_at: str | None


class ClimateStatusResponse(BaseModel):
    sites: list[SiteClimateStatusOut]
    all_cached: bool
    note: str = (
        "cached_at is when the local file was last written (a proxy for "
        "'when this was fetched'), not the data's own coverage window — "
        "use year_start/year_end for that. cached_at can be recent even if "
        "year_start/year_end point at an older year; that's expected, not "
        "a bug, since fetch_nasa_power.py always pulls the same fixed YEAR "
        "constant unless it's edited."
    )


@router.get("/climate-status", response_model=ClimateStatusResponse)
def get_climate_status() -> ClimateStatusResponse:
    statuses = get_all_site_status(SITE_IDS)
    return ClimateStatusResponse(
        sites=[SiteClimateStatusOut(**vars(s)) for s in statuses],
        all_cached=all(s.cached for s in statuses),
    )
