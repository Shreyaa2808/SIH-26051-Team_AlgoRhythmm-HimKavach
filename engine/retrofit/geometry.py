"""
Builds a GeometrySpec for retrofit baselines and their candidate upgrades.

Deliberately NOT reusing engine.solver.thermal_solver.make_simple_box_geometry
as-is: that helper always creates a wall+insulation two-layer assembly,
which breaks (zero-resistance edge -> division by zero in the solver) when
insulation_thickness_m == 0 — and "this wall currently has no insulation"
is a completely normal, expected retrofit baseline. So this builder omits
the insulation layer entirely rather than passing a degenerate zero-
thickness one.
"""
from __future__ import annotations

import math

from engine.materials.loader import MaterialsLibrary
from engine.solver.rc_network import ConstructionAssembly, Layer
from engine.solver.night_gate import NightGateSchedule
from engine.solver.thermal_solver import GeometrySpec, SurfaceSpec


def build_retrofit_geometry(
    materials_lib: MaterialsLibrary,
    wall_material_id: str,
    wall_thickness_m: float,
    insulation_material_id: str | None,
    insulation_thickness_m: float,
    floor_area_m2: float,
    ceiling_height_m: float,
    leakage_area_cm2: float,
    night_gate: NightGateSchedule | None = None,
) -> GeometrySpec:
    wall_mat = materials_lib.get(wall_material_id)
    side = math.sqrt(floor_area_m2)

    def make_assembly(name: str) -> ConstructionAssembly:
        layers = [Layer(material=wall_mat, thickness_m=wall_thickness_m, n_nodes=3)]
        if insulation_thickness_m > 0:
            ins_mat = materials_lib.get(insulation_material_id)
            layers.append(Layer(material=ins_mat, thickness_m=insulation_thickness_m, n_nodes=2))
        a = ConstructionAssembly(name=name, layers=layers)
        a.build_nodes()
        return a

    surfaces = [
        SurfaceSpec("wall_N", side * ceiling_height_m, 90, 0, make_assembly("wall_N")),
        SurfaceSpec("wall_E", side * ceiling_height_m, 90, 90, make_assembly("wall_E")),
        SurfaceSpec("wall_S", side * ceiling_height_m, 90, 180, make_assembly("wall_S")),
        SurfaceSpec("wall_W", side * ceiling_height_m, 90, 270, make_assembly("wall_W")),
        SurfaceSpec("roof", floor_area_m2, 5, 180, make_assembly("roof")),
        SurfaceSpec(
            "floor", floor_area_m2, 0, 0, make_assembly("floor"),
            is_ground_coupled=True, ground_temp_c=2.0,
        ),
    ]
    return GeometrySpec(
        surfaces=surfaces,
        floor_area_m2=floor_area_m2,
        ceiling_height_m=ceiling_height_m,
        leakage_area_cm2=leakage_area_cm2,
        night_gate=night_gate,
    )
