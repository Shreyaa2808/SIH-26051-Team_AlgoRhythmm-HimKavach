"""
Phase 3b — the retrofit baseline.

This is deliberately NOT a variant of api/routes/simulate.py's
SimulateRequest (which has sensible new-build defaults for every field).
A retrofit baseline describes a structure that ALREADY EXISTS. There is no
sensible default for "what material is this person's existing wall made
of" — guessing would silently substitute a fictional building for their
real one. Every field here is required; there is no optimizer or default
filling gaps, per the phase-split doc.

Same simplification as Phase 1/3's make_simple_box_geometry (uniform
construction on all four walls, single roof/floor type) — a real per-
surface retrofit tool is future work, not a Phase 3b blocker.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RetrofitBaseline:
    site_id: str
    day_of_year: int

    floor_area_m2: float
    ceiling_height_m: float
    leakage_area_cm2: float

    wall_material_id: str
    wall_thickness_m: float

    # existing insulation, if any. Use insulation_material_id=None +
    # insulation_thickness_m=0.0 to mean "this wall currently has none" —
    # that is itself meaningful baseline data, not a missing field, so it's
    # allowed to be explicitly zero/None but not silently omitted.
    insulation_material_id: str | None
    insulation_thickness_m: float

    sensible_heat_w: float
    co_generation_rate_lpm: float = 0.0
    indoor_temp_initial_c: float = -5.0

    def __post_init__(self):
        missing = []
        for f in (
            "site_id", "wall_material_id", "floor_area_m2",
            "ceiling_height_m", "leakage_area_cm2", "wall_thickness_m",
        ):
            if getattr(self, f) in (None, ""):
                missing.append(f)
        if self.insulation_thickness_m > 0 and not self.insulation_material_id:
            missing.append("insulation_material_id (insulation_thickness_m > 0 but no material given)")
        if missing:
            raise ValueError(
                f"RetrofitBaseline is missing required field(s): {missing}. "
                "Retrofit mode has no defaults — every field describing the "
                "existing structure must be supplied explicitly."
            )
