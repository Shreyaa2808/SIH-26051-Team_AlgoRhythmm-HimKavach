"""
Phase 2 validation, part 2: transient hero-number run.

Runs the full RC solver for two constructions at the same Leh January
conditions -- a traditional uninsulated stone/adobe room (roughly matching
what older Ladakhi buildings and the "control building" in historical
accounts like the 1982 Trombe-wall reports used) vs an insulated design
close to the HIAL PreFreb wall spec -- and reports the indoor-temperature
delta. This is the "hero number" for the pitch.

Forcing data: we don't have real Leh hourly data cached yet (needs
fetch_nasa_power.py run locally), so this uses the published Leh TMY
January MONTHLY MEAN (-12.7C, from leh_hial_reference.json, itself sourced
from NREL's Leh TMY file) as the day's mean, with a synthetic diurnal swing
shaped from the same solar/wind assumptions as our smoke tests. This is
explicitly a proxy, not a full validation run -- swap in real hourly NASA
POWER data (or better, the actual NREL Leh TMY hourly file) once fetched,
and re-run for a real apples-to-apples comparison against the FHNW
benchmark numbers.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from engine.materials.loader import MaterialsLibrary
from engine.solver.thermal_solver import (
    InternalGains,
    SiteSpec,
    make_simple_box_geometry,
    simulate,
)

REFERENCE_PATH = Path(__file__).resolve().parents[2] / "data" / "climate" / "leh_hial_reference.json"


def make_proxy_january_day(mean_temp_c: float) -> tuple[list[float], list[float], list[float]]:
    """
    Synthetic 24h profile anchored to a real published monthly mean, since
    we don't have real hourly data cached yet. Diurnal amplitude (+/-8C) and
    solar/wind shape are the same assumptions used in the Phase 1 smoke
    tests -- NOT independently validated, flag this in the limitations slide.
    """
    hours = list(range(24))
    outdoor_temp_c = [mean_temp_c + 8 * math.sin((h - 9) / 24 * 2 * math.pi) for h in hours]
    ghi = [max(0, 700 * math.sin((h - 6) / 12 * math.pi)) if 6 <= h <= 18 else 0 for h in hours]
    wind = [3.0] * 24
    return outdoor_temp_c, ghi, wind


def _run_with_spinup(geometry, site, outdoor_temp_c, ghi, wind, gains, jan_mean, spinup_days: int = 6):
    """
    High-thermal-mass constructions (thick stone) have a time constant
    longer than 24h, so a single-day run from an arbitrary initial
    condition mostly reports that initial condition, not real behavior --
    the HIAL/FHNW report itself uses a 20-day pre-simulation period for
    the same reason (see leh_hial_reference.json _citation). We repeat the
    same day's forcing for spinup_days to let the system approach its
    periodic steady state, then simulate one more "read" day and report that.
    """
    n = spinup_days + 1
    outdoor_rep = outdoor_temp_c * n
    ghi_rep = ghi * n
    wind_rep = wind * n

    full_result = simulate(
        geometry, site, outdoor_rep, ghi_rep, wind_rep, None,
        day_of_year=15, internal_gains=gains, indoor_temp_initial_c=jan_mean,
    )
    # slice out just the final day
    last_day_indoor = full_result.indoor_temp_c[-24:]
    last_day_outdoor = full_result.outdoor_temp_c[-24:]
    return last_day_indoor, last_day_outdoor, full_result.safety, full_result.mean_ach


def run_hero_comparison() -> dict:
    ref = json.loads(REFERENCE_PATH.read_text())
    jan_mean = ref["leh_tmy_monthly_mean_temp_c"]["jan"]
    ground_temp = ref["ground_temp_monthly_c"]["jan"]

    outdoor_temp_c, ghi, wind = make_proxy_january_day(jan_mean)

    lib = MaterialsLibrary()
    site = SiteSpec(lat_deg=34.1526, lon_deg=77.5771, elevation_m=3500)
    gains = InternalGains(sensible_heat_w=200.0, co_generation_rate_lpm=0.0)

    # Traditional: thick stone wall, minimal insulation (representative of
    # older Ladakhi construction before PSH retrofit programs)
    trad_geom = make_simple_box_geometry(
        lib, "local_stone_masonry", "mineral_wool",
        wall_thickness_m=0.4, insulation_thickness_m=0.02,
        floor_area_m2=16.0, ceiling_height_m=2.4,
    )
    for s in trad_geom.surfaces:
        if s.is_ground_coupled:
            s.ground_temp_c = ground_temp

    trad_indoor, trad_outdoor, trad_safety, trad_ach = _run_with_spinup(
        trad_geom, site, outdoor_temp_c, ghi, wind, gains, jan_mean
    )

    # Insulated: close to HIAL PreFreb spec (strawclay + 10cm EPS)
    ins_geom = make_simple_box_geometry(
        lib, "strawclay_block", "expanded_polystyrene_eps",
        wall_thickness_m=0.25, insulation_thickness_m=0.10,
        floor_area_m2=16.0, ceiling_height_m=2.4,
    )
    for s in ins_geom.surfaces:
        if s.is_ground_coupled:
            s.ground_temp_c = ground_temp

    ins_indoor, ins_outdoor, ins_safety, ins_ach = _run_with_spinup(
        ins_geom, site, outdoor_temp_c, ghi, wind, gains, jan_mean
    )

    return {
        "outdoor_mean_c": jan_mean,
        "outdoor_min_c": min(outdoor_temp_c),
        "outdoor_max_c": max(outdoor_temp_c),
        "traditional": {
            "wall_u_value": trad_geom.surfaces[0].assembly.u_value(),
            "indoor_min_c": min(trad_indoor),
            "indoor_max_c": max(trad_indoor),
            "safety_passed": trad_safety.passed,
        },
        "insulated": {
            "wall_u_value": ins_geom.surfaces[0].assembly.u_value(),
            "indoor_min_c": min(ins_indoor),
            "indoor_max_c": max(ins_indoor),
            "safety_passed": ins_safety.passed,
        },
        "hero_delta_min_temp_c": min(ins_indoor) - min(trad_indoor),
    }


if __name__ == "__main__":
    r = run_hero_comparison()
    print(f"Leh, January, proxy day (mean {r['outdoor_mean_c']}C, "
          f"range {r['outdoor_min_c']:.1f} to {r['outdoor_max_c']:.1f}C)")
    print()
    print(f"{'':20} {'U-value':>10} {'Indoor min':>12} {'Indoor max':>12} {'Safety':>8}")
    for label, key in [("Traditional", "traditional"), ("Insulated (PreFreb)", "insulated")]:
        d = r[key]
        print(f"{label:20} {d['wall_u_value']:>8.3f}   {d['indoor_min_c']:>10.2f}C  "
              f"{d['indoor_max_c']:>10.2f}C  {str(d['safety_passed']):>8}")
    print()
    print(f"HERO NUMBER: insulation raises the coldest indoor hour by "
          f"{r['hero_delta_min_temp_c']:.1f}C ({r['traditional']['indoor_min_c']:.1f}C -> "
          f"{r['insulated']['indoor_min_c']:.1f}C)")
