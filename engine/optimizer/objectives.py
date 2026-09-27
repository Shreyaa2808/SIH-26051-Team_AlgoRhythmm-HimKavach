"""
Objective functions for the Phase 3 new-build optimizer.

README/plan says "multi-objective optimizer (comfort/cost/carbon/weight)".
We implement THREE of those four for real:

  - comfort  (maximize): coldest-hour indoor temperature, deg C.
             Chosen over mean indoor temp because the Phase 2 hero number
             was framed the same way ("raises the coldest indoor hour"),
             and because for a shelter the failure mode that matters is
             the worst hour, not the average.
  - cost     (minimize): material cost only (wall + insulation layers),
             INR, from data/materials/materials.json cost_per_m3_inr.
             Labor/transport/foundation cost are NOT included — this is a
             materials-only proxy, same caveat the materials library
             itself carries (cost_note fields).
  - weight   (minimize): envelope mass, kg, from layer volume * rho.
             Relevant for high-altitude logistics (airlift/mule-train
             transport of materials), which is why it's a listed objective
             at all.

UPDATE (post-Phase-3): carbon_kgco2e is now a REAL, sourced number —
materials.json gained a `carbon_kgco2e_per_kg` + `carbon_citation` field per
material (primarily ICE Database v3.0/v4.1, Hammond & Jones; a handful of
vernacular/composite materials are flagged order-of-magnitude estimates in
their own citation — see data/materials/materials.json's `_carbon_data_note`
for the full accounting). It is computed here from real mass * per-kg
factor, same pattern as the existing cost/weight calc.

It is still DELIBERATELY NOT part of `as_vector()` / the NSGA-II search
objective — only comfort/cost/weight drive the search and domination logic.
Reasons: (1) several of the sourced figures are honest estimates rather than
database-verified numbers (see materials.json), so treating carbon as an
authoritative 4th search axis this early would overstate how solid the data
is; (2) folding a new axis into NSGA-II's domination + the surrogate's
per-objective model is a materially bigger, riskier change than reporting a
real number computed from an already-existing front. carbon_kgco2e is
therefore a REPORTED metric — shown to the user, used to pick a curated
"Lowest Carbon" design (engine/optimizer/curated.py) — computed for every
design on the front but not steering the search itself. Revisit turning it
into a true search objective once the estimate-flagged materials have
better sources.
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary
from engine.solver.thermal_solver import (
    GeometrySpec,
    InternalGains,
    SiteSpec,
    make_simple_box_geometry,
    simulate,
)


@dataclass
class ObjectiveResult:
    comfort_coldest_hour_c: float
    cost_inr: float
    weight_kg: float
    carbon_kgco2e: float | None  # always None today — see module docstring
    safety_passed: bool
    safety_reasons: list[str]
    wall_u_value_wm2k: float

    def as_vector(self) -> tuple[float, float, float]:
        """(comfort, cost, weight) with sign flipped so ALL are minimize."""
        return (-self.comfort_coldest_hour_c, self.cost_inr, self.weight_kg)


def _material_cost_mass_carbon(materials_lib: MaterialsLibrary, geometry: GeometrySpec):
    cost = 0.0
    mass = 0.0
    carbon = 0.0
    carbon_known = True  # False if any layer's material has no carbon factor on file
    for surf in geometry.surfaces:
        for layer in surf.assembly.layers:
            volume_m3 = layer.thickness_m * surf.area_m2
            mat = layer.material
            layer_mass = volume_m3 * mat.rho
            if mat.cost_per_m3_inr is not None:
                cost += volume_m3 * mat.cost_per_m3_inr
            mass += layer_mass
            carbon_per_kg = getattr(mat, "carbon_kgco2e_per_kg", None)
            if carbon_per_kg is None:
                carbon_known = False
            else:
                carbon += layer_mass * carbon_per_kg
    return cost, mass, (carbon if carbon_known else None)


def evaluate_design(
    materials_lib: MaterialsLibrary,
    site: SiteSpec,
    fixed,  # search_space.FixedParams
    individual: dict,
    outdoor_temp_c: list[float],
    ghi_wm2: list[float],
    wind_ms: list[float],
    lw_down_wm2: list[float] | None,
    indoor_temp_initial_c: float = -5.0,
) -> ObjectiveResult:
    """
    Runs the REAL Phase 1 physics solver on one candidate design. This is
    the expensive path — the GA calls this directly in "physics mode", and
    the surrogate (engine/optimizer/surrogate.py) exists specifically to
    avoid calling this thousands of times per optimization run.
    """
    geometry = make_simple_box_geometry(
        materials_lib,
        wall_material_id=individual["wall_material_id"],
        insulation_material_id=individual["insulation_material_id"],
        wall_thickness_m=individual["wall_thickness_m"],
        insulation_thickness_m=individual["insulation_thickness_m"],
        floor_area_m2=fixed.floor_area_m2,
        ceiling_height_m=fixed.ceiling_height_m,
        leakage_area_cm2=individual["leakage_area_cm2"],
    )

    gains = InternalGains(sensible_heat_w=fixed.sensible_heat_w)

    result = simulate(
        geometry=geometry,
        site=site,
        outdoor_temp_c=outdoor_temp_c,
        ghi_wm2=ghi_wm2,
        wind_ms=wind_ms,
        lw_down_wm2=lw_down_wm2,
        day_of_year=fixed.day_of_year,
        internal_gains=gains,
        indoor_temp_initial_c=indoor_temp_initial_c,
    )

    cost, mass, carbon = _material_cost_mass_carbon(materials_lib, geometry)

    return ObjectiveResult(
        comfort_coldest_hour_c=result.min_indoor_temp_c,
        cost_inr=cost,
        weight_kg=mass,
        carbon_kgco2e=carbon,
        safety_passed=result.safety.passed,
        safety_reasons=result.safety.reasons,
        wall_u_value_wm2k=geometry.surfaces[0].assembly.u_value(),
    )
