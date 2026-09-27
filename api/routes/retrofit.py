"""
POST /retrofit/rank — Phase 3b deliverable.

RETROFIT ONLY. This is intentionally a separate endpoint from /optimize,
not a mode toggle on it: retrofit takes a fixed, fully-specified existing
structure (no defaults — see engine/retrofit/baseline.RetrofitBaseline)
and ranks upgrades against it, rather than searching a design space.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.routes.simulate import SITE_COORDS, _load_climate_for_site, _get_site_coords
from engine.climate.design_days import resolve_design_day
from engine.materials.loader import MaterialsLibrary
from engine.retrofit.baseline import RetrofitBaseline
from engine.retrofit.ranker import rank_retrofit_interventions
from engine.solver.thermal_solver import SiteSpec

router = APIRouter()
_materials_lib = MaterialsLibrary()


class RetrofitRankRequest(BaseModel):
    site_id: str = Field(..., description="one of: leh, siachen, dras")
    day_of_year: int = Field(15, ge=1, le=365)
    design_day: str | None = None

    floor_area_m2: float = Field(..., description="required — no default, this is an existing structure")
    ceiling_height_m: float = Field(..., description="required — no default")
    leakage_area_cm2: float = Field(..., description="required — no default")

    wall_material_id: str = Field(..., description="required — what the existing wall is actually made of")
    wall_thickness_m: float = Field(..., description="required")

    insulation_material_id: str | None = Field(
        None, description="required if insulation_thickness_m > 0; null/omit if the wall has no existing insulation"
    )
    insulation_thickness_m: float = Field(0.0, description="0.0 if the wall currently has no insulation")

    sensible_heat_w: float = Field(..., description="required")
    co_generation_rate_lpm: float = 0.0
    indoor_temp_initial_c: float = -5.0


class BaselineOut(BaseModel):
    comfort_coldest_hour_c: float
    wall_u_value_wm2k: float
    safety_passed: bool
    safety_reasons: list[str]
    carbon_kgco2e: float | None


class RankedInterventionOut(BaseModel):
    kind: str
    label: str
    comfort_coldest_hour_c: float
    delta_comfort_c: float
    added_cost_inr: float | None
    cost_per_degree_inr: float | None
    wall_u_value_wm2k: float
    added_carbon_kgco2e: float | None


class RejectedInterventionOut(BaseModel):
    kind: str
    label: str
    reason: str


class UnavailableInterventionOut(BaseModel):
    kind: str
    label: str
    reason: str


class RetrofitRankResponse(BaseModel):
    site_id: str
    day_of_year: int
    baseline: BaselineOut
    ranked_interventions: list[RankedInterventionOut]
    rejected_interventions: list[RejectedInterventionOut]
    unavailable_interventions: list[UnavailableInterventionOut]


@router.post("/retrofit/rank", response_model=RetrofitRankResponse)
def retrofit_rank(req: RetrofitRankRequest) -> RetrofitRankResponse:
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

    try:
        baseline = RetrofitBaseline(
            site_id=req.site_id,
            day_of_year=day_of_year,
            floor_area_m2=req.floor_area_m2,
            ceiling_height_m=req.ceiling_height_m,
            leakage_area_cm2=req.leakage_area_cm2,
            wall_material_id=req.wall_material_id,
            wall_thickness_m=req.wall_thickness_m,
            insulation_material_id=req.insulation_material_id,
            insulation_thickness_m=req.insulation_thickness_m,
            sensible_heat_w=req.sensible_heat_w,
            co_generation_rate_lpm=req.co_generation_rate_lpm,
            indoor_temp_initial_c=req.indoor_temp_initial_c,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    start_idx = (day_of_year - 1) * 24
    if start_idx + 24 > len(climate.temp_c):
        raise HTTPException(
            status_code=400,
            detail=f"day_of_year {day_of_year} out of range for cached climate data.",
        )
    day = climate.hour_slice(start_idx, 24)

    try:
        baseline_out, ranked, rejected, unavailable = rank_retrofit_interventions(
            _materials_lib, site, baseline,
            outdoor_temp_c=day.temp_c, ghi_wm2=day.ghi_wm2,
            wind_ms=day.wind_ms, lw_down_wm2=day.lw_down_wm2,
        )
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RetrofitRankResponse(
        site_id=req.site_id,
        day_of_year=day_of_year,
        baseline=BaselineOut(
            comfort_coldest_hour_c=baseline_out.comfort_coldest_hour_c,
            wall_u_value_wm2k=baseline_out.wall_u_value_wm2k,
            safety_passed=baseline_out.safety_passed,
            safety_reasons=baseline_out.safety_reasons,
            carbon_kgco2e=baseline_out.carbon_kgco2e,
        ),
        ranked_interventions=[
            RankedInterventionOut(
                kind=r.intervention.kind,
                label=r.intervention.label,
                comfort_coldest_hour_c=r.comfort_coldest_hour_c,
                delta_comfort_c=r.delta_comfort_c,
                added_cost_inr=None if r.added_cost_inr != r.added_cost_inr else r.added_cost_inr,
                cost_per_degree_inr=r.cost_per_degree_inr,
                added_carbon_kgco2e=r.added_carbon_kgco2e,
                wall_u_value_wm2k=r.wall_u_value_wm2k,
            )
            for r in ranked
        ],
        rejected_interventions=[
            RejectedInterventionOut(kind=r.intervention.kind, label=r.intervention.label, reason=r.reason)
            for r in rejected
        ],
        unavailable_interventions=[
            UnavailableInterventionOut(kind=u.kind, label=u.label, reason=u.reason) for u in unavailable
        ],
    )
