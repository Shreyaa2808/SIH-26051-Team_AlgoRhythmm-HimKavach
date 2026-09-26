"""
Solar geometry: sun position (declination, hour angle, altitude, azimuth) and
the Perez (1990) model for decomposing global horizontal irradiance (GHI)
into direct-normal (DNI) and diffuse-horizontal (DHI), then projecting onto
a tilted surface (roof/wall) for the RC solver's solar gain term.

Reference:
    Perez, R., Ineichen, P., Seals, R., Michalsky, J., Stewart, R. (1990).
    "Modeling daylight availability and irradiance components from direct
    and global irradiance." Solar Energy, 44(5), 271-289.

Simplifications vs. the full Perez model (acceptable for a hackathon-grade
design tool, flagged for the limitations slide):
    - Uses the DISC model (Maxwell 1987) for DNI estimation from GHI instead
      of full Perez decomposition, since POWER doesn't give us DNI directly.
    - Perez anisotropic sky-diffuse model is used for the tilt projection
      (this is the actual "Perez model" most relevant to sizing envelope
      solar gain, which is what the solver needs).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

DEG2RAD = math.pi / 180.0
RAD2DEG = 180.0 / math.pi
SOLAR_CONSTANT = 1367.0  # W/m^2, extraterrestrial


@dataclass
class SunPosition:
    altitude_deg: float   # angle above horizon, 0 = horizon, 90 = zenith
    azimuth_deg: float    # 0 = north, 90 = east, 180 = south, 270 = west (compass convention)
    zenith_deg: float
    declination_deg: float
    hour_angle_deg: float


def solar_declination_deg(day_of_year: int) -> float:
    """Cooper's equation."""
    return 23.45 * math.sin(DEG2RAD * 360.0 * (284 + day_of_year) / 365.0)


def equation_of_time_min(day_of_year: int) -> float:
    """Minutes of offset between solar time and clock time (orbital eccentricity + axial tilt)."""
    b = DEG2RAD * 360.0 * (day_of_year - 81) / 364.0
    return 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)


def sun_position(
    lat_deg: float,
    lon_deg: float,
    day_of_year: int,
    local_solar_hour: float,
) -> SunPosition:
    """
    local_solar_hour: decimal hour (0-24) in LOCAL SOLAR time already
    (if you have clock time, correct with longitude + equation of time first).
    """
    decl = solar_declination_deg(day_of_year)
    hour_angle = 15.0 * (local_solar_hour - 12.0)  # degrees, 15 deg/hour

    lat_r = lat_deg * DEG2RAD
    decl_r = decl * DEG2RAD
    ha_r = hour_angle * DEG2RAD

    sin_alt = (
        math.sin(lat_r) * math.sin(decl_r)
        + math.cos(lat_r) * math.cos(decl_r) * math.cos(ha_r)
    )
    sin_alt = max(-1.0, min(1.0, sin_alt))
    altitude = math.asin(sin_alt) * RAD2DEG
    zenith = 90.0 - altitude

    if altitude > 0.01:
        cos_az = (
            math.sin(decl_r) - math.sin(lat_r) * sin_alt
        ) / (math.cos(lat_r) * math.cos(math.asin(sin_alt)))
        cos_az = max(-1.0, min(1.0, cos_az))
        az = math.acos(cos_az) * RAD2DEG
        azimuth = az if hour_angle <= 0 else 360.0 - az
    else:
        azimuth = 180.0

    return SunPosition(
        altitude_deg=altitude,
        azimuth_deg=azimuth,
        zenith_deg=zenith,
        declination_deg=decl,
        hour_angle_deg=hour_angle,
    )


def extraterrestrial_irradiance(day_of_year: int) -> float:
    """W/m^2, corrected for earth-sun distance eccentricity."""
    return SOLAR_CONSTANT * (
        1 + 0.033 * math.cos(DEG2RAD * 360.0 * day_of_year / 365.0)
    )


def dni_from_ghi_disc(ghi_wm2: float, zenith_deg: float, day_of_year: int) -> float:
    """
    DISC model (Maxwell 1987): estimate DNI from GHI when DNI isn't measured
    directly (our case — NASA POWER gives ALLSKY_SFC_SW_DWN = GHI only).
    Returns DNI in W/m^2. Returns 0 if sun below horizon.
    """
    if zenith_deg >= 90.0 or ghi_wm2 <= 0:
        return 0.0

    zenith_r = zenith_deg * DEG2RAD
    cos_z = math.cos(zenith_r)
    i0 = extraterrestrial_irradiance(day_of_year)
    i0_horizontal = i0 * cos_z
    if i0_horizontal <= 0:
        return 0.0

    kt = ghi_wm2 / i0_horizontal  # clearness index
    kt = max(0.0, min(kt, 1.0))

    # DISC polynomial for Kn (direct clearness index) from Kt
    if kt <= 0.6:
        knc = 0.866 - 0.122 * kt + 0.0121 * kt**2 - 0.000653 * kt**3 - 1.0e-4 * kt**4
    else:
        knc = 0.366 + 0.0416 * kt - 0.0526 * kt**2

    dni = max(0.0, knc * i0)
    # physical cap: DNI can't exceed extraterrestrial normal
    return min(dni, i0)


def dhi_from_ghi_dni(ghi_wm2: float, dni_wm2: float, zenith_deg: float) -> float:
    """DHI = GHI - DNI * cos(zenith)."""
    cos_z = max(0.0, math.cos(zenith_deg * DEG2RAD))
    dhi = ghi_wm2 - dni_wm2 * cos_z
    return max(0.0, dhi)


