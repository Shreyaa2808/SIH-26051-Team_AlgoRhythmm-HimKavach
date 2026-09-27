"""
Phase 2 validation, part 3: ANSYS calibration harness.

WHAT THIS IS (and isn't):
  The roadmap's ML+ANSYS story (see HIMKAVACH_Roadmap.md section E) says
  ANSYS runs a SMALL number of times per site/construction type to
  CALIBRATE the fast solver/surrogate, never inside the live optimization
  loop. This module is that calibration step: it runs our own RC-network
  solver on a handful of reference designs (data/validation/
  ansys_calibration_runs.json) and reports how far off we are from real
  ANSYS results, plus the wall-clock speedup we get by not running ANSYS
  for every candidate.

  It does NOT invent ANSYS numbers. Every run in the calibration file
  starts with status:"pending" and null ansys_* fields; a real ANSYS run
  has to be performed by the team and the results filled in by hand (see
  the JSON file's _how_to_fill_in). This module reports "pending" entries
  honestly instead of pretending they were validated -- same discipline
  as validate_uvalue.py / validate_transient.py and materials.json's
  cost_note fields (no fabricated numbers, ever).

WHAT IT PRODUCES, once entries are filled in:
  - Per-run: computed vs ANSYS min indoor temp, absolute error (deg C),
    our wall-clock time, ANSYS wall-clock time, speedup factor.
  - Aggregate: MAE across all *complete* runs (pending runs excluded).
  - Exposed via GET /validation/ansys-benchmark for the frontend's
    "ANSYS Benchmark" dashboard page (Phase 4a/4c UI).
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

from engine.climate.design_days import resolve_design_day
from engine.materials.loader import MaterialsLibrary
from engine.solver.thermal_solver import InternalGains, SiteSpec, make_simple_box_geometry, simulate

CALIBRATION_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "validation" / "ansys_calibration_runs.json"
)

# kept in sync with api/routes/simulate.py::SITE_COORDS -- duplicated here
# (rather than imported) so this module has no dependency on the api/
# package, which matters if it's ever run as a standalone offline script.
SITE_COORDS = {
    "leh": {"lat": 34.1526, "lon": 77.5771, "elevation_m": 3500},
    "siachen": {"lat": 35.5000, "lon": 77.0000, "elevation_m": 5500},
    "dras": {"lat": 34.4333, "lon": 75.7667, "elevation_m": 3230},
}

CLIMATE_DIR = Path(__file__).resolve().parents[2] / "data" / "climate"


@dataclass
class CalibrationRunResult:
    id: str
    label: str
    status: str  # "complete" | "pending" | "skipped_no_climate_data"
    ours_min_indoor_temp_c: float | None
    ansys_min_indoor_temp_c: float | None
    abs_error_c: float | None
    ours_wall_clock_s: float | None
    ansys_wall_clock_s: float | None
    speedup_x: float | None
    note: str


@dataclass
class BenchmarkSummary:
    runs: list[CalibrationRunResult]
    n_complete: int
    n_pending: int
    mae_c: float | None  # None if no complete runs yet
    mean_speedup_x: float | None


def _load_climate_for_site(site_id: str):
    from data.climate.loader import ClimateSeries

    matches = sorted(CLIMATE_DIR.glob(f"{site_id}_*.json"))
    if not matches:
        return None
    return ClimateSeries.from_power_json(matches[0], site_id=site_id)


def _load_calibration_runs() -> list[dict]:
    return json.loads(CALIBRATION_PATH.read_text())["runs"]


def run_ansys_benchmark() -> BenchmarkSummary:
    lib = MaterialsLibrary()
    results: list[CalibrationRunResult] = []

    for run in _load_calibration_runs():
        site_id = run["site_id"]
        if site_id not in SITE_COORDS:
            results.append(CalibrationRunResult(
                id=run["id"], label=run["label"], status="skipped_no_climate_data",
                ours_min_indoor_temp_c=None, ansys_min_indoor_temp_c=None, abs_error_c=None,
                ours_wall_clock_s=None, ansys_wall_clock_s=None, speedup_x=None,
                note=f"Unknown site_id '{site_id}'.",
            ))
            continue

        climate = _load_climate_for_site(site_id)
        if climate is None:
            results.append(CalibrationRunResult(
                id=run["id"], label=run["label"], status="skipped_no_climate_data",
                ours_min_indoor_temp_c=None, ansys_min_indoor_temp_c=None, abs_error_c=None,
                ours_wall_clock_s=None, ansys_wall_clock_s=None, speedup_x=None,
                note=(
                    f"No cached climate data for '{site_id}'. Run "
                    f"data/climate/fetch_nasa_power.py first."
                ),
            ))
            continue

        try:
            day_of_year = resolve_design_day(climate, run["design_day"])
        except ValueError as e:
            results.append(CalibrationRunResult(
                id=run["id"], label=run["label"], status="skipped_no_climate_data",
                ours_min_indoor_temp_c=None, ansys_min_indoor_temp_c=None, abs_error_c=None,
                ours_wall_clock_s=None, ansys_wall_clock_s=None, speedup_x=None,
                note=str(e),
            ))
            continue

        start_idx = (day_of_year - 1) * 24
        day = climate.hour_slice(start_idx, 24)

        coords = SITE_COORDS[site_id]
        site = SiteSpec(lat_deg=coords["lat"], lon_deg=coords["lon"], elevation_m=coords["elevation_m"])
        geometry = make_simple_box_geometry(
            lib,
            wall_material_id=run["wall_material_id"],
            insulation_material_id=run["insulation_material_id"],
            wall_thickness_m=run["wall_thickness_m"],
            insulation_thickness_m=run["insulation_thickness_m"],
            floor_area_m2=run["floor_area_m2"],
            ceiling_height_m=run["ceiling_height_m"],
            leakage_area_cm2=run["leakage_area_cm2"],
        )
        gains = InternalGains(sensible_heat_w=run["sensible_heat_w"])

        t0 = time.perf_counter()
        result = simulate(
            geometry=geometry, site=site,
            outdoor_temp_c=day.temp_c, ghi_wm2=day.ghi_wm2, wind_ms=day.wind_ms,
            lw_down_wm2=day.lw_down_wm2, day_of_year=day_of_year,
            internal_gains=gains, indoor_temp_initial_c=-5.0,
        )
        ours_wall_clock_s = time.perf_counter() - t0
        ours_min = result.min_indoor_temp_c

        ansys_min = run.get("ansys_min_indoor_temp_c")
        ansys_wall_clock = run.get("ansys_wall_clock_s")

        if run.get("status") != "complete" or ansys_min is None:
            results.append(CalibrationRunResult(
                id=run["id"], label=run["label"], status="pending",
                ours_min_indoor_temp_c=round(ours_min, 3),
                ansys_min_indoor_temp_c=None, abs_error_c=None,
                ours_wall_clock_s=round(ours_wall_clock_s, 4),
                ansys_wall_clock_s=None, speedup_x=None,
                note="Real ANSYS result not yet filled in — see data/validation/ansys_calibration_runs.json.",
            ))
            continue

        abs_error = abs(ours_min - ansys_min)
        speedup = (ansys_wall_clock / ours_wall_clock_s) if ansys_wall_clock else None
        results.append(CalibrationRunResult(
            id=run["id"], label=run["label"], status="complete",
            ours_min_indoor_temp_c=round(ours_min, 3),
            ansys_min_indoor_temp_c=round(ansys_min, 3),
            abs_error_c=round(abs_error, 3),
            ours_wall_clock_s=round(ours_wall_clock_s, 4),
            ansys_wall_clock_s=ansys_wall_clock,
            speedup_x=round(speedup, 1) if speedup else None,
            note="",
        ))

    complete = [r for r in results if r.status == "complete"]
    mae = round(sum(r.abs_error_c for r in complete) / len(complete), 3) if complete else None
    speedups = [r.speedup_x for r in complete if r.speedup_x is not None]
    mean_speedup = round(sum(speedups) / len(speedups), 1) if speedups else None

    return BenchmarkSummary(
        runs=results,
        n_complete=len(complete),
        n_pending=len([r for r in results if r.status == "pending"]),
        mae_c=mae,
        mean_speedup_x=mean_speedup,
    )


if __name__ == "__main__":
    summary = run_ansys_benchmark()
    print(f"{'Run':<32} {'Status':<12} {'Ours':>8} {'ANSYS':>8} {'Err':>7} {'Speedup':>9}")
    for r in summary.runs:
        print(
            f"{r.label:<32.32} {r.status:<12} "
            f"{r.ours_min_indoor_temp_c if r.ours_min_indoor_temp_c is not None else '-':>8} "
            f"{r.ansys_min_indoor_temp_c if r.ansys_min_indoor_temp_c is not None else '-':>8} "
            f"{r.abs_error_c if r.abs_error_c is not None else '-':>7} "
            f"{str(r.speedup_x) + 'x' if r.speedup_x else '-':>9}"
        )
    print(f"\nMAE (complete runs only): {summary.mae_c}")
    print(f"Mean speedup: {summary.mean_speedup_x}")
    print(f"{summary.n_complete} complete, {summary.n_pending} pending real ANSYS numbers.")
