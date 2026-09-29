
"""
POST /simulate — the Phase 1 deliverable endpoint.

Takes site + simple-box geometry + materials + a day-of-year, runs the
transient RC solver against that day's climate (loaded from the cached
NASA POWER JSON for the requested site), and returns the 24-hour indoor
temperature curve plus the safety-interlock result.

NOTE: uses make_simple_box_geometry for now (rectangular single-room,
same wall construction on all sides) since that's what Phase 1 needs to
prove the solver works. Phase 3/4 will accept arbitrary per-surface
geometry from the optimizer/drawing tools.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from data.climate.loader import ClimateSeries
from data.climate.dynamic import get_custom_site_coords
from engine.climate.design_days import resolve_design_day
from engine.materials.loader import MaterialsLibrary
from engine.solver.thermal_solver import (
    GeometrySpec,
    InternalGains,
    SiteSpec,
    make_simple_box_geometry,
    simulate,
)
from engine.solver.night_gate import NightGateSchedule
from engine.runtime_paths import CLIMATE_DIR

router = APIRouter()
_materials_lib = MaterialsLibrary()

SITE_COORDS = {
    "leh": {"lat": 34.1526, "lon": 77.5771, "elevation_m": 3500},
    "siachen": {"lat": 35.5000, "lon": 77.0000, "elevation_m": 5500},
    "dras": {"lat": 34.4333, "lon": 75.7667, "elevation_m": 3230},
}


def _get_site_coords(site_id: str) -> dict:
    """Resolves a site_id from EITHER the three fixed presets above OR
    the custom-site registry that POST /location/resolve writes to when
    the user picks a point off the live map / by coordinates / by place
    search. This is the only change needed to make every endpoint that
    already takes a site_id (this file, optimize.py, retrofit.py) work
    for an arbitrary location, with zero further edits to those files."""
    if site_id in SITE_COORDS:
        return SITE_COORDS[site_id]
    custom = get_custom_site_coords(site_id)
    if custom is not None:
        return custom
    raise HTTPException(
        status_code=400,
        detail=(
            f"Unknown site_id '{site_id}'. Pick a location on the map "
            f"(POST /location/resolve first) or use a preset: {list(SITE_COORDS)}"
        ),
    )


class SimulateRequest(BaseModel):
    site_id: str = Field(..., description="one of: leh, siachen, dras")
    day_of_year: int = Field(15, ge=1, le=365, description="1-365, e.g. 15 = mid-January")
    design_day: str | None = None
    wall_material_id: str = "local_stone_masonry"
    insulation_material_id: str = "expanded_polystyrene_eps"
    wall_thickness_m: float = 0.3
    insulation_thickness_m: float = 0.1
    floor_area_m2: float = 16.0
    ceiling_height_m: float = 2.4
    leakage_area_cm2: float = 200.0
    sensible_heat_w: float = 200.0
    co_generation_rate_lpm: float = 0.0
    indoor_temp_initial_c: float = -5.0
    # Phase 5: optional Night Gate toggle for new-build designs. Off by
    # default (matches every prior Phase 1/2/3 request shape exactly, so
    # existing callers are unaffected). See engine/solver/night_gate.py.
    night_gate_enabled: bool = False
    night_gate_close_hour: float = 19.0
    night_gate_open_hour: float = 7.0
    night_gate_closed_leakage_area_cm2: float = 60.0
    # New parameters section (map/config roadmap follow-up): building
    # orientation, roof slope, and an optional window. All default to the
    # exact old flat-roof/no-window/true-north-facing behaviour, so every
    # existing caller is unaffected.
    orientation_deg: float = Field(0.0, ge=0, lt=360, description="Compass bearing wall_N faces; rotates the whole building")
    roof_slope_deg: float = Field(0.0, ge=0, le=60, description="0 = flat roof; >0 = single-pitch roof at this tilt")
    window_wall: str | None = Field(None, description="'N'/'E'/'S'/'W' (pre-rotation compass label) to cut a window into, or null for none")
    window_area_m2: float = Field(0.0, ge=0.0, description="Glazing area cut from window_wall")
    window_material_id: str = Field("double_glazed_low_e_window", description="Any materials.json entry with category 'glazing'")


class SimulateResponse(BaseModel):
    site_id: str
    day_of_year: int
    hours: list[float]
    indoor_temp_c: list[float]
    outdoor_temp_c: list[float]
    min_indoor_temp_c: float
    max_indoor_temp_c: float
    mean_ach: float
    wall_u_value_wm2k: float
    safety_passed: bool
    safety_reasons: list[str]
    co_steady_state_ppm: float
    night_gate_hours_closed: float
    heat_flow_kwh: dict[str, float] = {}
    solar_absorbed_kwh: float = 0.0


def _load_climate_for_site(site_id: str) -> ClimateSeries:
    # look for any cached year file for this site (fetch_nasa_power.py names
    # them <site_id>_<year>.json)
    matches = sorted(CLIMATE_DIR.glob(f"{site_id}_*.json"))
    if not matches:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No cached climate data for site '{site_id}'. Run "
                f"data/climate/fetch_nasa_power.py first (needs internet)."
            ),
        )
    return ClimateSeries.from_power_json(matches[0], site_id=site_id)


@router.post("/simulate", response_model=SimulateResponse)
def run_simulation(req: SimulateRequest) -> SimulateResponse:
    coords = _get_site_coords(req.site_id)
    site = SiteSpec(lat_deg=coords["lat"], lon_deg=coords["lon"], elevation_m=coords["elevation_m"])

    climate = _load_climate_for_site(req.site_id)

    # Resolve a named design-day scenario to the actual day_of_year
    # using this site's real cached climate data.
    if req.design_day is not None:
        try:
            day_of_year = resolve_design_day(climate, req.design_day)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        day_of_year = req.day_of_year

    # extract the 24 hours matching the requested day-of-year from the
    # cached year-long series
    start_idx = (day_of_year - 1) * 24
    if start_idx + 24 > len(climate.temp_c):
        raise HTTPException(
            status_code=400,
            detail=f"day_of_year {day_of_year} out of range for cached climate data.",
        )
    day = climate.hour_slice(start_idx, 24)

    try:
        geometry: GeometrySpec = make_simple_box_geometry(
            _materials_lib,
            wall_material_id=req.wall_material_id,
            insulation_material_id=req.insulation_material_id,
            wall_thickness_m=req.wall_thickness_m,
            insulation_thickness_m=req.insulation_thickness_m,
            floor_area_m2=req.floor_area_m2,
            ceiling_height_m=req.ceiling_height_m,
            leakage_area_cm2=req.leakage_area_cm2,
            orientation_deg=req.orientation_deg,
            roof_slope_deg=req.roof_slope_deg,
            window_wall=req.window_wall,
            window_area_m2=req.window_area_m2,
            window_material_id=req.window_material_id,
            night_gate=(
                NightGateSchedule(
                    close_hour=req.night_gate_close_hour,
                    open_hour=req.night_gate_open_hour,
                    leakage_area_closed_cm2=req.night_gate_closed_leakage_area_cm2,
                )
                if req.night_gate_enabled
                else None
            ),
        )
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    gains = InternalGains(
        sensible_heat_w=req.sensible_heat_w,
        co_generation_rate_lpm=req.co_generation_rate_lpm,
    )

    result = simulate(
        geometry=geometry,
        site=site,
        outdoor_temp_c=day.temp_c,
        ghi_wm2=day.ghi_wm2,
        wind_ms=day.wind_ms,
        lw_down_wm2=day.lw_down_wm2,
        day_of_year=day_of_year,
        internal_gains=gains,
        indoor_temp_initial_c=req.indoor_temp_initial_c,
    )

    return SimulateResponse(
        site_id=req.site_id,
        day_of_year=day_of_year,
        hours=result.hours,
        indoor_temp_c=result.indoor_temp_c,
        outdoor_temp_c=result.outdoor_temp_c,
        min_indoor_temp_c=result.min_indoor_temp_c,
        max_indoor_temp_c=result.max_indoor_temp_c,
        mean_ach=result.mean_ach,
        wall_u_value_wm2k=geometry.surfaces[0].assembly.u_value(),
        safety_passed=result.safety.passed,
        safety_reasons=result.safety.reasons,
        co_steady_state_ppm=result.safety.co_steady_state_ppm,
        night_gate_hours_closed=result.night_gate_hours_closed,
        heat_flow_kwh=result.heat_flow_kwh,
        solar_absorbed_kwh=result.solar_absorbed_kwh,
    )
