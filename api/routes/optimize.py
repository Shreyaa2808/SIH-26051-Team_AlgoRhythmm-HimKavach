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

from api.routes.simulate import SITE_COORDS, _load_climate_for_site, _get_site_coords
from engine.climate.design_days import resolve_design_day
from engine.materials.loader import MaterialsLibrary
from engine.optimizer.optimize import OptimizeConfig, run_new_build_optimization
from engine.optimizer.curated import curate_top_designs, paginate_remaining
from engine.optimizer.search_space import FixedParams
from engine.optimizer.instantiate import genome_to_shelter_model
from engine.optimizer.objectives import _material_cost_mass_carbon
from engine.optimizer.snow import roof_snow_load_kpa
from engine.shelter_model import OccupancyPurpose, to_geometry_spec
from engine.solver.thermal_solver import SiteSpec
from engine import storage
from api.routes.shelter import DesignRequest, DesignResponse, auto_design

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

    # Phase E: extra free variables + snow constraint
    optimize_roof_slope: bool = True
    optimize_ceiling_height: bool = False
    roof_slope_deg: float = Field(0.0, ge=0, le=60, description="used only when optimize_roof_slope is false")
    ground_snow_load_kpa: float = Field(0.0, ge=0, le=20, description="site ground snow load, user-supplied")
    max_roof_snow_load_kpa: float | None = Field(
        None, ge=0, le=20, description="structural limit; null = report snow load but never reject on it"
    )

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
    # Phase E
    roof_slope_deg: float = 0.0
    ceiling_height_m: float = 0.0
    roof_snow_load_kpa: float = 0.0


class OptimizeContext(BaseModel):
    """Everything /optimize/instantiate needs to rebuild a Pareto point as a
    full ShelterModel, echoed back so the frontend never has to guess it."""
    floor_area_m2: float
    ceiling_height_m: float
    sensible_heat_w: float
    roof_slope_deg: float
    ground_snow_load_kpa: float
    max_roof_snow_load_kpa: float | None
    optimize_roof_slope: bool
    optimize_ceiling_height: bool


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
    context: OptimizeContext | None = None
    note: str = (
        "carbon_kgco2e is a real, sourced figure (see materials.json's "
        "carbon_kgco2e_per_kg + carbon_citation per material) but is REPORTED "
        "only, not one of the objectives the optimizer actually searches on — "
        "those are comfort, cost, weight. carbon_kgco2e can still be null on "
        "an individual design if any of its materials has no carbon figure on "
        "file (a few vernacular/composite materials are flagged as estimates, "
        "see materials.json's _carbon_data_note) — treat null as unknown, not "
        "zero. curated_designs holds up to 6 labeled standout picks "
        "(Cheapest/Max Performance/Lightest/Lowest Carbon/Balanced — Lowest "
        "Carbon is omitted if no design in the front has a known carbon "
        "figure); explore_more pages through the rest of the front via "
        "explore_offset/explore_page_size. pareto_front is kept for backward "
        "compatibility and always holds the full front."
    )


@router.post("/optimize", response_model=OptimizeResponse)
def run_optimization(req: OptimizeRequest) -> OptimizeResponse:
    coords = _get_site_coords(req.site_id)
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
        roof_slope_deg=req.roof_slope_deg,
        ground_snow_load_kpa=req.ground_snow_load_kpa,
        max_roof_snow_load_kpa=req.max_roof_snow_load_kpa,
    )

    config = OptimizeConfig(
        population_size=req.population_size,
        generations=req.generations,
        use_surrogate=req.use_surrogate,
        seed=req.seed,
        free_roof_slope=req.optimize_roof_slope,
        free_ceiling_height=req.optimize_ceiling_height,
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
                "space bounds in engine/optimizer/search_space.py. If you set a "
                "max roof snow load, it may be too tight for this ground snow "
                "load — raise the limit or let the optimizer pick a steeper roof."
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
            roof_slope_deg=rd.objectives.roof_slope_deg,
            ceiling_height_m=rd.objectives.ceiling_height_m,
            roof_snow_load_kpa=rd.objectives.roof_snow_load_kpa,
        )

    # The GA's final front can hold several copies of the same genome (it
    # never de-duplicates). With individual points now clickable in the UI,
    # drop exact repeats so each dot on the chart is a distinct design.
    _seen: set[tuple] = set()
    _unique = []
    for rd in ranked:
        key = tuple(
            round(v, 6) if isinstance(v, float) else v for v in rd.genome.values()
        )
        if key in _seen:
            continue
        _seen.add(key)
        _unique.append(rd)
    ranked = _unique

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
        context=OptimizeContext(
            floor_area_m2=req.floor_area_m2,
            ceiling_height_m=req.ceiling_height_m,
            sensible_heat_w=req.sensible_heat_w,
            roof_slope_deg=req.roof_slope_deg,
            ground_snow_load_kpa=req.ground_snow_load_kpa,
            max_roof_snow_load_kpa=req.max_roof_snow_load_kpa,
            optimize_roof_slope=req.optimize_roof_slope,
            optimize_ceiling_height=req.optimize_ceiling_height,
        ),
    )


