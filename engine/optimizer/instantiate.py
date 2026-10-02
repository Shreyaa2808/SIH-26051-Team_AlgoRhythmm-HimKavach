"""
Phase E — Pareto point -> full ShelterModel.

The optimizer searches a compact genome (one wall/insulation pair, two
thicknesses, leakage, optionally roof slope + ceiling height) and evaluates
it with make_simple_box_geometry(): square footprint, identical construction
on all four walls, roof AND floor, no openings.

This module builds the ShelterModel that describes EXACTLY that building, so
that pushing it back through to_geometry_spec() + simulate() (which is what
POST /shelter/design does) reproduces the optimizer's own numbers. That's
what lets the 3D twin (Phase C) and blueprint (Phase D) render a Pareto
point without any new physics: same schema, same solver.

Every thickness is written explicitly (never None), so the auto-thickness
solver is bypassed — the optimizer already chose them.
"""
from __future__ import annotations

import math

from engine.shelter_model import (
    CARDINALS,
    FloorSpec,
    Occupancy,
    OccupancyPurpose,
    RoofSpec,
    ShelterModel,
    WallSpec,
)


def genome_to_shelter_model(
    genome: dict,
    *,
    site_id: str,
    floor_area_m2: float,
    default_ceiling_height_m: float,
    default_roof_slope_deg: float = 0.0,
    orientation_deg: float = 0.0,
    purpose: OccupancyPurpose = OccupancyPurpose.civilian_permanent,
    headcount: int = 4,
    name: str = "Optimized shelter",
) -> ShelterModel:
    wall_id = genome["wall_material_id"]
    ins_id = genome["insulation_material_id"]
    wall_t = float(genome["wall_thickness_m"])
    ins_t = float(genome["insulation_thickness_m"])

    side = math.sqrt(floor_area_m2)
    height = float(genome.get("ceiling_height_m") or default_ceiling_height_m)
    slope = float(genome.get("roof_slope_deg", default_roof_slope_deg))

    return ShelterModel(
        name=name,
        site_id=site_id,
        length_m=side,
        width_m=side,
        ceiling_height_m=height,
        orientation_deg=orientation_deg,
        occupancy=Occupancy(purpose=purpose, headcount=headcount),
        walls=[
            WallSpec(
                cardinal=c,
                structural_material_id=wall_id,
                insulation_material_id=ins_id,
                structural_thickness_m=wall_t,
                insulation_thickness_m=ins_t,
            )
            for c in CARDINALS
        ],
        roof=RoofSpec(
            structural_material_id=wall_id,
            insulation_material_id=ins_id,
            structural_thickness_m=wall_t,
            insulation_thickness_m=ins_t,
            slope_deg=min(max(slope, 0.0), 60.0),
            orientation_deg=180.0,  # matches make_simple_box_geometry's roof azimuth
        ),
        floor=FloorSpec(
            structural_material_id=wall_id,
            insulation_material_id=ins_id,
            structural_thickness_m=wall_t,
            insulation_thickness_m=ins_t,
            ground_temp_c=2.0,
        ),
        leakage_area_cm2=float(genome["leakage_area_cm2"]),
    )
