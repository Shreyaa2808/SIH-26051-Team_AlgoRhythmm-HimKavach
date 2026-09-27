"""
Bulk/sandbox layout — roadmap section D, "Genuinely left #3" on the
current status list.

Scope, deliberately narrow:
  Given ONE already-optimized/verified unit design (its per-unit cost,
  weight, footprint, and — if known — embodied carbon), and a total
  occupancy + total budget for a settlement, work out:
    1. how many units occupancy alone would require,
    2. how many units the budget alone can afford,
    3. the number actually built = min(1, 2) — and which one is the
       binding constraint, surfaced explicitly rather than silently
       picked,
    4. a simple grid arrangement (rows x cols, near-square) with a
       spacing distance between unit centers,
    5. settlement-wide totals (cost, weight, carbon-if-known).

What this is NOT (documented here so it isn't quietly oversold):
  - NOT a second optimizer. It does not re-run NSGA-II for a "settlement"
    objective, and it does not consider mixing multiple different unit
    designs. One unit design in, N copies of it out.
  - Spacing is a documented placeholder, not a solar/wind-shadowing
    simulation. `spacing_multiplier` (default 2.5x the unit's footprint
    side length) is a common rule-of-thumb for avoiding one structure's
    shadow falling on the next at low winter sun angles, but it is NOT
    derived from this project's own solar-geometry module
    (engine/solver/solar_geometry.py) yet. Treat the grid as a rough
    site-planning sketch, not a validated shadow-free layout. Tightening
    this by actually calling solar_geometry for the site's winter solstice
    sun angle is flagged as a follow-up, not done here.
  - occupancy_per_unit is an input, not computed from floor_area_m2 via
    some occupancy-density model — the roadmap gives no such model, and
    guessing one would be worse than asking the caller to state it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class UnitCost:
    """The subset of one already-verified RankedDesign this module needs.

    Callers building this from an /optimize RankedDesign should pass
    objectives.cost_inr, objectives.weight_kg, objectives.carbon_kgco2e,
    and the FixedParams.floor_area_m2 used for that optimization run.
    """
    cost_inr: float
    weight_kg: float
    floor_area_m2: float
    carbon_kgco2e: float | None = None


@dataclass
class SandboxConfig:
    occupancy_per_unit: int = 4
    spacing_multiplier: float = 2.5  # see module docstring's caveat
    max_columns: int | None = None  # None => auto near-square grid


@dataclass
class SettlementLayout:
    units_built: int
    binding_constraint: str  # "occupancy" | "budget" | "both" | "none"
    units_needed_for_occupancy: int
    units_affordable_by_budget: int

    occupancy_covered: int
    occupancy_total: int
    occupancy_shortfall: int  # > 0 if budget capped units below occupancy need

    total_cost_inr: float
    budget_total_inr: float
    budget_remaining_inr: float

    total_weight_kg: float
    total_carbon_kgco2e: float | None  # None if unit's own carbon is unknown

    grid_rows: int
    grid_cols: int
    unit_footprint_side_m: float
    spacing_m: float
    positions_m: list[tuple[float, float]]  # (x, y) of each unit's center

    notes: list[str]


def suggest_settlement_layout(
    unit: UnitCost,
    occupancy_total: int,
    budget_total_inr: float,
    config: SandboxConfig | None = None,
) -> SettlementLayout:
    if occupancy_total <= 0:
        raise ValueError("occupancy_total must be positive.")
    if unit.cost_inr <= 0:
        raise ValueError("unit.cost_inr must be positive — cannot size a settlement against a free/zero-cost unit.")

    config = config or SandboxConfig()
    notes: list[str] = []

    units_needed_for_occupancy = math.ceil(occupancy_total / config.occupancy_per_unit)
    units_affordable_by_budget = math.floor(budget_total_inr / unit.cost_inr) if budget_total_inr > 0 else 0

    if budget_total_inr <= 0:
        notes.append(
            "budget_total_inr is 0 or not provided — sizing by occupancy only; "
            "budget_remaining_inr / units_affordable_by_budget are not meaningful."
        )
        units_built = units_needed_for_occupancy
        binding_constraint = "occupancy"
    else:
        units_built = min(units_needed_for_occupancy, units_affordable_by_budget)
        if units_needed_for_occupancy == units_affordable_by_budget:
            binding_constraint = "both"
        elif units_built == units_affordable_by_budget:
            binding_constraint = "budget"
        else:
            binding_constraint = "occupancy"

    if units_built <= 0:
        notes.append(
            "budget_total_inr can't afford even a single unit at this design's cost_inr — "
            "returning a 0-unit layout. Re-run /optimize with a cheaper curated design, "
            "or raise the budget."
        )

    occupancy_covered = units_built * config.occupancy_per_unit
    occupancy_shortfall = max(0, occupancy_total - occupancy_covered)
    if occupancy_shortfall > 0 and binding_constraint in ("budget", "both"):
        notes.append(
            f"Budget caps this settlement at {units_built} unit(s), covering "
            f"{occupancy_covered}/{occupancy_total} people — {occupancy_shortfall} "
            "person(s) short. This is a budget shortfall, not a design problem."
        )

    total_cost_inr = units_built * unit.cost_inr
    total_weight_kg = units_built * unit.weight_kg
    total_carbon_kgco2e = (
        units_built * unit.carbon_kgco2e if unit.carbon_kgco2e is not None else None
    )
    if unit.carbon_kgco2e is None:
        notes.append(
            "Selected unit design has no known carbon_kgco2e (some material combos "
            "lack a sourced carbon figure — see materials.json's _carbon_data_note); "
            "total_carbon_kgco2e is null, not zero."
        )

    budget_remaining_inr = (
        budget_total_inr - total_cost_inr if budget_total_inr > 0 else 0.0
    )

    # --- grid layout ---
    if units_built <= 0:
        grid_rows, grid_cols = 0, 0
        positions_m: list[tuple[float, float]] = []
    else:
        grid_cols = config.max_columns or max(1, math.ceil(math.sqrt(units_built)))
        grid_rows = math.ceil(units_built / grid_cols)
        positions_m = []
        for i in range(units_built):
            row, col = divmod(i, grid_cols)
            positions_m.append((col * _spacing(unit, config), row * _spacing(unit, config)))

    return SettlementLayout(
        units_built=units_built,
        binding_constraint=binding_constraint,
        units_needed_for_occupancy=units_needed_for_occupancy,
        units_affordable_by_budget=units_affordable_by_budget,
        occupancy_covered=occupancy_covered,
        occupancy_total=occupancy_total,
        occupancy_shortfall=occupancy_shortfall,
        total_cost_inr=total_cost_inr,
        budget_total_inr=budget_total_inr,
        budget_remaining_inr=budget_remaining_inr,
        total_weight_kg=total_weight_kg,
        total_carbon_kgco2e=total_carbon_kgco2e,
        grid_rows=grid_rows,
        grid_cols=grid_cols,
        unit_footprint_side_m=_footprint_side(unit),
        spacing_m=_spacing(unit, config),
        positions_m=positions_m,
        notes=notes,
    )


def _footprint_side(unit: UnitCost) -> float:
    """Assumes a roughly-square unit footprint — matches the new-build
    solver's make_simple_box_geometry (engine/solver/thermal_solver.py),
    which is also a simple box, not an arbitrary rectangle."""
    return math.sqrt(max(unit.floor_area_m2, 0.0))


def _spacing(unit: UnitCost, config: SandboxConfig) -> float:
    return _footprint_side(unit) * config.spacing_multiplier
