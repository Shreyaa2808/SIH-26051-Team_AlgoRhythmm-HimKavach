"""
Phase 3b — retrofit intervention ranker.

Reuses engine.solver.thermal_solver.simulate() directly (the Phase 1
solver), NOT engine.optimizer's NSGA-II/surrogate — there is nothing to
search here, only a fixed small set of candidate interventions (see
interventions.py) to evaluate and rank against one fixed baseline.

Ranking metric: cost per degree C gained at the coldest hour
(cost_inr / delta_comfort_c), ascending — cheapest comfort-per-degree
first. An intervention that fails the safety interlock after being applied
is EXCLUDED from the ranking (not shown with a warning badge, per the same
hard-gate rule as everywhere else in this codebase) but reported separately
so the person can see it was considered and why it was dropped — e.g. an
intervention that happens to worsen infiltration below the health floor.
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary
from engine.retrofit.baseline import RetrofitBaseline
from engine.retrofit.geometry import build_retrofit_geometry
from engine.retrofit.interventions import (
    Intervention,
    NotYetAvailableIntervention,
    generate_candidates,
)
from engine.solver.thermal_solver import InternalGains, SiteSpec, simulate


@dataclass
class BaselineResult:
    comfort_coldest_hour_c: float
    wall_u_value_wm2k: float
    safety_passed: bool
    safety_reasons: list[str]
    carbon_kgco2e: float | None  # total embodied carbon of the EXISTING envelope; None if unknown


@dataclass
class RankedIntervention:
    intervention: Intervention
    comfort_coldest_hour_c: float
    delta_comfort_c: float  # positive = improvement over baseline
    added_cost_inr: float
    cost_per_degree_inr: float | None  # None if delta_comfort_c <= 0 (no benefit to divide by)
    wall_u_value_wm2k: float
    safety_passed: bool
    added_carbon_kgco2e: float | None  # marginal carbon of the added material only; None if unknown


@dataclass
class RejectedIntervention:
    intervention: Intervention
    reason: str  # e.g. failed safety interlock after applying


def _material_cost(materials_lib: MaterialsLibrary, material_id: str | None, volume_m3: float) -> float | None:
    if material_id is None:
        return None
    mat = materials_lib.get(material_id)
    if mat.cost_per_m3_inr is None:
        return None
    return volume_m3 * mat.cost_per_m3_inr


def _material_carbon(materials_lib: MaterialsLibrary, material_id: str | None, volume_m3: float) -> float | None:
    """Marginal embodied carbon of the ADDED material only (mirrors
    _material_cost's same simplification: a wall-swap's removed old
    material isn't credited/subtracted, same as its cost isn't)."""
    if material_id is None:
        return None
    mat = materials_lib.get(material_id)
    carbon_per_kg = getattr(mat, "carbon_kgco2e_per_kg", None)
    if carbon_per_kg is None:
        return None
    return volume_m3 * mat.rho * carbon_per_kg


def _envelope_total_carbon(materials_lib: MaterialsLibrary, geometry) -> float | None:
    """Total embodied carbon of a FULL envelope (all surfaces/layers) — used
    for the baseline's own footprint, not a single intervention's marginal
    add. None if any layer's material has no sourced carbon figure."""
    total = 0.0
    for surf in geometry.surfaces:
        for layer in surf.assembly.layers:
            carbon_per_kg = getattr(layer.material, "carbon_kgco2e_per_kg", None)
            if carbon_per_kg is None:
                return None
            total += layer.thickness_m * surf.area_m2 * layer.material.rho * carbon_per_kg
    return total


