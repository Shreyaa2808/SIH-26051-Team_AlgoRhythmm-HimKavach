"""
GET /design-day-scenarios

Lets the frontend populate its "which scenario?" picker without hardcoding
the list of names on the client side. Purely descriptive — resolving a
scenario to an actual day_of_year for a specific site happens inside
_load_climate_for_site() + resolve_design_day() at request time in
simulate.py / optimize.py / retrofit.py (see INTEGRATION.md).
"""
from __future__ import annotations

from fastapi import APIRouter

from engine.climate.design_days import list_scenarios

router = APIRouter()


@router.get("/design-day-scenarios")
def get_design_day_scenarios() -> list[dict]:
    return list_scenarios()
