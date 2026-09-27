"""
POST /optimize — Phase 3 deliverable.

NEW-BUILD ONLY. Retrofit is Phase 3b (engine/retrofit, not this file) and
gets its own endpoint once it's built — it ranks single-variable upgrades
against a fixed required baseline, it does not search this design space.

Mirrors /simulate's climate-loading pattern (Phase 1) since this reuses the
same solver underneath.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.routes.simulate import SITE_COORDS, _load_climate_for_site
from engine.climate.design_days import resolve_design_day
from engine.materials.loader import MaterialsLibrary
from engine.optimizer.optimize import OptimizeConfig, run_new_build_optimization
from engine.optimizer.curated import curate_top_designs, paginate_remaining
from engine.optimizer.search_space import FixedParams
from engine.solver.thermal_solver import SiteSpec

router = APIRouter()
_materials_lib = MaterialsLibrary()


class OptimizeRequest(BaseModel):
    site_id: str = Field(..., description="one of: leh, siachen, dras")
    day_of_year: int = Field(15, ge=1, le=365)
    design_day: str | None = None
    floor_area_m2: float = 16.0
    ceiling_height_m: float = 2.4
    sensible_heat_w: float = 200.0
    population_size: int = Field(40, ge=8, le=200)
    generations: int = Field(15, ge=1, le=100)
    use_surrogate: bool = True
    seed: int | None = 42

    # Phase 3 "explore more" pagination
    explore_offset: int = Field(0, ge=0)
    explore_page_size: int = Field(6, ge=1, le=20)


class RankedDesignOut(BaseModel):
    wall_material_id: str
    insulation_material_id: str
    wall_thickness_m: float
    insulation_thickness_m: float
    leakage_area_cm2: float
    comfort_coldest_hour_c: float
    cost_inr: float
    weight_kg: float
    carbon_kgco2e: float | None
    wall_u_value_wm2k: float
    safety_passed: bool


class CuratedDesignOut(BaseModel):
    label: str
    why: str
    design: RankedDesignOut


class OptimizeResponse(BaseModel):
    site_id: str
    day_of_year: int
    curated_designs: list[CuratedDesignOut]
    explore_more: list[RankedDesignOut]
    explore_has_more: bool
    explore_next_offset: int
    pareto_front: list[RankedDesignOut]
    note: str = (
        "carbon_kgco2e is always null: no embodied-carbon data exists in "
        "materials.json yet. Objectives actually optimized: comfort, cost, weight. "
        "curated_designs holds up to 5 labeled standout picks (Cheapest/Max "
        "Performance/Lightest/Balanced); explore_more pages through the rest of "
        "the front via explore_offset/explore_page_size. pareto_front is kept "
        "for backward compatibility and always holds the full front."
    )


@router.post("/optimize", response_model=OptimizeResponse)
def run_optimization(req: OptimizeRequest) -> OptimizeResponse:
    if req.site_id not in SITE_COORDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown site_id '{req.site_id}'. Valid: {list(SITE_COORDS)}",
        )

    coords = SITE_COORDS[req.site_id]
    site = SiteSpec(
        lat_deg=coords["lat"],
        lon_deg=coords["lon"],
        elevation_m=coords["elevation_m"],
    )
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

    start_idx = (day_of_year - 1) * 24

    if start_idx + 24 > len(climate.temp_c):
        raise HTTPException(
            status_code=400,
            detail=f"day_of_year {day_of_year} out of range for cached climate data.",
        )

    day = climate.hour_slice(start_idx, 24)

    fixed = FixedParams(
        floor_area_m2=req.floor_area_m2,
        ceiling_height_m=req.ceiling_height_m,
        site_id=req.site_id,
        day_of_year=day_of_year,
        sensible_heat_w=req.sensible_heat_w,
    )

    config = OptimizeConfig(
        population_size=req.population_size,
        generations=req.generations,
        use_surrogate=req.use_surrogate,
        seed=req.seed,
    )

    ranked = run_new_build_optimization(
        _materials_lib,
        site,
        fixed,
        outdoor_temp_c=day.temp_c,
        ghi_wm2=day.ghi_wm2,
        wind_ms=day.wind_ms,
        lw_down_wm2=day.lw_down_wm2,
        config=config,
    )

    if not ranked:
        raise HTTPException(
            status_code=422,
            detail=(
                "No design in the final population passed the safety interlock. "
                "Try a larger population/more generations, or widen the search "
                "space bounds in engine/optimizer/search_space.py."
            ),
        )

    def _to_out(rd) -> RankedDesignOut:
        return RankedDesignOut(
            wall_material_id=rd.genome["wall_material_id"],
            insulation_material_id=rd.genome["insulation_material_id"],
            wall_thickness_m=rd.genome["wall_thickness_m"],
            insulation_thickness_m=rd.genome["insulation_thickness_m"],
            leakage_area_cm2=rd.genome["leakage_area_cm2"],
            comfort_coldest_hour_c=rd.objectives.comfort_coldest_hour_c,
            cost_inr=rd.objectives.cost_inr,
            weight_kg=rd.objectives.weight_kg,
            carbon_kgco2e=rd.objectives.carbon_kgco2e,
            wall_u_value_wm2k=rd.objectives.wall_u_value_wm2k,
            safety_passed=rd.objectives.safety_passed,
        )

    curated = curate_top_designs(ranked)

    explore_page, has_more = paginate_remaining(
        ranked,
        curated,
        offset=req.explore_offset,
        page_size=req.explore_page_size,
    )

    out = [_to_out(rd) for rd in ranked]

    return OptimizeResponse(
        site_id=req.site_id,
        day_of_year=day_of_year,
        curated_designs=[
            CuratedDesignOut(
                label=c.label,
                why=c.why,
                design=_to_out(c.design),
            )
            for c in curated
        ],
        explore_more=[_to_out(rd) for rd in explore_page],
        explore_has_more=has_more,
        explore_next_offset=req.explore_offset + req.explore_page_size,
        pareto_front=out,
    )