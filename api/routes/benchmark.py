"""
GET /validation/ansys-benchmark — Phase 2 UI deliverable.

Exposes engine/validation/ansys_benchmark.py over HTTP so Person B can
build the "ANSYS Benchmark" dashboard page (Phase 4a/4c) without needing
to run the Python harness manually. Runs are always computed fresh (the
solver is fast — sub-second per run — so no caching needed yet).
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from engine.validation.ansys_benchmark import run_ansys_benchmark

router = APIRouter()


class CalibrationRunOut(BaseModel):
    id: str
    label: str
    status: str
    ours_min_indoor_temp_c: float | None
    ansys_min_indoor_temp_c: float | None
    abs_error_c: float | None
    ours_wall_clock_s: float | None
    ansys_wall_clock_s: float | None
    speedup_x: float | None
    note: str


class BenchmarkSummaryOut(BaseModel):
    runs: list[CalibrationRunOut]
    n_complete: int
    n_pending: int
    mae_c: float | None
    mean_speedup_x: float | None
    note: str = (
        "Runs with status='pending' have no real ANSYS number on file yet — "
        "their abs_error_c/speedup_x are null, not zero. mae_c/mean_speedup_x "
        "are computed over complete runs only and are null if none are complete."
    )


@router.get("/validation/ansys-benchmark", response_model=BenchmarkSummaryOut)
def get_ansys_benchmark() -> BenchmarkSummaryOut:
    summary = run_ansys_benchmark()
    return BenchmarkSummaryOut(
        runs=[
            CalibrationRunOut(
                id=r.id, label=r.label, status=r.status,
                ours_min_indoor_temp_c=r.ours_min_indoor_temp_c,
                ansys_min_indoor_temp_c=r.ansys_min_indoor_temp_c,
                abs_error_c=r.abs_error_c,
                ours_wall_clock_s=r.ours_wall_clock_s,
                ansys_wall_clock_s=r.ansys_wall_clock_s,
                speedup_x=r.speedup_x,
                note=r.note,
            )
            for r in summary.runs
        ],
        n_complete=summary.n_complete,
        n_pending=summary.n_pending,
        mae_c=summary.mae_c,
        mean_speedup_x=summary.mean_speedup_x,
    )
