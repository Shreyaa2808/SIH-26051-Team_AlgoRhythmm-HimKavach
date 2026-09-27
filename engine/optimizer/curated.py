"""
Phase 3 — curated design selection.

The roadmap (section F) asks for "5-6 optimal curated designs shown as
cards (not a raw 500-point Pareto dump)" — Cheapest / Balanced /
Max-Performance / Lightest / Fastest-to-verify — each with a one-line
"why", plus an "Explore more" pagination over the remaining front.

Previously /optimize just returned the whole Pareto front sorted by cost.
This module sits between run_new_build_optimization() and the API layer:
it labels a handful of standout designs with a human-readable reason, then
exposes the rest of the front in pages so the frontend's "Generate more"
button can page through it without re-running the optimizer.

Labels implemented (comfort/cost/weight are the real SEARCH objectives;
carbon is a real, sourced, REPORTED figure that doesn't steer the search
itself — see engine/optimizer/objectives.py's module docstring for why):
  - Cheapest         : min cost_inr
  - Max Performance   : max comfort_coldest_hour_c
  - Lightest          : min weight_kg (relevant for airlift/mule-train
                         logistics per the roadmap's "lightest-airlift"
                         framing, until a real airlift-feasibility
                         objective exists)
  - Lowest Carbon     : min carbon_kgco2e among designs where it's known
                         (some material combinations have no carbon figure
                         on file — see materials.json's _carbon_data_note —
                         those designs are simply not eligible for this
                         label, not treated as zero-carbon)
  - Balanced          : closest to the per-objective normalized centroid
                         (min-max scaled comfort/cost/weight, Euclidean
                         distance to (0.5, 0.5, 0.5)) — a genuine
                         trade-off pick, not just "third cheapest". Carbon
                         is NOT part of this distance calc (see above).
A design already claimed by an earlier label is not repeated under a
second label — with a modest front size this can legitimately shrink the
curated set below 5; the API surfaces however many distinct labels apply
rather than padding with duplicates.
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.optimizer.optimize import RankedDesign


@dataclass
class CuratedDesign:
    label: str
    why: str
    design: RankedDesign


def _normalize(values: list[float]) -> list[float]:
    lo, hi = min(values), max(values)
    if hi == lo:
        return [0.5 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def curate_top_designs(ranked: list[RankedDesign], max_labels: int = 6) -> list[CuratedDesign]:
    """ranked: physics-verified Pareto front from run_new_build_optimization(), any order."""
    if not ranked:
        return []

    comfort = [rd.objectives.comfort_coldest_hour_c for rd in ranked]
    cost = [rd.objectives.cost_inr for rd in ranked]
    weight = [rd.objectives.weight_kg for rd in ranked]

    n_comfort = _normalize(comfort)
    n_cost = _normalize(cost)
    n_weight = _normalize(weight)

    # "worse" direction for comfort is LOW, so invert its normalized score
    # before computing distance-to-centroid — otherwise "balanced" would
    # be biased toward cold-but-cheap-and-light designs.
    centroid_dist = [
        ((1 - c) - 0.5) ** 2 + (co - 0.5) ** 2 + (w - 0.5) ** 2
        for c, co, w in zip(n_comfort, n_cost, n_weight)
    ]

    idx_cheapest = min(range(len(ranked)), key=lambda i: cost[i])
    idx_max_perf = max(range(len(ranked)), key=lambda i: comfort[i])
    idx_lightest = min(range(len(ranked)), key=lambda i: weight[i])
    idx_balanced = min(range(len(ranked)), key=lambda i: centroid_dist[i])

    candidates = [
        ("Cheapest", idx_cheapest,
         f"Lowest material cost (₹{cost[idx_cheapest]:,.0f}) among designs that pass the safety interlock."),
        ("Max Performance", idx_max_perf,
         f"Warmest coldest-hour temperature ({comfort[idx_max_perf]:.1f}°C) in the feasible set."),
        ("Lightest", idx_lightest,
         f"Lowest envelope mass ({weight[idx_lightest]:.0f} kg) — best fit for airlift/mule-train logistics."),
        ("Balanced", idx_balanced,
         "Best overall trade-off across comfort, cost, and weight (closest to the normalized centroid)."),
    ]

    # Carbon is only known for designs whose materials all have a sourced
    # carbon_kgco2e_per_kg (see objectives.py) — skip the label entirely if
    # none qualify, rather than picking a design with an unknown/null value.
    carbon_known_idx = [i for i, rd in enumerate(ranked) if rd.objectives.carbon_kgco2e is not None]
    if carbon_known_idx:
        idx_lowest_carbon = min(carbon_known_idx, key=lambda i: ranked[i].objectives.carbon_kgco2e)
        candidates.append((
            "Lowest Carbon", idx_lowest_carbon,
            f"Lowest embodied carbon (~{ranked[idx_lowest_carbon].objectives.carbon_kgco2e:,.0f} kgCO2e) "
            "among designs where every material has a sourced carbon figure — see materials.json for citations.",
        ))

    curated: list[CuratedDesign] = []
    seen_indices: set[int] = set()
    for label, idx, why in candidates:
        if idx in seen_indices:
            continue
        curated.append(CuratedDesign(label=label, why=why, design=ranked[idx]))
        seen_indices.add(idx)
        if len(curated) >= max_labels:
            break

    return curated


def paginate_remaining(
    ranked: list[RankedDesign],
    curated: list[CuratedDesign],
    offset: int = 0,
    page_size: int = 6,
) -> tuple[list[RankedDesign], bool]:
    """
    "Explore more" — the rest of the physics-verified front, excluding
    whatever's already shown as a curated card, sorted by cost (cheapest
    first) so paging through it reads as a sensible progression.
    Returns (page, has_more).
    """
    curated_designs = {id(c.design) for c in curated}
    remaining = sorted(
        (rd for rd in ranked if id(rd) not in curated_designs),
        key=lambda rd: rd.objectives.cost_inr,
    )
    page = remaining[offset: offset + page_size]
    has_more = offset + page_size < len(remaining)
    return page, has_more