def perez_diffuse_on_tilted_surface(
    dhi_wm2: float,
    dni_wm2: float,
    ghi_wm2: float,
    zenith_deg: float,
    surface_tilt_deg: float,
    surface_azimuth_deg: float,
    sun_azimuth_deg: float,
    day_of_year: int,
    albedo: float = 0.6,  # snow-covered ground default for high-altitude sites
) -> float:
    """
    Simplified Perez anisotropic sky-diffuse model: circumsolar + horizon
    brightening terms on top of isotropic diffuse. Returns diffuse
    irradiance on the tilted surface, W/m^2. Does NOT include ground-
    reflected component (added separately by caller — see total_poa below).
    """
    if ghi_wm2 <= 0 or dhi_wm2 <= 0:
        return 0.0

    zenith_r = zenith_deg * DEG2RAD
    tilt_r = surface_tilt_deg * DEG2RAD
    cos_z = max(0.01, math.cos(zenith_r))

    # angle of incidence between sun and surface normal
    aoi_cos = (
        math.cos(zenith_r) * math.cos(tilt_r)
        + math.sin(zenith_r) * math.sin(tilt_r)
        * math.cos((sun_azimuth_deg - surface_azimuth_deg) * DEG2RAD)
    )
    aoi_cos = max(0.0, aoi_cos)

    i0 = extraterrestrial_irradiance(day_of_year)
    air_mass = 1.0 / cos_z if cos_z > 0 else 10.0

    # Perez clearness (epsilon) and brightness (delta) parameters
    kappa = 1.041  # for zenith in radians
    eps = ((dhi_wm2 + dni_wm2) / dhi_wm2 + kappa * zenith_r**3) / (1 + kappa * zenith_r**3)
    delta = dhi_wm2 * air_mass / i0

    # bin epsilon into Perez coefficient table (simplified 4-bin version)
    if eps < 1.065:
        f11, f12, f13, f21, f22, f23 = -0.008, 0.588, -0.062, -0.060, 0.072, -0.022
    elif eps < 1.230:
        f11, f12, f13, f21, f22, f23 = 0.130, 0.683, -0.151, -0.019, 0.066, -0.029
    elif eps < 1.500:
        f11, f12, f13, f21, f22, f23 = 0.330, 0.487, -0.221, 0.055, -0.064, -0.026
    elif eps < 1.950:
        f11, f12, f13, f21, f22, f23 = 0.568, 0.187, -0.295, 0.109, -0.152, -0.014
    elif eps < 2.800:
        f11, f12, f13, f21, f22, f23 = 0.873, -0.392, -0.362, 0.226, -0.462, 0.001
    elif eps < 4.500:
        f11, f12, f13, f21, f22, f23 = 1.132, -1.237, -0.412, 0.288, -0.823, 0.056
    elif eps < 6.200:
        f11, f12, f13, f21, f22, f23 = 1.060, -1.600, -0.359, 0.264, -1.127, 0.131
    else:
        f11, f12, f13, f21, f22, f23 = 0.678, -0.327, -0.250, 0.156, -1.377, 0.251

    f1 = max(0.0, f11 + f12 * delta + f13 * zenith_r)
    f2 = f21 + f22 * delta + f23 * zenith_r

    a = max(0.0, aoi_cos)
    b = max(math.cos(85 * DEG2RAD), cos_z)

    isotropic = dhi_wm2 * (1 - f1) * (1 + math.cos(tilt_r)) / 2.0
    circumsolar = dhi_wm2 * f1 * (a / b)
    horizon_brightening = dhi_wm2 * f2 * math.sin(tilt_r)

    return max(0.0, isotropic + circumsolar + horizon_brightening)


def total_poa_irradiance(
    ghi_wm2: float,
    zenith_deg: float,
    sun_azimuth_deg: float,
    surface_tilt_deg: float,
    surface_azimuth_deg: float,
    day_of_year: int,
    albedo: float = 0.6,
) -> dict:
    """
    Total plane-of-array irradiance on a tilted surface = direct beam +
    Perez sky-diffuse + ground-reflected. This is the number the RC solver
    multiplies by surface absorptance to get solar gain, W/m^2.
    """
    dni = dni_from_ghi_disc(ghi_wm2, zenith_deg, day_of_year)
    dhi = dhi_from_ghi_dni(ghi_wm2, dni, zenith_deg)

    zenith_r = zenith_deg * DEG2RAD
    tilt_r = surface_tilt_deg * DEG2RAD
    aoi_cos = max(0.0, (
        math.cos(zenith_r) * math.cos(tilt_r)
        + math.sin(zenith_r) * math.sin(tilt_r)
        * math.cos((sun_azimuth_deg - surface_azimuth_deg) * DEG2RAD)
    ))
    beam_poa = dni * aoi_cos

    diffuse_poa = perez_diffuse_on_tilted_surface(
        dhi, dni, ghi_wm2, zenith_deg, surface_tilt_deg, surface_azimuth_deg,
        sun_azimuth_deg, day_of_year, albedo,
    )

    ground_poa = ghi_wm2 * albedo * (1 - math.cos(tilt_r)) / 2.0

    return {
        "dni": dni,
        "dhi": dhi,
        "beam_poa": beam_poa,
        "diffuse_poa": diffuse_poa,
        "ground_poa": ground_poa,
        "total_poa": beam_poa + diffuse_poa + ground_poa,
    }
