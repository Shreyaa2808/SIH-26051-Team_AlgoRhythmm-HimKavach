"""
Phase 3 — design space for the NEW-BUILD optimizer only.

Retrofit is explicitly out of scope here (see Phase 3b / engine/retrofit).
A retrofit's geometry+materials are a fixed, required, already-built
baseline — there's nothing to search over except which single upgrade to
apply, which is a ranking problem, not a multi-variable optimization
problem. Reusing this search space for retrofit would be wrong: it would
let the optimizer "redesign" a wall that a person has already built.

Fixed vs. free variables, deliberately:
- floor_area_m2 / ceiling_height_m are treated as FIXED (site/programmatic
  constraints decided before the optimizer runs, e.g. by the mode-fork /
  config form on the frontend). We don't search over building size because
  a "smaller shelter is always more comfortable per rupee" isn't a useful
  answer for this tool.
- wall + insulation material choice, their thicknesses, and envelope
  leakage (as a proxy for build-quality/airtightness effort) ARE free —
  these are the decisions this optimizer is meant to help with.
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary

# construction-quality proxy: tighter envelope costs more (labor + sealing
# materials), looser is cheaper but worse for comfort/safety. Bounds picked
# to stay within the range the Phase 1 safety interlock is meaningful for
# (interlock still runs on every physics evaluation regardless).
LEAKAGE_AREA_CM2_MIN = 30.0
LEAKAGE_AREA_CM2_MAX = 400.0

WALL_THICKNESS_M_MIN = 0.15
WALL_THICKNESS_M_MAX = 0.60
INSULATION_THICKNESS_M_MIN = 0.02
INSULATION_THICKNESS_M_MAX = 0.30

# Phase E: roof slope and ceiling height can now be searched over (opt-in
# per run, see DesignSpace's free_roof_slope / free_ceiling_height flags).
# Slope floor of 5 deg keeps the roof a real pitched surface (the solver
# already treats a flat roof as a 5 deg tilt); ceiling range is a habitable
# single-storey band, not a structural limit.
ROOF_SLOPE_DEG_MIN = 5.0
ROOF_SLOPE_DEG_MAX = 45.0
CEILING_HEIGHT_M_MIN = 2.2
CEILING_HEIGHT_M_MAX = 3.0


@dataclass
class FixedParams:
    """Building-size / programmatic constraints, decided before optimization."""
    floor_area_m2: float
    ceiling_height_m: float
    site_id: str
    day_of_year: int = 15
    sensible_heat_w: float = 200.0
    # Phase E. Used when the corresponding gene is NOT free in the search:
    roof_slope_deg: float = 0.0          # 0 = legacy behaviour (flat roof, solver treats as 5 deg)
    # Snow (see engine/optimizer/snow.py). Ground load is a user input; the
    # limit is optional — None means "report snow load, never reject on it".
    ground_snow_load_kpa: float = 0.0
    max_roof_snow_load_kpa: float | None = None


def slope_of(individual: dict, fixed: "FixedParams") -> float:
    return float(individual.get("roof_slope_deg", fixed.roof_slope_deg))


def height_of(individual: dict, fixed: "FixedParams") -> float:
    return float(individual.get("ceiling_height_m", fixed.ceiling_height_m))


@dataclass
class Bounds:
    lo: float
    hi: float


class DesignSpace:
    """
    Mixed discrete (material choice) + continuous (thickness, leakage)
    search space. Individuals are represented as a flat dict so both the
    GA and the surrogate can share one encoding.
    """

    def __init__(
        self,
        materials_lib: MaterialsLibrary,
        free_roof_slope: bool = False,
        free_ceiling_height: bool = False,
    ):
        self.materials_lib = materials_lib
        self.free_roof_slope = free_roof_slope
        self.free_ceiling_height = free_ceiling_height
        self.wall_material_ids = [
            m.id for m in materials_lib.by_category("structural/thermal mass")
        ] + [
            m.id for m in materials_lib.all()
            if m.category in ("structural", "structural + insulation composite")
        ]
        self.insulation_material_ids = [
            m.id for m in materials_lib.by_category("insulation")
        ]
        if not self.wall_material_ids or not self.insulation_material_ids:
            raise RuntimeError(
                "Materials library is missing wall or insulation candidates — "
                "check data/materials/materials.json categories."
            )
        self.continuous_bounds = {
            "wall_thickness_m": Bounds(WALL_THICKNESS_M_MIN, WALL_THICKNESS_M_MAX),
            "insulation_thickness_m": Bounds(
                INSULATION_THICKNESS_M_MIN, INSULATION_THICKNESS_M_MAX
            ),
            "leakage_area_cm2": Bounds(LEAKAGE_AREA_CM2_MIN, LEAKAGE_AREA_CM2_MAX),
        }
        if free_roof_slope:
            self.continuous_bounds["roof_slope_deg"] = Bounds(ROOF_SLOPE_DEG_MIN, ROOF_SLOPE_DEG_MAX)
        if free_ceiling_height:
            self.continuous_bounds["ceiling_height_m"] = Bounds(
                CEILING_HEIGHT_M_MIN, CEILING_HEIGHT_M_MAX
            )

    def random_individual(self, rng) -> dict:
        ind = {
            "wall_material_id": rng.choice(self.wall_material_ids),
            "insulation_material_id": rng.choice(self.insulation_material_ids),
            "wall_thickness_m": rng.uniform(
                WALL_THICKNESS_M_MIN, WALL_THICKNESS_M_MAX
            ),
            "insulation_thickness_m": rng.uniform(
                INSULATION_THICKNESS_M_MIN, INSULATION_THICKNESS_M_MAX
            ),
            "leakage_area_cm2": rng.uniform(
                LEAKAGE_AREA_CM2_MIN, LEAKAGE_AREA_CM2_MAX
            ),
        }
        if self.free_roof_slope:
            ind["roof_slope_deg"] = rng.uniform(ROOF_SLOPE_DEG_MIN, ROOF_SLOPE_DEG_MAX)
        if self.free_ceiling_height:
            ind["ceiling_height_m"] = rng.uniform(CEILING_HEIGHT_M_MIN, CEILING_HEIGHT_M_MAX)
        return ind

    def clip_continuous(self, individual: dict) -> dict:
        out = dict(individual)
        for key, b in self.continuous_bounds.items():
            out[key] = float(min(max(out[key], b.lo), b.hi))
        return out
