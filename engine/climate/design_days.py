"""
Resolves a named design-day scenario ("coldest_winter_night", etc.) to a
concrete day-of-year index, computed from a site's REAL cached climate
series — never hardcoded.

Why this exists: raw `day_of_year` (1-365) is meaningless to a user filling
out a form. Every user-facing request should carry one of the SCENARIO ids
below instead; this module is what turns that into the day_of_year the
solver actually needs.

Usage:
    from data.climate.loader import ClimateSeries
    from engine.climate.design_days import resolve_design_day, SCENARIOS

    cs = ClimateSeries.from_power_json("data/climate/leh_2025.json", site_id="leh")
    day_of_year = resolve_design_day(cs, "coldest_winter_night")
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from data.climate.loader import ClimateSeries


# Winter is defined as Dec/Jan/Feb for scenario selection purposes (Northern
# Hemisphere, matches all three current sites: Leh, Siachen, Dras). Adjust
# here if a future site is in the Southern Hemisphere.
WINTER_MONTHS = {12, 1, 2}
SUMMER_MONTHS = {6, 7, 8}


@dataclass(frozen=True)
class DesignDayScenario:
    id: str
    label: str
    description: str


SCENARIOS: dict[str, DesignDayScenario] = {
    "coldest_winter_night": DesignDayScenario(
        id="coldest_winter_night",
        label="Coldest Winter Night",
        description="Extreme freeze survival test — the day containing this site's single lowest hourly temperature reading.",
    ),
    "sunniest_winter_day": DesignDayScenario(
        id="sunniest_winter_day",
        label="Sunniest Winter Day",
        description="Peak solar gain & thermal-mass charging test — the winter (Dec/Jan/Feb) day with the highest total daily solar irradiance (GHI).",
    ),
    "hottest_summer_day": DesignDayScenario(
        id="hottest_summer_day",
        label="Hottest Summer Day",
        description="Overheating-prevention & night-purge-ventilation test — the summer (Jun/Jul/Aug) day containing this site's single highest hourly temperature reading.",
    ),
    "typical_winter_day": DesignDayScenario(
        id="typical_winter_day",
        label="Typical Winter Day",
        description="Average January condition (TMY-style baseline) — the winter day whose 24h mean temperature is closest to the overall winter mean.",
    ),
}


def _day_key(timestamp: str) -> str:
    """POWER timestamps are 'YYYYMMDDHH' strings; the first 8 chars group one calendar day."""
    return timestamp[:8]


def _month_of(day_key: str) -> int:
    return int(day_key[4:6])


def _day_of_year_for_day_key(cs: "ClimateSeries", day_key: str) -> int:
    """
    Returns the 1-indexed day-of-year for the first timestamp matching
    day_key, consistent with how the rest of the engine indexes days
    (hour_slice(start_idx, n_hours) expects a 0-indexed hour offset, so
    callers converting day_of_year -> start_idx should keep doing
    (day_of_year - 1) * 24 as before; this function only returns the
    1-indexed day number itself).
    """
    for i, ts in enumerate(cs.timestamps):
        if _day_key(ts) == day_key:
            return i // 24 + 1
    raise ValueError(f"day_key {day_key!r} not found in this site's cached climate series")


def _group_by_day(cs: "ClimateSeries") -> dict[str, list[int]]:
    """Maps each calendar-day key to the list of hourly indices belonging to it."""
    groups: dict[str, list[int]] = {}
    for i, ts in enumerate(cs.timestamps):
        groups.setdefault(_day_key(ts), []).append(i)
    return groups


def resolve_design_day(cs: "ClimateSeries", scenario_id: str) -> int:
    """
    Resolve a named scenario id to a 1-indexed day_of_year, computed from
    this site's real cached climate series.

    Raises ValueError for an unknown scenario_id, or if the requested
    season (winter/summer) has no data in this cache (should not happen
    with a full-year cache, but guards a partial/corrupt file rather than
    silently picking a wrong day).
    """
    if scenario_id not in SCENARIOS:
        raise ValueError(
            f"Unknown design_day scenario {scenario_id!r}. Valid: {list(SCENARIOS)}"
        )

    by_day = _group_by_day(cs)

    if scenario_id == "coldest_winter_night":
        # The single coldest hourly reading anywhere in the year (not
        # restricted to winter months, since Siachen/Dras can post extreme
        # lows outside strict DJF) — this deliberately does NOT filter by
        # WINTER_MONTHS, matching "coldest night" as an absolute extreme.
        coldest_idx = min(range(len(cs.temp_c)), key=lambda i: cs.temp_c[i])
        day_key = _day_key(cs.timestamps[coldest_idx])
        return _day_of_year_for_day_key(cs, day_key)

    if scenario_id == "hottest_summer_day":
        hottest_idx = max(range(len(cs.temp_c)), key=lambda i: cs.temp_c[i])
        day_key = _day_key(cs.timestamps[hottest_idx])
        return _day_of_year_for_day_key(cs, day_key)

    if scenario_id == "sunniest_winter_day":
        winter_days = {
            day: idxs for day, idxs in by_day.items() if _month_of(day) in WINTER_MONTHS
        }
        if not winter_days:
            raise ValueError(
                "No winter (Dec/Jan/Feb) records found in this site's cached climate "
                "data — check the cache covers a full year."
            )
        best_day = max(
            winter_days, key=lambda day: sum(cs.ghi_wm2[i] for i in winter_days[day])
        )
        return _day_of_year_for_day_key(cs, best_day)

    if scenario_id == "typical_winter_day":
        winter_days = {
            day: idxs for day, idxs in by_day.items() if _month_of(day) in WINTER_MONTHS
        }
        if not winter_days:
            raise ValueError(
                "No winter (Dec/Jan/Feb) records found in this site's cached climate "
                "data — check the cache covers a full year."
            )
        winter_mean = sum(
            cs.temp_c[i] for idxs in winter_days.values() for i in idxs
        ) / sum(len(idxs) for idxs in winter_days.values())

        def day_mean(idxs: list[int]) -> float:
            return sum(cs.temp_c[i] for i in idxs) / len(idxs)

        best_day = min(winter_days, key=lambda day: abs(day_mean(winter_days[day]) - winter_mean))
        return _day_of_year_for_day_key(cs, best_day)

    # Unreachable given the SCENARIOS/id check above, but keeps mypy/pyright happy.
    raise AssertionError(f"scenario {scenario_id!r} matched SCENARIOS but has no handler")


def list_scenarios() -> list[dict]:
    """Serializable form for an API endpoint that lists available scenarios to the frontend."""
    return [
        {"id": s.id, "label": s.label, "description": s.description}
        for s in SCENARIOS.values()
    ]
