"""
The Phase 1 deliverable: given a geometry + materials + site climate, return
a 24-hour indoor air temperature curve.

Method: ISO 52016-1-style lumped-capacitance multi-node network. Each
envelope assembly (roof, walls, floor) is discretized into a node chain
(engine/solver/rc_network.py). All assemblies' inside-surface nodes couple
to ONE shared indoor-air node via convective resistance. All assemblies'
outside-surface nodes are driven by outdoor air temp (convection) + solar
gain (absorbed POA irradiance) + sky radiative loss (Swinbank/measured).
Infiltration couples the indoor-air node directly to outdoor air.

Time integration: implicit (backward) Euler. Chosen over explicit for
unconditional stability — envelope node capacitances span orders of
magnitude (thin insulation nodes vs. thick stone-mass nodes), so an
explicit scheme would need very small timesteps to stay stable. We use
5-minute internal substeps within each hourly climate-forcing interval
(linear interpolation of the forcing across the hour) for accuracy without
needing sub-minute steps.

Safety: every simulate() call runs the ACH/CO interlock (Phase 1 hard
gate) before returning. If it fails, the result says so explicitly —
callers (including the optimizer in Phase 3) MUST check result.safety.passed
and refuse to present a failing design as viable.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from engine.materials.loader import Material, MaterialsLibrary
from engine.solver.rc_network import ConstructionAssembly, Layer
from engine.solver.solar_geometry import sun_position, total_poa_irradiance
from engine.solver.sky_radiation import effective_sky_temp_k, net_radiative_loss_wm2, STEFAN_BOLTZMANN
from engine.solver.infiltration import combined_ach, check_safety_interlock, SafetyInterlockResult
from engine.solver.night_gate import NightGateSchedule, effective_leakage_area_cm2

CONVECTION_COEFF_INSIDE = 8.0   # W/(m^2 K), still indoor air, ASHRAE default
CONVECTION_COEFF_OUTSIDE_BASE = 15.0  # W/(m^2 K) at low wind, scales with wind speed
INDOOR_AIR_VOLUMETRIC_HEAT_CAPACITY = 1200.0  # J/(m^3 K), rho*cp for air


@dataclass
class SurfaceSpec:
    """One envelope surface (roof, a wall, floor) with its own construction and orientation."""
    name: str
    area_m2: float
    tilt_deg: float       # 0 = horizontal facing up (roof), 90 = vertical wall
    azimuth_deg: float    # compass bearing the surface faces (ignored for tilt=0/180)
    assembly: ConstructionAssembly
    is_ground_coupled: bool = False  # floor-on-ground: no solar/sky, fixed ground temp instead
    ground_temp_c: float = 5.0


@dataclass
class GeometrySpec:
    surfaces: list[SurfaceSpec]
    floor_area_m2: float
    ceiling_height_m: float
    leakage_area_cm2: float
    terrain_shelter_class: int = 3
    night_gate: NightGateSchedule | None = None  # Phase 5: None = no Night Gate fitted

    @property
    def volume_m3(self) -> float:
        return self.floor_area_m2 * self.ceiling_height_m


@dataclass
class SiteSpec:
    lat_deg: float
    lon_deg: float
    elevation_m: float
    albedo: float = 0.6


@dataclass
class InternalGains:
    sensible_heat_w: float = 150.0   # occupants + equipment, constant for simplicity
    co_generation_rate_lpm: float = 0.0  # 0 unless a combustion heater is modeled


@dataclass
class SimResult:
    hours: list[float]
    indoor_temp_c: list[float]
    outdoor_temp_c: list[float]
    safety: SafetyInterlockResult
    min_indoor_temp_c: float
    max_indoor_temp_c: float
    mean_ach: float
    night_gate_hours_closed: float = 0.0  # Phase 5: hours/day the gate was scheduled closed (0 if none fitted)


def _outside_convection_coeff(wind_speed_ms: float) -> float:
    """McAdams correlation, simplified: h = 5.7 + 3.8*V (W/m2K)."""
    return 5.7 + 3.8 * wind_speed_ms


def simulate(
    geometry: GeometrySpec,
    site: SiteSpec,
    outdoor_temp_c: list[float],       # hourly, len 24 (or more)
    ghi_wm2: list[float],              # hourly
    wind_ms: list[float],              # hourly
    lw_down_wm2: list[float] | None,   # hourly, optional (None -> Swinbank fallback)
    day_of_year: int,
    internal_gains: InternalGains,
    indoor_temp_initial_c: float = 10.0,
    substep_minutes: float = 5.0,
) -> SimResult:
    n_hours = len(outdoor_temp_c)
    substeps_per_hour = int(60 / substep_minutes)
    dt_s = substep_minutes * 60.0

    # --- build node networks for every surface ---
    for s in geometry.surfaces:
        if not s.assembly.nodes:
            s.assembly.build_nodes()

    # global state vector: [surface envelope nodes for each surface..., indoor_air]
    node_offsets = {}
    total_env_nodes = 0
    for s in geometry.surfaces:
        node_offsets[s.name] = total_env_nodes
        total_env_nodes += s.assembly.node_count()
    indoor_air_idx = total_env_nodes
    n_state = total_env_nodes + 1

    # initial state: everything at indoor_temp_initial_c, except ground-coupled
    # floor nodes start near ground temp
    T = np.full(n_state, indoor_temp_initial_c + 273.15)
    for s in geometry.surfaces:
        if s.is_ground_coupled:
            off = node_offsets[s.name]
            n = s.assembly.node_count()
            T[off:off + n] = s.ground_temp_c + 273.15

    indoor_air_capacitance = (
        INDOOR_AIR_VOLUMETRIC_HEAT_CAPACITY * geometry.volume_m3
    )

    hours_out, indoor_out, outdoor_out, ach_history = [], [], [], []

    for hour in range(n_hours):
        t_out_c0 = outdoor_temp_c[hour]
        t_out_c1 = outdoor_temp_c[min(hour + 1, n_hours - 1)]
        ghi0 = ghi_wm2[hour]
        ghi1 = ghi_wm2[min(hour + 1, n_hours - 1)]
        wind0 = wind_ms[hour]
        wind1 = wind_ms[min(hour + 1, n_hours - 1)]
        lw0 = lw_down_wm2[hour] if lw_down_wm2 else None
        lw1 = lw_down_wm2[min(hour + 1, n_hours - 1)] if lw_down_wm2 else None

        for sub in range(substeps_per_hour):
            frac = sub / substeps_per_hour
            t_out_c = t_out_c0 + frac * (t_out_c1 - t_out_c0)
            ghi = ghi0 + frac * (ghi1 - ghi0)
            wind = wind0 + frac * (wind1 - wind0)
            lw = None if lw0 is None else lw0 + frac * (lw1 - lw0)

            local_hour = (hour + frac) % 24
            sun = sun_position(site.lat_deg, site.lon_deg, day_of_year, local_hour)
            t_out_k = t_out_c + 273.15
            sky_temp_k = effective_sky_temp_k(t_out_k, lw)
            h_out = _outside_convection_coeff(wind)

            # --- assemble linear system: (C/dt + K) T_new = C/dt * T_old + Q ---
            A = np.zeros((n_state, n_state))
            b = np.zeros(n_state)

            for s in geometry.surfaces:
                off = node_offsets[s.name]
                nodes = s.assembly.nodes
                edges = s.assembly.edges
                area = s.area_m2

                for i, node in enumerate(nodes):
                    gi = off + i
                    C = node.capacitance_j_per_k * area
                    A[gi, gi] += C / dt_s
                    b[gi] += C / dt_s * T[gi]

                for e in edges:
                    ga, gb = off + e.node_a, off + e.node_b
                    cond = area / e.resistance_k_m2_per_w
                    A[ga, ga] += cond
                    A[gb, gb] += cond
                    A[ga, gb] -= cond
                    A[gb, ga] -= cond

                # outside boundary: node 0
                g_outside = off + 0
                if s.is_ground_coupled:
                    r_ground = 0.5  # fixed contact resistance to ground, m2K/W
                    cond_ground = area / r_ground
                    A[g_outside, g_outside] += cond_ground
                    b[g_outside] += cond_ground * (s.ground_temp_c + 273.15)
                else:
                    cond_conv = area * h_out
                    A[g_outside, g_outside] += cond_conv
                    b[g_outside] += cond_conv * t_out_k

                    poa = total_poa_irradiance(
                        ghi, sun.zenith_deg, sun.azimuth_deg,
                        s.tilt_deg, s.azimuth_deg, day_of_year, site.albedo,
                    )
                    absorptance = 0.6  # mid-tone exterior finish, default
                    solar_gain_w = poa["total_poa"] * absorptance * area
                    b[g_outside] += solar_gain_w

                    # linearized radiative loss to sky (around current node temp)
                    surf_t_k = T[g_outside]
                    rad_loss_wm2 = net_radiative_loss_wm2(surf_t_k, sky_temp_k)
                    # linearize: treat as a conductance around current temp
                    if surf_t_k > sky_temp_k:
                        h_rad = 4 * 0.9 * STEFAN_BOLTZMANN * surf_t_k**3
                        A[g_outside, g_outside] += area * h_rad
                        b[g_outside] += area * h_rad * sky_temp_k
                    else:
                        b[g_outside] -= rad_loss_wm2 * area

                # inside boundary: last node couples to indoor air
                g_inside = off + len(nodes) - 1
                cond_conv_in = area * CONVECTION_COEFF_INSIDE
                A[g_inside, g_inside] += cond_conv_in
                A[g_inside, indoor_air_idx] -= cond_conv_in
                A[indoor_air_idx, indoor_air_idx] += cond_conv_in
                A[indoor_air_idx, g_inside] -= cond_conv_in

            # indoor air node: capacitance + internal gains + infiltration
            A[indoor_air_idx, indoor_air_idx] += indoor_air_capacitance / dt_s
            b[indoor_air_idx] += indoor_air_capacitance / dt_s * T[indoor_air_idx]
            b[indoor_air_idx] += internal_gains.sensible_heat_w

            ach = combined_ach(
                wind, T[indoor_air_idx], t_out_k,
                effective_leakage_area_cm2(local_hour, geometry.leakage_area_cm2, geometry.night_gate),
                geometry.volume_m3,
                geometry.ceiling_height_m, site.elevation_m,
                geometry.terrain_shelter_class,
            )
            ach_history.append(ach)
            infiltration_cond = (
                ach / 3600.0 * geometry.volume_m3 * INDOOR_AIR_VOLUMETRIC_HEAT_CAPACITY
            )
            A[indoor_air_idx, indoor_air_idx] += infiltration_cond
            b[indoor_air_idx] += infiltration_cond * t_out_k

            T = np.linalg.solve(A, b)

        hours_out.append(hour + 1)
        indoor_out.append(T[indoor_air_idx] - 273.15)
        outdoor_out.append(t_out_c1)

    mean_ach = float(np.mean(ach_history)) if ach_history else 0.0
    safety = check_safety_interlock(
        mean_ach, internal_gains.co_generation_rate_lpm, geometry.volume_m3
    )

    return SimResult(
        hours=hours_out,
        indoor_temp_c=indoor_out,
        outdoor_temp_c=outdoor_out,
        safety=safety,
        min_indoor_temp_c=min(indoor_out),
        max_indoor_temp_c=max(indoor_out),
        mean_ach=mean_ach,
        night_gate_hours_closed=geometry.night_gate.hours_closed_per_day() if geometry.night_gate else 0.0,
    )


def make_simple_box_geometry(
    materials_lib: MaterialsLibrary,
    wall_material_id: str,
    insulation_material_id: str,
    wall_thickness_m: float,
    insulation_thickness_m: float,
    floor_area_m2: float,
    ceiling_height_m: float,
    leakage_area_cm2: float = 200.0,
    night_gate: NightGateSchedule | None = None,
) -> GeometrySpec:
    """
    Convenience builder: a simple rectangular single-room shelter (4 walls,
    flat roof, ground floor), same wall+insulation construction on all
    vertical surfaces and the roof, for quick testing / Phase 2 validation.
    A real design tool (Phase 3/4) will vary constructions per surface.
    """
    wall_mat = materials_lib.get(wall_material_id)
    ins_mat = materials_lib.get(insulation_material_id)

    side = math.sqrt(floor_area_m2)

    def make_assembly(name: str) -> ConstructionAssembly:
        a = ConstructionAssembly(
            name=name,
            layers=[
                Layer(material=wall_mat, thickness_m=wall_thickness_m, n_nodes=3),
                Layer(material=ins_mat, thickness_m=insulation_thickness_m, n_nodes=2),
            ],
        )
        a.build_nodes()
        return a

    surfaces = [
        SurfaceSpec("wall_N", side * ceiling_height_m, 90, 0, make_assembly("wall_N")),
        SurfaceSpec("wall_E", side * ceiling_height_m, 90, 90, make_assembly("wall_E")),
        SurfaceSpec("wall_S", side * ceiling_height_m, 90, 180, make_assembly("wall_S")),
        SurfaceSpec("wall_W", side * ceiling_height_m, 90, 270, make_assembly("wall_W")),
        SurfaceSpec("roof", floor_area_m2, 5, 180, make_assembly("roof")),
        SurfaceSpec(
            "floor", floor_area_m2, 0, 0, make_assembly("floor"),
            is_ground_coupled=True, ground_temp_c=2.0,
        ),
    ]

    return GeometrySpec(
        surfaces=surfaces,
        floor_area_m2=floor_area_m2,
        ceiling_height_m=ceiling_height_m,
        leakage_area_cm2=leakage_area_cm2,
        night_gate=night_gate,
    )
