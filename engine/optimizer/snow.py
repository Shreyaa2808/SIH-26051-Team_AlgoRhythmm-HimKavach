"""
Phase E — roof snow load as a first-class design quantity.

Why this exists: roof slope was previously a static input, so the optimizer
could never trade "steeper roof sheds snow" against "steeper roof = more
roof area (cost/weight) + different solar gain". With slope now a free gene
(see search_space.py), snow load becomes a real constraint the search can
solve against.

Model (deliberately simple, closed-form, cheap enough to evaluate on every
GA individual, including the ones the surrogate stands in for):

    roof_snow_load = mu(slope) * ground_snow_load

mu(slope) follows the simple monopitch shape-coefficient rule used in
IS 875 (Part 4): 0.8 up to 30 deg, falling linearly to 0 at 60 deg.
IMPORTANT: this is the textbook shape-coefficient rule, NOT a substitute for
a site-specific structural check. It ignores drifting, sliding-snow
accumulation at eaves, wind exposure, and thermal (heated-roof) factors.
Verify the coefficients against the current edition of the code before
quoting the numbers in a formal submission. `ground_snow_load_kpa` is a
user-supplied input (there is no snow-load map bundled in this repo), and
`max_roof_snow_load_kpa` is the user's own structural capacity limit —
if it's left unset, snow load is reported but never rejects a design.
"""
from __future__ import annotations


def snow_shape_coefficient(slope_deg: float) -> float:
    if slope_deg <= 30.0:
        return 0.8
    if slope_deg >= 60.0:
        return 0.0
    return 0.8 * (60.0 - slope_deg) / 30.0


def roof_snow_load_kpa(slope_deg: float, ground_snow_load_kpa: float) -> float:
    return snow_shape_coefficient(slope_deg) * max(0.0, ground_snow_load_kpa)


def snow_violation_reason(
    slope_deg: float, ground_snow_load_kpa: float, max_roof_snow_load_kpa: float | None
) -> str | None:
    """Returns a human-readable reason if the limit is exceeded, else None."""
    if max_roof_snow_load_kpa is None:
        return None
    load = roof_snow_load_kpa(slope_deg, ground_snow_load_kpa)
    if load > max_roof_snow_load_kpa + 1e-9:
        return (
            f"roof snow load {load:.2f} kPa at {slope_deg:.0f} deg slope exceeds "
            f"the {max_roof_snow_load_kpa:.2f} kPa limit"
        )
    return None