def _run(
    materials_lib: MaterialsLibrary,
    site: SiteSpec,
    baseline: RetrofitBaseline,
    outdoor_temp_c, ghi_wm2, wind_ms, lw_down_wm2,
    wall_material_id, wall_thickness_m, insulation_material_id, insulation_thickness_m,
    leakage_area_cm2,
    night_gate=None,
):
    geometry = build_retrofit_geometry(
        materials_lib,
        wall_material_id=wall_material_id,
        wall_thickness_m=wall_thickness_m,
        insulation_material_id=insulation_material_id,
        insulation_thickness_m=insulation_thickness_m,
        floor_area_m2=baseline.floor_area_m2,
        ceiling_height_m=baseline.ceiling_height_m,
        leakage_area_cm2=leakage_area_cm2,
        night_gate=night_gate,
    )
    gains = InternalGains(
        sensible_heat_w=baseline.sensible_heat_w,
        co_generation_rate_lpm=baseline.co_generation_rate_lpm,
    )
    result = simulate(
        geometry=geometry,
        site=site,
        outdoor_temp_c=outdoor_temp_c,
        ghi_wm2=ghi_wm2,
        wind_ms=wind_ms,
        lw_down_wm2=lw_down_wm2,
        day_of_year=baseline.day_of_year,
        internal_gains=gains,
        indoor_temp_initial_c=baseline.indoor_temp_initial_c,
    )
    return result, geometry


def rank_retrofit_interventions(
    materials_lib: MaterialsLibrary,
    site: SiteSpec,
    baseline: RetrofitBaseline,
    outdoor_temp_c: list[float],
    ghi_wm2: list[float],
    wind_ms: list[float],
    lw_down_wm2: list[float] | None,
) -> tuple[BaselineResult, list[RankedIntervention], list[RejectedIntervention], list[NotYetAvailableIntervention]]:
    # --- baseline, exactly as it exists today ---
    base_result, base_geometry = _run(
        materials_lib, site, baseline, outdoor_temp_c, ghi_wm2, wind_ms, lw_down_wm2,
        wall_material_id=baseline.wall_material_id,
        wall_thickness_m=baseline.wall_thickness_m,
        insulation_material_id=baseline.insulation_material_id,
        insulation_thickness_m=baseline.insulation_thickness_m,
        leakage_area_cm2=baseline.leakage_area_cm2,
    )
    baseline_out = BaselineResult(
        comfort_coldest_hour_c=base_result.min_indoor_temp_c,
        wall_u_value_wm2k=base_geometry.surfaces[0].assembly.u_value(),
        safety_passed=base_result.safety.passed,
        safety_reasons=base_result.safety.reasons,
        carbon_kgco2e=_envelope_total_carbon(materials_lib, base_geometry),
    )

    candidates, unavailable = generate_candidates(baseline, materials_lib)

    ranked: list[RankedIntervention] = []
    rejected: list[RejectedIntervention] = []

    for cand in candidates:
        result, geometry = _run(
            materials_lib, site, baseline, outdoor_temp_c, ghi_wm2, wind_ms, lw_down_wm2,
            wall_material_id=cand.wall_material_id,
            wall_thickness_m=cand.wall_thickness_m,
            insulation_material_id=cand.insulation_material_id,
            insulation_thickness_m=cand.insulation_thickness_m,
            leakage_area_cm2=baseline.leakage_area_cm2,
            night_gate=cand.night_gate,
        )
        if not result.safety.passed:
            rejected.append(
                RejectedIntervention(
                    intervention=cand,
                    reason=f"Fails safety interlock after applying: {'; '.join(result.safety.reasons)}",
                )
            )
            continue

        cost = _material_cost(materials_lib, cand.added_material_id, cand.added_volume_m3)
        carbon = _material_carbon(materials_lib, cand.added_material_id, cand.added_volume_m3)
        delta = result.min_indoor_temp_c - baseline_out.comfort_coldest_hour_c
        cost_per_degree = None
        if cost is not None and delta > 0:
            cost_per_degree = cost / delta

        ranked.append(
            RankedIntervention(
                intervention=cand,
                comfort_coldest_hour_c=result.min_indoor_temp_c,
                delta_comfort_c=delta,
                added_cost_inr=cost if cost is not None else float("nan"),
                cost_per_degree_inr=cost_per_degree,
                wall_u_value_wm2k=geometry.surfaces[0].assembly.u_value(),
                safety_passed=True,
                added_carbon_kgco2e=carbon,
            )
        )

    # cheapest cost-per-degree first; interventions with no positive delta
    # (or unknown cost) sort to the end rather than crashing on None
    ranked.sort(key=lambda r: (r.cost_per_degree_inr is None, r.cost_per_degree_inr or float("inf")))

    return baseline_out, ranked, rejected, unavailable
