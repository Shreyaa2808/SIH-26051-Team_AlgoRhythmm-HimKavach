"""
/location/* -- the Map & Coordinate Location Layer.

This replaces the fixed 3-site dropdown as the PRIMARY way to pick a
site: click anywhere on the live map, type coordinates, or search a
place name -- for ANY location, not just Leh/Siachen/Dras.

Nothing in simulate.py / optimize.py / retrofit.py needs to change:
POST /location/resolve returns a site_id that those endpoints already
accept, because it's registered into the same custom-site registry
that api/routes/simulate.py's _get_site_coords() checks.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from data.climate import dynamic as dyn

router = APIRouter(prefix="/location", tags=["location"])


class PlaceResult(BaseModel):
    label: str
    lat: float
    lon: float


@router.get("/search", response_model=list[PlaceResult])
def search_place(q: str = Query(..., min_length=2, description="Free-text place name, e.g. 'Dras' or 'Nubra Valley'")):
    """Live geocoding for the map's search box. No hardcoded place list."""
    try:
        return dyn.search_places(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Place search failed (needs internet): {e}")


class ElevationOut(BaseModel):
    lat: float
    lon: float
    elevation_m: float


@router.get("/elevation", response_model=ElevationOut)
def get_elevation(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """Live elevation for a clicked map point / typed coordinate pair.
    Used for instant on-map feedback before the user commits to
    resolving the full location (which also fetches climate)."""
    try:
        elevation_m = dyn.get_elevation(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Elevation lookup failed (needs internet): {e}")
    return ElevationOut(lat=lat, lon=lon, elevation_m=elevation_m)


class ResolveLocationRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    elevation_m: float | None = Field(None, description="Pass through if already known (e.g. from /location/elevation); otherwise fetched live")
    label: str | None = Field(None, description="Pass through a chosen search-result label; otherwise reverse-geocoded live")
    area_m2: float | None = Field(None, description="User-entered plot/site area -- passed straight through to the config form, not used by the engine yet")


class ResolveLocationResponse(BaseModel):
    site_id: str
    lat: float
    lon: float
    elevation_m: float
    label: str
    area_m2: float | None = None
    climate_cached: bool
    note: str = (
        "site_id can now be used directly as the site_id field in "
        "/simulate, /optimize and /retrofit -- exactly like 'leh', "
        "'siachen' or 'dras'."
    )


@router.post("/resolve", response_model=ResolveLocationResponse)
def resolve_location(req: ResolveLocationRequest):
    """
    The one call the map/coordinate/place picker makes once the user
    confirms a point. Resolves elevation + a human label (live, unless
    already supplied) and fetches + caches a real climate year for
    that EXACT coordinate. First call for a brand-new point needs
    internet; re-selecting the same point later works fully offline
    from the cached file.
    """
    try:
        resolved = dyn.resolve_location(
            lat=req.lat, lon=req.lon, elevation_m=req.elevation_m, label=req.label
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not resolve this location -- elevation, geocoding or "
                f"climate fetch failed ({e}). First use of a new point needs "
                "internet; try again once connected."
            ),
        )
    return ResolveLocationResponse(
        site_id=resolved.site_id,
        lat=resolved.lat,
        lon=resolved.lon,
        elevation_m=resolved.elevation_m,
        label=resolved.label,
        area_m2=req.area_m2,
        climate_cached=resolved.climate_cached,
    )