# ---------------------------------------------------------------------------
# Phase E: Pareto point -> full ShelterModel -> saved project
# ---------------------------------------------------------------------------


class DesignGenomeIn(BaseModel):
    wall_material_id: str
    insulation_material_id: str
    wall_thickness_m: float = Field(..., gt=0)
    insulation_thickness_m: float = Field(..., gt=0)
    leakage_area_cm2: float = Field(..., gt=0)
    roof_slope_deg: float | None = None
    ceiling_height_m: float | None = None
    # what the optimizer claimed, so we can verify instead of trusting it
    comfort_coldest_hour_c: float | None = None
    cost_inr: float | None = None


class InstantiateRequest(BaseModel):
    site_id: str
    day_of_year: int = Field(15, ge=1, le=365)
    design: DesignGenomeIn
    floor_area_m2: float = 16.0
    ceiling_height_m: float = 2.4
    roof_slope_deg: float = 0.0
    sensible_heat_w: float = 200.0
    ground_snow_load_kpa: float = Field(0.0, ge=0, le=20)
    occupancy_purpose: OccupancyPurpose = OccupancyPurpose.civilian_permanent
    headcount: int = Field(4, ge=1, le=200)
    name: str | None = None


class InstantiateResponse(BaseModel):
    project_id: str
    design: DesignResponse
    material_cost_inr: float
    roof_snow_load_kpa: float | None = None
    optimizer_comfort_c: float | None
    resimulated_comfort_c: float
    comfort_delta_c: float | None
    reproduces_optimizer: bool | None


@router.post("/optimize/instantiate", response_model=InstantiateResponse)
def instantiate_design(req: InstantiateRequest) -> InstantiateResponse:
    """Turns one optimizer result into a real, saved ShelterModel project and
    re-simulates it through the exact same path as POST /shelter/design, so
    the 3D twin and blueprint tabs can open it."""
    genome = req.design.model_dump(exclude_none=True)

    model = genome_to_shelter_model(
        genome,
        site_id=req.site_id,
        floor_area_m2=req.floor_area_m2,
        default_ceiling_height_m=req.ceiling_height_m,
        default_roof_slope_deg=req.roof_slope_deg,
        purpose=req.occupancy_purpose,
        headcount=req.headcount,
        name=req.name or "Optimizer pick",
    )

    try:
        response = auto_design(
            DesignRequest(
                model=model,
                day_of_year=req.day_of_year,
                sensible_heat_w=req.sensible_heat_w,
            )
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 - surface engine errors as 400s
        raise HTTPException(status_code=400, detail=str(e))

    # /shelter/design leaves the cost at 0 when nothing was auto-solved, so
    # compute it here from the same geometry with the optimizer's own
    # cost function (never from the client's claimed number).
    geometry = to_geometry_spec(model, _materials_lib)
    cost, _mass, _carbon = _material_cost_mass_carbon(_materials_lib, geometry)
    response.estimated_material_cost_inr = cost
    storage.save_project(model.model_dump(), response.model_dump())

    claimed = req.design.comfort_coldest_hour_c
    delta = None if claimed is None else response.achieved_min_indoor_c - claimed

    return InstantiateResponse(
        project_id=model.id,
        design=response,
        material_cost_inr=cost,
        roof_snow_load_kpa=roof_snow_load_kpa(
            model.roof.slope_deg, req.ground_snow_load_kpa
        ),
        optimizer_comfort_c=claimed,
        resimulated_comfort_c=response.achieved_min_indoor_c,
        comfort_delta_c=delta,
        reproduces_optimizer=None if delta is None else abs(delta) < 0.1,
    )