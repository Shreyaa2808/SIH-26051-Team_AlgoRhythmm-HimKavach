"""
Phase A API surface. Additive: the existing POST /simulate (simple-box,
uniform construction) is untouched and keeps working exactly as before for
any caller still using it. These are the new endpoints the frontend should
move to for real per-wall designs:

  POST   /shelter/design      body: ShelterModel (any thickness fields may
                               be null) -> resolves auto thicknesses, runs
                               one simulation, returns the full model
                               (with thicknesses filled in) + sim result.
                               This is "the system designs it" endpoint.
  GET    /shelter/projects            -> list saved projects (id/name/site/dates)
  GET    /shelter/projects/{id}       -> full saved model + its last sim result
  DELETE /shelter/projects/{id}       -> remove a saved project
  (POST /shelter/design also saves/updates the project automatically, so
   there is no separate "save" endpoint to forget to call.)
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data.climate.loader import ClimateSeries
from data.climate.dynamic import get_custom_site_coords
from engine.materials.loader import MaterialsLibrary
from engine.optimizer.auto_thickness import solve_shelter_thicknesses
from engine.shelter_model import ShelterModel, to_geometry_spec
from engine.solver.thermal_solver import InternalGains, SiteSpec, simulate
from engine import storage

# reuse the exact same site-coordinate resolution as /simulate, including
# the custom-site registry from POST /location/resolve
from api.routes.simulate import SITE_COORDS, CLIMATE_DIR

router = APIRouter(prefix="/shelter", tags=["shelter"])
_materials_lib = MaterialsLibrary()


def _get_site_coords(site_id: str) -> dict:
    if site_id in SITE_COORDS:
        return SITE_COORDS[site_id]
    custom = get_custom_site_coords(site_id)
    if custom is not None:
        return custom
    raise HTTPException(status_code=400, detail=f"Unknown site_id '{site_id}'.")


def _load_climate_for_site(site_id: str) -> ClimateSeries:
    matches = sorted(CLIMATE_DIR.glob(f"{site_id}_*.json"))
    if not matches:
        raise HTTPException(status_code=404, detail=f"No cached climate data for site '{site_id}'.")
    return ClimateSeries.from_power_json(matches[0], site_id=site_id)


class DesignRequest(BaseModel):
    model: ShelterModel
    day_of_year: int = 15  # defaults to the mid-Jan design day, same as /simulate
    sensible_heat_w: float = 200.0
    co_generation_rate_lpm: float = 0.0
    indoor_temp_initial_c: float = -5.0


class DesignResponse(BaseModel):
    model: ShelterModel
    resolved_thicknesses: dict[str, float]
    achieved_min_indoor_c: float
    target_min_indoor_c: float
    met_target: bool
    estimated_material_cost_inr: float
    hours: list[float]
    indoor_temp_c: list[float]
    outdoor_temp_c: list[float]
    safety_passed: bool
    safety_reasons: list[str]


@router.post("/design", response_model=DesignResponse)
def auto_design(req: DesignRequest) -> DesignResponse:
    model = req.model
    coords = _get_site_coords(model.site_id)
    site = SiteSpec(lat_deg=coords["lat"], lon_deg=coords["lon"], elevation_m=coords["elevation_m"])
    climate = _load_climate_for_site(model.site_id)

    start_idx = (req.day_of_year - 1) * 24
    if start_idx + 24 > len(climate.temp_c):
        raise HTTPException(status_code=400, detail=f"day_of_year {req.day_of_year} out of range.")
    day = climate.hour_slice(start_idx, 24)

    gains = InternalGains(sensible_heat_w=req.sensible_heat_w, co_generation_rate_lpm=req.co_generation_rate_lpm)

    try:
        if model.needs_auto_thickness():
            solve = solve_shelter_thicknesses(
                model, _materials_lib, site, day.temp_c, day.ghi_wm2, day.wind_ms,
                day.lw_down_wm2, req.day_of_year, gains,
            )
            resolved = solve.resolved
        else:
            resolved = {}
            solve = None

        geometry = to_geometry_spec(model, _materials_lib, resolved_thicknesses=resolved)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    result = simulate(
        geometry=geometry, site=site, outdoor_temp_c=day.temp_c, ghi_wm2=day.ghi_wm2,
        wind_ms=day.wind_ms, lw_down_wm2=day.lw_down_wm2, day_of_year=req.day_of_year,
        internal_gains=gains, indoor_temp_initial_c=req.indoor_temp_initial_c,
    )

    preset = model.occupancy.preset()
    response = DesignResponse(
        model=model,
        resolved_thicknesses=resolved,
        achieved_min_indoor_c=solve.achieved_min_indoor_c if solve else result.min_indoor_temp_c,
        target_min_indoor_c=preset.min_indoor_target_c,
        met_target=solve.met_target if solve else result.min_indoor_temp_c >= preset.min_indoor_target_c,
        estimated_material_cost_inr=solve.estimated_cost_inr if solve else 0.0,
        hours=result.hours,
        indoor_temp_c=result.indoor_temp_c,
        outdoor_temp_c=result.outdoor_temp_c,
        safety_passed=result.safety.passed,
        safety_reasons=result.safety.reasons,
    )

    # auto-persist: every /shelter/design call saves/updates the project,
    # so "refresh and it's gone" stops being a thing.
    storage.save_project(model.model_dump(), response.model_dump())
    return response


@router.get("/projects")
def list_projects():
    return storage.list_projects()


@router.get("/projects/{project_id}")
def get_project(project_id: str):
    proj = storage.load_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail=f"No saved project '{project_id}'.")
    return proj


@router.delete("/projects/{project_id}")
def remove_project(project_id: str):
    ok = storage.delete_project(project_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No saved project '{project_id}'.")
    return {"deleted": project_id}
