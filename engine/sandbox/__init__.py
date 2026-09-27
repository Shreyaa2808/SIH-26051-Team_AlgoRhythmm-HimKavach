"""Phase 3 (roadmap section D) — bulk/sandbox multi-shelter layout.

Given a single already-optimized unit design (one card out of /optimize's
curated_designs, or any RankedDesign) plus a total occupancy and a total
budget, suggest how many copies of that unit a settlement would need and
lay them out on a simple grid.

This is deliberately NOT a second optimizer. It does not re-search
materials/thickness for a "settlement" objective — it takes one already-
verified unit design as given and answers a much narrower question:
"how many of these fit the occupancy and the budget, and how do we place
them so they don't shade/wind-shadow each other." See layout.py's module
docstring for the exact assumptions and what's honestly a placeholder
today.
"""
from engine.sandbox.layout import (
    SandboxConfig,
    SettlementLayout,
    UnitCost,
    suggest_settlement_layout,
)

__all__ = [
    "SandboxConfig",
    "SettlementLayout",
    "UnitCost",
    "suggest_settlement_layout",
]
