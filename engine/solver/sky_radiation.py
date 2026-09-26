"""
Sky longwave radiation: effective sky temperature for computing radiative
heat loss from the shelter envelope to the sky (dominant loss mechanism on
clear high-altitude nights — thin, dry atmosphere = weak greenhouse effect
= very cold effective sky temperature, often 20-40K below air temp).

Reference:
    Swinbank, W.C. (1963). "Long-wave radiation from clear skies."
    Quarterly Journal of the Royal Meteorological Society, 89(381), 339-348.
    Formula: sigma * Tsky^4 = 5.31e-14 * Tair^6   (Tair, Tsky in Kelvin)

We also cross-check against measured downward longwave (ALLSKY_SFC_LW_DWN
from NASA POWER) when available, since Swinbank is a clear-sky-only
correlation and underestimates Tsky (overestimates radiative loss) under
cloud — real cloud cover at these sites will make nights less brutal than
a pure-Swinbank model predicts.
"""
from __future__ import annotations

import math

STEFAN_BOLTZMANN = 5.670374419e-8  # W/(m^2 K^4)


def swinbank_sky_temp_k(air_temp_k: float) -> float:
    """
    Clear-sky effective sky temperature, Kelvin, from Swinbank's correlation.
    sigma * Tsky^4 = 5.31e-14 * Tair^6
    => Tsky = (5.31e-14 * Tair^6 / sigma) ^ 0.25
    """
    lw_down = 5.31e-14 * air_temp_k**6
    return (lw_down / STEFAN_BOLTZMANN) ** 0.25


def swinbank_lw_down_wm2(air_temp_k: float) -> float:
    """Downward longwave flux under clear sky, W/m^2."""
    return 5.31e-14 * air_temp_k**6


def sky_temp_from_measured_lw(lw_down_wm2: float) -> float:
    """
    Back out an effective sky temperature from a measured/reanalysis
    downward-longwave flux (e.g. NASA POWER ALLSKY_SFC_LW_DWN), which
    already includes cloud effects. Preferred over pure Swinbank when
    this data is available.
    """
    if lw_down_wm2 <= 0:
        return 0.0
    return (lw_down_wm2 / STEFAN_BOLTZMANN) ** 0.25


def net_radiative_loss_wm2(
    surface_temp_k: float,
    sky_temp_k: float,
    surface_emissivity: float = 0.9,
    view_factor_to_sky: float = 1.0,
) -> float:
    """
    Net longwave radiative exchange between an envelope surface and the sky,
    W/m^2. Positive = net loss from surface to sky (the usual case for a
    roof on a clear high-altitude night).

    view_factor_to_sky: 1.0 for a flat unobstructed roof; lower for walls
    partially shadowed by terrain/other structures (caller supplies this
    from geometry — Phase 4's 3D model can compute it more precisely later).
    """
    return (
        surface_emissivity
        * view_factor_to_sky
        * STEFAN_BOLTZMANN
        * (surface_temp_k**4 - sky_temp_k**4)
    )


def effective_sky_temp_k(
    air_temp_k: float,
    measured_lw_down_wm2: float | None = None,
) -> float:
    """
    Best-available effective sky temperature: use measured/reanalysis LW-down
    if supplied (accounts for cloud cover), else fall back to clear-sky
    Swinbank correlation (conservative — predicts colder sky / more loss,
    which is the safer assumption for a life-safety shelter design).
    """
    if measured_lw_down_wm2 is not None and measured_lw_down_wm2 > 0:
        return sky_temp_from_measured_lw(measured_lw_down_wm2)
    return swinbank_sky_temp_k(air_temp_k)
