"""
Loads a cached NASA POWER JSON file (from fetch_nasa_power.py) and normalizes
it into plain hourly arrays the physics solver can consume directly.

Usage:
    from data.climate.loader import ClimateSeries
    cs = ClimateSeries.from_power_json("data/climate/leh_2025.json")
    cs.temp_c[0]  ls data/climate/     # T2M at hour 0
    cs.ghi_wm2[0]      # ALLSKY_SFC_SW_DWN at hour 0
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ClimateSeries:
    site_id: str
    timestamps: list[str]           # "YYYYMMDDHH" strings as POWER returns them
    temp_c: list[float]
    rh_pct: list[float]
    wind_ms: list[float]
    ghi_wm2: list[float]
    pressure_kpa: list[float]
    lw_down_wm2: list[float]

    @classmethod
    def from_power_json(cls, path: str | Path, site_id: str | None = None) -> "ClimateSeries":
        path = Path(path)
        raw = json.loads(path.read_text())
        params = raw["properties"]["parameter"]

        timestamps = list(params["T2M"].keys())
        return cls(
            site_id=site_id or path.stem,
            timestamps=timestamps,
            temp_c=[params["T2M"][t] for t in timestamps],
            rh_pct=[params["RH2M"][t] for t in timestamps],
            wind_ms=[params["WS10M"][t] for t in timestamps],
            ghi_wm2=[params["ALLSKY_SFC_SW_DWN"][t] for t in timestamps],
            pressure_kpa=[params["PS"][t] for t in timestamps],
            lw_down_wm2=[params["ALLSKY_SFC_LW_DWN"][t] for t in timestamps],
        )

    def hour_slice(self, start_idx: int, n_hours: int) -> "ClimateSeries":
        s = slice(start_idx, start_idx + n_hours)
        return ClimateSeries(
            site_id=self.site_id,
            timestamps=self.timestamps[s],
            temp_c=self.temp_c[s],
            rh_pct=self.rh_pct[s],
            wind_ms=self.wind_ms[s],
            ghi_wm2=self.ghi_wm2[s],
            pressure_kpa=self.pressure_kpa[s],
            lw_down_wm2=self.lw_down_wm2[s],
        )


if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else "data/climate/leh_2025.json"
    cs = ClimateSeries.from_power_json(p)
    print(f"{cs.site_id}: {len(cs.timestamps)} hourly records")
    print(f"first hour: T={cs.temp_c[0]}C  GHI={cs.ghi_wm2[0]}W/m2  wind={cs.wind_ms[0]}m/s")
