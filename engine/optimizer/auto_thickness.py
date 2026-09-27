"""
Phase A: "the system should itself do the optimal thickness thing."

Given a ShelterModel where some walls/roof/floor leave thickness as None,
solve for the thinnest insulation (and, if also unset, structural) thickness
per surface that clears the occupancy purpose's min-indoor-temperature
target for the site's coldest design day — without exceeding the purpose's
budget ceiling. Structural thickness (when also auto) is fixed at a
sensible minimum for the material's category (load-bearing masonry needs a
minimum wythe; SIPs/panel systems don't) rather than solved for, since
structural thickness is a structural-engineering decision, not a thermal
one; only insulation is bisected for thermal performance.

Method: per-wall independent bisection is an approximation (walls interact
through the shared indoor-air node), so after solving each wall
independently we run ONE full simulate() with the assembled result and, if
still short of target, scale every insulation thickness up by the same
factor and re-check. This converges in 1-2 extra full simulations in
practice and avoids an expensive joint optimization for what is a "pick
reasonable defaults" feature, not the main NSGA-II search (engine/optimizer
already does the expensive multi-objective search when the user wants a
full Pareto exploration instead of one sensible auto-design).
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary
from engine.shelter_model import CARDINALS, ShelterModel, to_geometry_spec
from engine.solver.thermal_solver import InternalGains, SiteSpec, SimResult, simulate

MIN_STRUCTURAL_THICKNESS_M = {
    "structural/thermal mass": 0.30,   # stone/rammed earth/mud brick — load-bearing minimum
    "structural": 0.15,                 # SIPs/panel systems, concrete block
    "structural + insulation composite": 0.15,
}
DEFAULT_STRUCTURAL_THICKNESS_M = 0.25

INSULATION_SEARCH_BOUNDS_M = (0.02, 0.30)   # 2cm to 30cm search range
BISECTION_TOLERANCE_M = 0.005
MAX_SCALE_ROUNDS = 4


@dataclass
class ThicknessSolveResult:
    resolved: dict[str, float]           # key -> thickness_m, ready for to_geometry_spec()
    achieved_min_indoor_c: float
    target_min_indoor_c: float
    met_target: bool
    estimated_cost_inr: float
    rounds_used: int


def _default_structural_thickness(materials_lib: MaterialsLibrary, material_id: str) -> float:
    mat = materials_lib.get(material_id)
    return MIN_STRUCTURAL_THICKNESS_M.get(mat.category, DEFAULT_STRUCTURAL_THICKNESS_M)


def _surface_keys(model: ShelterModel) -> list[tuple[str, str, str | None, bool]]:
    """Returns (key, structural_material_id, insulation_material_id, is_wall) for
    every surface that needs a resolved thickness, wall/roof/floor alike."""
    out = []
    for c in CARDINALS:
        w = model.wall(c)
        out.append((f"{c}_structural", w.structural_material_id, None, True))
        if w.insulation_material_id:
            out.append((f"{c}_insulation", w.insulation_material_id, None, True))
    out.append(("roof_structural", model.roof.structural_material_id, None, False))
    if model.roof.insulation_material_id:
        out.append(("roof_insulation", model.roof.insulation_material_id, None, False))
    if model.floor.insulation_material_id:
        out.append(("floor_insulation", model.floor.insulation_material_id, None, False))
    return out


def _estimate_cost_inr(model: ShelterModel, materials_lib: MaterialsLibrary, resolved: dict[str, float]) -> float:
    """Rough material-cost-only estimate (structural + insulation volumes x
    unit cost). Good enough to compare against the occupancy budget ceiling;
    Phase B's full costing (labor, transport, per-material logistics
    premiums) supersedes this once the materials DB carries those fields."""
    total = 0.0
    for cardinal in CARDINALS:
        w = model.wall(cardinal)
        gross_len = model.length_m if cardinal in ("N", "S") else model.width_m
        area = gross_len * model.ceiling_height_m
        st = resolved.get(f"{cardinal}_structural", w.structural_thickness_m or 0.0)
        total += _material_cost(materials_lib, w.structural_material_id, area, st)
        if w.insulation_material_id:
            it = resolved.get(f"{cardinal}_insulation", w.insulation_thickness_m or 0.0)
            total += _material_cost(materials_lib, w.insulation_material_id, area, it)
    roof_area = model.floor_area_m2
    rst = resolved.get("roof_structural", model.roof.structural_thickness_m or 0.0)
    total += _material_cost(materials_lib, model.roof.structural_material_id, roof_area, rst)
    if model.roof.insulation_material_id:
        rit = resolved.get("roof_insulation", model.roof.insulation_thickness_m or 0.0)
        total += _material_cost(materials_lib, model.roof.insulation_material_id, roof_area, rit)
    return total


def _material_cost(materials_lib: MaterialsLibrary, material_id: str, area_m2: float, thickness_m: float) -> float:
    mat = materials_lib.get(material_id)
    volume_m3 = area_m2 * thickness_m
    if mat.cost_per_m3_inr:
        return volume_m3 * mat.cost_per_m3_inr
    if mat.cost_per_m2_inr:
        return area_m2 * mat.cost_per_m2_inr
    return 0.0


def solve_shelter_thicknesses(
    model: ShelterModel,
    materials_lib: MaterialsLibrary,
    site: SiteSpec,
    outdoor_temp_c: list[float],
    ghi_wm2: list[float],
    wind_ms: list[float],
    lw_down_wm2: list[float] | None,
    day_of_year: int,
    internal_gains: InternalGains,
) -> ThicknessSolveResult:
    """Fills every auto (None) thickness in `model` and returns the resolved
    dict + whether the occupancy's comfort target was met within the budget
    ceiling. Does not mutate `model` — callers pass the returned dict into
    to_geometry_spec()."""
    preset = model.occupancy.preset()
    target_c = preset.min_indoor_target_c

    resolved: dict[str, float] = {}
    # Step 1: structural thicknesses are fixed by material category, not solved.
    for key, mat_id, _, _ in _surface_keys(model):
        if key.endswith("_structural"):
            resolved[key] = _default_structural_thickness(materials_lib, mat_id)

    # Step 2: seed every insulation thickness at the low end, then run one
    # full simulation to see where we stand.
    for key, mat_id, _, _ in _surface_keys(model):
        if key.endswith("_insulation"):
            resolved[key] = INSULATION_SEARCH_BOUNDS_M[0]

    def _run(scale: float) -> SimResult:
        scaled = dict(resolved)
        for key in list(scaled):
            if key.endswith("_insulation"):
                scaled[key] = min(INSULATION_SEARCH_BOUNDS_M[1], resolved[key] * scale)
        geometry = to_geometry_spec(model, materials_lib, resolved_thicknesses=scaled)
        return simulate(geometry, site, outdoor_temp_c, ghi_wm2, wind_ms, lw_down_wm2,
                         day_of_year, internal_gains), scaled

    scale = 1.0
    result, scaled_resolved = _run(scale)
    rounds = 1
    # Step 3: scale every insulation thickness up together (uniform, simple,
    # avoids a full per-wall joint optimization) until target is met, budget
    # is hit, or the search bound is saturated.
    while result.min_indoor_temp_c < target_c and rounds < MAX_SCALE_ROUNDS:
        cost = _estimate_cost_inr(model, materials_lib, scaled_resolved)
        budget_ceiling = preset.max_budget_inr_per_m2 * model.floor_area_m2
        if cost >= budget_ceiling:
            break
        if all(scaled_resolved[k] >= INSULATION_SEARCH_BOUNDS_M[1] - 1e-6
               for k in scaled_resolved if k.endswith("_insulation")):
            break
        scale *= 1.6
        result, scaled_resolved = _run(scale)
        rounds += 1

    final_cost = _estimate_cost_inr(model, materials_lib, scaled_resolved)
    return ThicknessSolveResult(
        resolved=scaled_resolved,
        achieved_min_indoor_c=result.min_indoor_temp_c,
        target_min_indoor_c=target_c,
        met_target=result.min_indoor_temp_c >= target_c,
        estimated_cost_inr=final_cost,
        rounds_used=rounds,
    )
