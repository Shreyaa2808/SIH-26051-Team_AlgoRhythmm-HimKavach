# Integration guide — Named Design-Day Scenarios

This zip contains only NEW files. Nothing existing is overwritten, because I
don't have your current `api/routes/simulate.py` / `optimize.py` /
`retrofit.py` / `api/main.py` in front of me — copying these in blind risks
clobbering code you've since changed. Follow the 4 steps below by hand
(each is a small, targeted edit).

## Files in this zip (copy in as-is, no conflicts)

```
engine/climate/__init__.py          <- new package
engine/climate/design_days.py       <- the scenario resolver (tested, see below)
api/routes/design_days.py           <- new GET /design-day-scenarios endpoint
```

Copy these three into your repo at the exact same relative paths.

## Step 1 — Wire the new route into api/main.py

Add, alongside your existing router imports:

```python
from api.routes.design_days import router as design_days_router
```

and alongside your existing `app.include_router(...)` calls:

```python
app.include_router(design_days_router)
```

## Step 2 — Add an optional `design_day` field to each request model

In `api/routes/simulate.py`, `api/routes/optimize.py`, and
`api/routes/retrofit.py`, find the Pydantic request model (`SimulateRequest`,
`OptimizeRequest`, `RetrofitRankRequest`) and add:

```python
design_day: str | None = None   # e.g. "coldest_winter_night" — see engine/climate/design_days.SCENARIOS
```

Keep `day_of_year` as-is for backward compatibility — do NOT remove it yet.
`design_day`, when provided, should take priority and override whatever
`day_of_year` was sent (or defaulted to).

## Step 3 — Resolve it before running the solver

In each route handler, right after you load the climate series (wherever
`_load_climate_for_site(...)` or equivalent is called), add:

```python
from engine.climate.design_days import resolve_design_day

climate = _load_climate_for_site(req.site_id)  # you already have this line

if req.design_day is not None:
    day_of_year = resolve_design_day(climate, req.design_day)
else:
    day_of_year = req.day_of_year  # existing behavior, unchanged
```

Then use `day_of_year` (the local variable) everywhere you currently use
`req.day_of_year` further down in that function.

## Step 4 — Frontend contract (tell Person B)

- `GET /design-day-scenarios` returns:
  ```json
  [
    {"id": "coldest_winter_night", "label": "Coldest Winter Night", "description": "..."},
    {"id": "sunniest_winter_day", "label": "Sunniest Winter Day", "description": "..."},
    {"id": "hottest_summer_day", "label": "Hottest Summer Day", "description": "..."},
    {"id": "typical_winter_day", "label": "Typical Winter Day", "description": "..."}
  ]
  ```
  Use this to populate the scenario picker — don't hardcode the four names
  in the frontend, since more scenarios may be added later.
- When calling `/simulate`, `/optimize`, or `/retrofit/rank`, send
  `"design_day": "coldest_winter_night"` (the `id` from above) instead of a
  raw `day_of_year` integer. `day_of_year` still works if sent directly
  (back-compat / debugging), but the UI should never expose it to a user.

## Testing this yourself before committing

The resolver has no dependency on FastAPI or your live server — you can
sanity-check it directly against your real cached climate data:

```bash
python3 -c "
from data.climate.loader import ClimateSeries
from engine.climate.design_days import resolve_design_day, SCENARIOS

cs = ClimateSeries.from_power_json('data/climate/leh_2025.json', site_id='leh')
for scenario_id in SCENARIOS:
    print(scenario_id, '->', resolve_design_day(cs, scenario_id))
"
```

You should get four different day-of-year numbers, roughly: a January date
for coldest_winter_night, a July date for hottest_summer_day, and two
winter dates (Dec/Jan/Feb) for the other two — sane, non-overlapping days,
not all clustered together.

I validated the resolution logic against synthetic data with known injected
extremes (a forced coldest hour, hottest hour, and sunniest day) before
sending this — all four scenarios resolved to exactly the correct
day-of-year in that test. Re-run the same style of check against your real
Leh/Siachen/Dras data once you've wired it in, and paste me the output.
