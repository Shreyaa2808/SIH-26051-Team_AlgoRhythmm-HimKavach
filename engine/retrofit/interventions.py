"""
Candidate single-variable retrofit upgrades, generated against a fixed
RetrofitBaseline. "Single-variable" per the phase-split doc: each
candidate changes exactly one thing relative to the baseline. This is a
small enumerated set to rank, not a search space — Phase 3b intentionally
does NOT reuse engine/optimizer's NSGA-II/surrogate.

Intervention types implemented:
  - ADD_INSULATION: baseline currently has none -> add a layer of each
    insulation material in the library, at one practical thickness.
  - INCREASE_INSULATION: baseline already has some -> add ADDED_THICKNESS_M
    more of the SAME material (simplest, most common real retrofit: another
    layer of what's already there).
  - SWAP_WALL_MATERIAL: same wall thickness, different structural material.
  - ADD_NIGHT_GATE (Phase 5, now implemented — was a stub in Phase 3b):
    fits the Night Gate physics state (engine/solver/night_gate.py) with a
    default evening-close/morning-open schedule. No material is added, so
    there's nothing to cost from materials.json — cost is reported as
    unknown (None), not guessed.

NOT implemented (listed for transparency, not silently dropped):
  - TIGHTEN_ENVELOPE (permanently reduce baseline leakage_area_cm2 via
    air-sealing, as opposed to Night Gate's scheduled/reversible closure):
    physically modelable today (just lower the leakage input), but its
    cost is labor-only and we have no sourced labor-cost data, same
    principle as the carbon gap in Phase 3. Left out rather than guessed.
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary
from engine.retrofit.baseline import RetrofitBaseline
from engine.solver.night_gate import NightGateSchedule

ADDED_INSULATION_THICKNESS_M = 0.05  # one practical retrofit-panel thickness


@dataclass
class Intervention:
    kind: str  # "add_insulation" | "increase_insulation" | "swap_insulation_material" | "swap_wall_material" | "add_night_gate"
    label: str
    # resulting design params, ready to hand to build_retrofit_geometry
    wall_material_id: str
    wall_thickness_m: float
    insulation_material_id: str | None
    insulation_thickness_m: float
    # material-based cost inputs. None/0.0 for interventions with no
    # material (add_night_gate) -> ranker reports cost as unknown (None)
    # rather than guessing.
    added_material_id: str | None = None
    added_volume_m3: float = 0.0
    # only set for kind == "add_night_gate"; ranker passes this through to
    # build_retrofit_geometry's night_gate= argument
    night_gate: NightGateSchedule | None = None


@dataclass
class NotYetAvailableIntervention:
    kind: str
    label: str
    reason: str


def _wall_area_m2(baseline: RetrofitBaseline) -> float:
    import math
    side = math.sqrt(baseline.floor_area_m2)
    return 4 * side * baseline.ceiling_height_m  # 4 walls only; roof/floor not targeted by these interventions


def generate_candidates(
    baseline: RetrofitBaseline, materials_lib: MaterialsLibrary
) -> tuple[list[Intervention], list[NotYetAvailableIntervention]]:
    wall_area = _wall_area_m2(baseline)
    candidates: list[Intervention] = []

    if baseline.insulation_thickness_m <= 0:
        for mat in materials_lib.by_category("insulation"):
            candidates.append(
                Intervention(
                    kind="add_insulation",
                    label=f"Add {ADDED_INSULATION_THICKNESS_M*100:.0f}cm {mat.name}",
                    wall_material_id=baseline.wall_material_id,
                    wall_thickness_m=baseline.wall_thickness_m,
                    insulation_material_id=mat.id,
                    insulation_thickness_m=ADDED_INSULATION_THICKNESS_M,
                    added_material_id=mat.id,
                    added_volume_m3=wall_area * ADDED_INSULATION_THICKNESS_M,
                )
            )
    else:
        mat = materials_lib.get(baseline.insulation_material_id)
        candidates.append(
            Intervention(
                kind="increase_insulation",
                label=f"Add another {ADDED_INSULATION_THICKNESS_M*100:.0f}cm of existing {mat.name}",
                wall_material_id=baseline.wall_material_id,
                wall_thickness_m=baseline.wall_thickness_m,
                insulation_material_id=mat.id,
                insulation_thickness_m=baseline.insulation_thickness_m + ADDED_INSULATION_THICKNESS_M,
                added_material_id=mat.id,
                added_volume_m3=wall_area * ADDED_INSULATION_THICKNESS_M,
            )
        )
        # also offer REPLACING the existing insulation material outright, at
        # the same thickness, in case something better than what they
        # already have is worth switching to instead of just adding more of
        # the same. (Solver models one material per insulation layer, so
        # "add a second material on top of the first" isn't representable
        # without extending the geometry builder to multi-material layers —
        # future work, not modeled here.)
        for alt in materials_lib.by_category("insulation"):
            if alt.id == mat.id:
                continue
            candidates.append(
                Intervention(
                    kind="swap_insulation_material",
                    label=f"Replace existing insulation with {alt.name} (same thickness)",
                    wall_material_id=baseline.wall_material_id,
                    wall_thickness_m=baseline.wall_thickness_m,
                    insulation_material_id=alt.id,
                    insulation_thickness_m=baseline.insulation_thickness_m,
                    added_material_id=alt.id,
                    added_volume_m3=wall_area * baseline.insulation_thickness_m,
                )
            )

    wall_mat = materials_lib.get(baseline.wall_material_id)
    for alt in materials_lib.by_category("structural/thermal mass"):
        if alt.id == wall_mat.id:
            continue
        candidates.append(
            Intervention(
                kind="swap_wall_material",
                label=f"Rebuild wall in {alt.name} instead of {wall_mat.name}",
                wall_material_id=alt.id,
                wall_thickness_m=baseline.wall_thickness_m,
                insulation_material_id=baseline.insulation_material_id,
                insulation_thickness_m=baseline.insulation_thickness_m,
                added_material_id=alt.id,
                added_volume_m3=wall_area * baseline.wall_thickness_m,
            )
        )

    unavailable: list[NotYetAvailableIntervention] = []

    candidates.append(
        Intervention(
            kind="add_night_gate",
            label="Fit a Night Gate (insulated night shutter over the entry)",
            wall_material_id=baseline.wall_material_id,
            wall_thickness_m=baseline.wall_thickness_m,
            insulation_material_id=baseline.insulation_material_id,
            insulation_thickness_m=baseline.insulation_thickness_m,
            night_gate=NightGateSchedule(
                close_hour=19.0,
                open_hour=7.0,
                # closed leakage area capped at whatever's smaller than the
                # baseline anyway (see night_gate.effective_leakage_area_cm2),
                # this default just needs to be meaningfully tighter than a
                # typical baseline (~150-400 cm2)
                leakage_area_closed_cm2=min(60.0, baseline.leakage_area_cm2 * 0.5),
            ),
        )
    )

    return candidates, unavailable
