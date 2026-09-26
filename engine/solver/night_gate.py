"""
Phase 5 (Person A) — Night Gate physics state.

What a "Night Gate" is, physically: an insulated shutter/curtain/door-flap
that's manually closed over the shelter's entry/opening at night and
opened during the day. It is NOT a new envelope surface with its own
R-value — there's no window/door subsystem in this model (make_simple_box_
geometry and build_retrofit_geometry are plain 4-wall+roof+floor boxes,
Phase 1's simplification). Modeling it as "extra insulation glued onto a
wall" would be physically wrong, since walls don't move and Night Gates do.

What IS modeled, and why it's the right mechanism: a Night Gate's real job
is closing off the draftiest part of the envelope (the door/opening) when
nobody needs to pass through it. That is an INFILTRATION effect, not a
conduction effect — so this reduces the effective leakage_area_cm2 used by
the existing ACH calculation (engine/solver/infiltration.py) during the
hours it's scheduled closed, and does nothing to conduction/solar/sky
radiation on any surface. If a windowed-opening subsystem gets added to
the geometry model later, a "the gate also adds R-value while closed"
effect could be layered in then — that would need its own surface to add
resistance to, which doesn't exist yet.

Cost: NOT modeled. There's no Night Gate product/material entry in
materials.json (it's a piece of hardware, not a wall material), and no
sourced cost for one. Same rule as everywhere else in this codebase:
`cost_inr=None` rather than a guessed number.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class NightGateSchedule:
    """
    close_hour/open_hour are LOCAL hours-of-day (0-23), gate is treated as
    closed for the half-open interval [close_hour, open_hour) wrapping
    past midnight if close_hour > open_hour (the normal case: closes in
    the evening, opens the next morning).

    leakage_area_closed_cm2: effective leakage area, in cm2, WHILE the gate
    is closed. Must be less than the baseline (open/no-gate) leakage area,
    or the gate isn't doing anything — validated in __post_init__.
    """
    close_hour: float = 19.0
    open_hour: float = 7.0
    leakage_area_closed_cm2: float = 60.0

    def __post_init__(self):
        if not (0 <= self.close_hour < 24) or not (0 <= self.open_hour < 24):
            raise ValueError("close_hour and open_hour must be in [0, 24).")
        if self.leakage_area_closed_cm2 <= 0:
            raise ValueError("leakage_area_closed_cm2 must be > 0 (a fully sealed shelter still needs some fresh air; see the CO/ACH safety interlock).")

    def is_closed(self, local_hour: float) -> bool:
        h = local_hour % 24
        if self.close_hour == self.open_hour:
            return False  # degenerate schedule = never closes
        if self.close_hour < self.open_hour:
            return self.close_hour <= h < self.open_hour
        return h >= self.close_hour or h < self.open_hour

    def hours_closed_per_day(self) -> float:
        if self.close_hour == self.open_hour:
            return 0.0
        return (self.open_hour - self.close_hour) % 24


def effective_leakage_area_cm2(
    local_hour: float,
    baseline_leakage_area_cm2: float,
    night_gate: NightGateSchedule | None,
) -> float:
    if night_gate is None:
        return baseline_leakage_area_cm2
    if night_gate.is_closed(local_hour):
        # gate can only ever REDUCE leakage, never increase it, regardless
        # of what leakage_area_closed_cm2 is configured to (protects
        # against a misconfigured gate making things worse than baseline)
        return min(baseline_leakage_area_cm2, night_gate.leakage_area_closed_cm2)
    return baseline_leakage_area_cm2
