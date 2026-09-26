"""
Infiltration: air changes per hour (ACH) driven by wind and stack (buoyancy)
effects, corrected for reduced air density at high altitude. Also implements
the hard ACH/CO safety interlock — this is a NON-NEGOTIABLE gate: no design
output (from the optimizer or anywhere else) may be returned to the user with
an interlock violation. The interlock blocks the design, it does not just
flag it.

Density correction matters here specifically because:
    - Lower air density at altitude -> same volumetric leakage area moves
      LESS mass of air per hour than at sea level (naive ACH formulas from
      sea-level standards will overstate ventilation).
    - But occupants also produce CO (combustion heaters, stoves) at the same
      rate regardless of altitude, and their physiology is already oxygen-
      stressed at altitude -> the CO safety margin must be tighter, not
      looser, even though "ACH" numerically looks lower.

References:
    - ASHRAE Fundamentals 2021, Ch. 16 (infiltration) and Ch. 9 (IAQ, CO
      exposure limits: 9 ppm 8-hr average, 35 ppm 1-hr ceiling — NIOSH/OSHA).
    - ISO 2533:1975 (International Standard Atmosphere) for density-vs-
      altitude correction.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# ISO 2533 standard atmosphere constants
SEA_LEVEL_DENSITY = 1.225       # kg/m^3
SEA_LEVEL_PRESSURE = 101325.0   # Pa
LAPSE_RATE = 0.0065              # K/m
SEA_LEVEL_TEMP = 288.15          # K
GRAVITY = 9.80665                # m/s^2
GAS_CONSTANT_AIR = 287.05        # J/(kg K)

# Safety limits (NIOSH/OSHA, ASHRAE 62.1 IAQ)
CO_8HR_LIMIT_PPM = 9.0
CO_1HR_CEILING_PPM = 35.0
MIN_ACH_HEALTH = 0.35  # ASHRAE 62.2 minimum whole-building ventilation floor


def air_density_at_altitude(elevation_m: float, air_temp_k: float) -> float:
    """
    Air density (kg/m^3) at given elevation and actual air temperature,
    using ISO 2533 pressure-altitude relation but the ACTUAL measured
    temperature (not standard-atmosphere temperature) for the ideal-gas
    density calc, since our sites can be far colder than ISA standard.
    """
    pressure = SEA_LEVEL_PRESSURE * (
        1 - LAPSE_RATE * elevation_m / SEA_LEVEL_TEMP
    ) ** (GRAVITY / (GAS_CONSTANT_AIR * LAPSE_RATE))
    return pressure / (GAS_CONSTANT_AIR * air_temp_k)


def wind_driven_ach(
    wind_speed_ms: float,
    leakage_area_cm2: float,
    building_volume_m3: float,
    elevation_m: float,
    air_temp_k: float,
    terrain_shelter_class: int = 3,
) -> float:
    """
    Simplified LBL/ASHRAE infiltration model, wind component, density-
    corrected. terrain_shelter_class: 1 (fully exposed) to 5 (heavily
    sheltered) — default 3 (typical rural/open terrain, appropriate for
    high-altitude shelter siting).
    """
    shelter_factors = {1: 0.34, 2: 0.30, 3: 0.25, 4: 0.19, 5: 0.11}
    sf = shelter_factors.get(terrain_shelter_class, 0.25)

    rho = air_density_at_altitude(elevation_m, air_temp_k)
    rho_ratio = rho / SEA_LEVEL_DENSITY  # density correction factor

    leakage_m2 = leakage_area_cm2 * 1e-4
    # volumetric flow, m^3/s -- scaled by density ratio since the same
    # crack geometry passes less MASS (but the volumetric flow itself is
    # governed by pressure/momentum, so we apply the density correction to
    # convert the resulting mass-equivalent ACH back to what matters for
    # dilution: fresh-air VOLUME exchanged, corrected for how much O2/CO
    # dilution capacity that volume actually carries)
    q_wind_m3s = sf * leakage_m2 * wind_speed_ms

    ach = (q_wind_m3s * 3600.0) / building_volume_m3
    # apply density correction: thinner air carries less dilution capacity
    # per m^3, so effective ventilation "value" is reduced at altitude
    return ach * rho_ratio


def stack_driven_ach(
    indoor_temp_k: float,
    outdoor_temp_k: float,
    leakage_area_cm2: float,
    building_volume_m3: float,
    building_height_m: float,
    elevation_m: float,
) -> float:
    """Buoyancy-driven infiltration from indoor-outdoor temperature difference."""
    if indoor_temp_k <= outdoor_temp_k:
        return 0.0

    rho = air_density_at_altitude(elevation_m, outdoor_temp_k)
    rho_ratio = rho / SEA_LEVEL_DENSITY

    leakage_m2 = leakage_area_cm2 * 1e-4
    delta_t = indoor_temp_k - outdoor_temp_k
    # simplified stack effect: Q = C * A * sqrt(h * dT / T)
    stack_coeff = 0.65
    q_stack_m3s = stack_coeff * leakage_m2 * math.sqrt(
        GRAVITY * building_height_m * delta_t / outdoor_temp_k
    )
    ach = (q_stack_m3s * 3600.0) / building_volume_m3
    return ach * rho_ratio


def combined_ach(
    wind_speed_ms: float,
    indoor_temp_k: float,
    outdoor_temp_k: float,
    leakage_area_cm2: float,
    building_volume_m3: float,
    building_height_m: float,
    elevation_m: float,
    terrain_shelter_class: int = 3,
) -> float:
    """
    Wind and stack effects combined in quadrature (standard practice —
    the two mechanisms don't simply add, they partially overlap).
    """
    ach_wind = wind_driven_ach(
        wind_speed_ms, leakage_area_cm2, building_volume_m3,
        elevation_m, outdoor_temp_k, terrain_shelter_class,
    )
    ach_stack = stack_driven_ach(
        indoor_temp_k, outdoor_temp_k, leakage_area_cm2,
        building_volume_m3, building_height_m, elevation_m,
    )
    return math.sqrt(ach_wind**2 + ach_stack**2)


@dataclass
class SafetyInterlockResult:
    passed: bool
    ach: float
    co_steady_state_ppm: float
    reasons: list[str]


def check_safety_interlock(
    ach: float,
    co_generation_rate_lpm: float,
    building_volume_m3: float,
) -> SafetyInterlockResult:
    """
    HARD GATE — call this on every candidate design before it can be
    returned to the user (from /simulate directly, and from every
    optimizer-ranked design in Phase 3). A design that fails this must
    be rejected outright, not shown with a warning badge. This function
    itself never "soft-passes" — the caller must not override its result.

    co_generation_rate_lpm: CO generation rate in liters/minute (e.g. from
    a combustion heater/stove — this must be measured/supplied per
    appliance, not assumed; caller is responsible for passing a real number
    for whatever heat source the design assumes).
    """
    reasons = []

    if ach < MIN_ACH_HEALTH:
        reasons.append(
            f"ACH {ach:.2f} is below the ASHRAE 62.2 minimum health floor "
            f"of {MIN_ACH_HEALTH} — insufficient fresh-air dilution regardless "
            f"of CO source."
        )

    # steady-state CO concentration: C = G / (ACH * V) in consistent units
    # G in L/min -> convert to L/hr; V in m^3 -> ppm = (L_CO / L_air) * 1e6
    volume_air_exchanged_per_hr_l = ach * building_volume_m3 * 1000.0
    co_generated_per_hr_l = co_generation_rate_lpm * 60.0

    if volume_air_exchanged_per_hr_l <= 0:
        co_ppm = float("inf")
        reasons.append("Zero air exchange — CO cannot be diluted at all.")
    else:
        co_ppm = (co_generated_per_hr_l / volume_air_exchanged_per_hr_l) * 1e6

    if co_ppm > CO_8HR_LIMIT_PPM:
        reasons.append(
            f"Steady-state CO {co_ppm:.1f} ppm exceeds the 8-hour exposure "
            f"limit of {CO_8HR_LIMIT_PPM} ppm."
        )
    if co_ppm > CO_1HR_CEILING_PPM:
        reasons.append(
            f"Steady-state CO {co_ppm:.1f} ppm exceeds the 1-hour ceiling "
            f"of {CO_1HR_CEILING_PPM} ppm — acute risk."
        )

    return SafetyInterlockResult(
        passed=(len(reasons) == 0),
        ach=ach,
        co_steady_state_ppm=co_ppm,
        reasons=reasons,
    )
