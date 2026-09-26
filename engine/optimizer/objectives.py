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

We are DELIBERATELY NOT implementing "carbon" as a fourth objective.
data/materials/materials.json has no embodied-carbon field for any of the
16 materials, and no citation for one is on file. Inventing plausible-
looking kgCO2e/m3 numbers here would be exactly the kind of fabricated-
citation mistake Phase 2's validation work was careful to avoid. Until
someone sources real embodied-carbon data per material (with citation) and
adds it to materials.json, `carbon` stays out of the objective vector.
`ObjectiveResult.carbon_kgco2e` exists as a field so the optimizer/API
shape doesn't have to change later, but it is always None today and
callers must not treat it as a real number.
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


def _material_cost_and_mass(materials_lib: MaterialsLibrary, geometry: GeometrySpec):
    cost = 0.0
    mass = 0.0
    for surf in geometry.surfaces:
        for layer in surf.assembly.layers:
            volume_m3 = layer.thickness_m * surf.area_m2
            mat = layer.material
            if mat.cost_per_m3_inr is not None:
                cost += volume_m3 * mat.cost_per_m3_inr
            mass += volume_m3 * mat.rho
    return cost, mass


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

    cost, mass = _material_cost_and_mass(materials_lib, geometry)

    return ObjectiveResult(
        comfort_coldest_hour_c=result.min_indoor_temp_c,
        cost_inr=cost,
        weight_kg=mass,
        carbon_kgco2e=None,
        safety_passed=result.safety.passed,
        safety_reasons=result.safety.reasons,
        wall_u_value_wm2k=geometry.surfaces[0].assembly.u_value(),
    )
