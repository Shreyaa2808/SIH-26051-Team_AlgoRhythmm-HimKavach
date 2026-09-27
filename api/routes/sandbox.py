"""
POST /sandbox/layout — roadmap section D (bulk/sandbox mode).

Takes ONE already-verified unit design (normally: the cost_inr/weight_kg/
carbon_kgco2e/floor_area_m2 off a curated card from a prior /optimize call)
plus a settlement's total occupancy and budget, and returns how many units
that implies, which constraint binds, and a simple grid layout.

Does not re-run the optimizer and does not accept material/thickness
genome fields — those already produced the per-unit numbers this endpoint
takes as input. See engine/sandbox/layout.py's module docstring for exactly
what the grid spacing does and doesn't model.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.sandbox.layout import SandboxConfig, UnitCost, suggest_settlement_layout

router = APIRouter()


class SandboxLayoutRequest(BaseModel):
    # Per-unit figures — copy these from an /optimize curated_designs[i].design
    unit_cost_inr: float = Field(..., gt=0)
    unit_weight_kg: float = Field(..., gt=0)
    unit_floor_area_m2: float = Field(..., gt=0)
    unit_carbon_kgco2e: float | None = None

    occupancy_total: int = Field(..., gt=0)
    budget_total_inr: float = Field(0.0, ge=0)

    occupancy_per_unit: int = Field(4, gt=0)
    spacing_multiplier: float = Field(2.5, gt=0)
    max_columns: int | None = Field(None, gt=0)


class SandboxLayoutResponse(BaseModel):
    units_built: int
    binding_constraint: str
    units_needed_for_occupancy: int
    units_affordable_by_budget: int

    occupancy_covered: int
    occupancy_total: int
    occupancy_shortfall: int

    total_cost_inr: float
    budget_total_inr: float
    budget_remaining_inr: float

    total_weight_kg: float
    total_carbon_kgco2e: float | None

    grid_rows: int
    grid_cols: int
    unit_footprint_side_m: float
    spacing_m: float
    positions_m: list[list[float]]

    notes: list[str]
    note: str = (
        "This sizes N copies of ONE already-optimized unit design against "
        "occupancy_total and budget_total_inr — it is not a second optimizer "
        "and does not mix unit designs. Grid spacing is a documented rule-of- "
        "thumb (spacing_multiplier x unit footprint side), not a solar/wind-"
        "shadowing simulation — see engine/sandbox/layout.py for the caveat."
    )


@router.post("/sandbox/layout", response_model=SandboxLayoutResponse)
def run_sandbox_layout(req: SandboxLayoutRequest) -> SandboxLayoutResponse:
    unit = UnitCost(
        cost_inr=req.unit_cost_inr,
        weight_kg=req.unit_weight_kg,
        floor_area_m2=req.unit_floor_area_m2,
        carbon_kgco2e=req.unit_carbon_kgco2e,
    )
    config = SandboxConfig(
        occupancy_per_unit=req.occupancy_per_unit,
        spacing_multiplier=req.spacing_multiplier,
        max_columns=req.max_columns,
    )

    try:
        layout = suggest_settlement_layout(
            unit,
            occupancy_total=req.occupancy_total,
            budget_total_inr=req.budget_total_inr,
            config=config,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return SandboxLayoutResponse(
        units_built=layout.units_built,
        binding_constraint=layout.binding_constraint,
        units_needed_for_occupancy=layout.units_needed_for_occupancy,
        units_affordable_by_budget=layout.units_affordable_by_budget,
        occupancy_covered=layout.occupancy_covered,
        occupancy_total=layout.occupancy_total,
        occupancy_shortfall=layout.occupancy_shortfall,
        total_cost_inr=layout.total_cost_inr,
        budget_total_inr=layout.budget_total_inr,
        budget_remaining_inr=layout.budget_remaining_inr,
        total_weight_kg=layout.total_weight_kg,
        total_carbon_kgco2e=layout.total_carbon_kgco2e,
        grid_rows=layout.grid_rows,
        grid_cols=layout.grid_cols,
        unit_footprint_side_m=layout.unit_footprint_side_m,
        spacing_m=layout.spacing_m,
        positions_m=[[x, y] for x, y in layout.positions_m],
        notes=layout.notes,
    )
