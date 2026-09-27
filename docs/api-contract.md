# HIMKAVACH / LADAKH-ADAPT — API Contract (Phase 4 lock)

This is the outstanding item flagged at the end of every phase in `README.md`
since Phase 1. It's written from the actual current code (`api/routes/*.py`),
not from the original plan — a few things in the roadmap changed shape along
the way, noted below. Person B: build the Phase 4a/4b/4c frontend against
this document, not against the roadmap's original field list.

## What changed vs. the original plan (read this first)

- **No `mode: "new" | "retrofit"` field exists, and none is needed.**
  Retrofit and new-build turned out to need different-enough required-field
  rules (retrofit has *no* defaults — see `RetrofitBaseline` — new-build has
  sensible defaults everywhere) that a shared endpoint with a mode flag would
  need two almost-entirely-different request schemas anyway. They're two
  separate endpoints instead: `POST /optimize` (new-build, searches a space)
  and `POST /retrofit/rank` (retrofit, ranks fixed candidates against a
  required baseline). Point your two frontend flows (new-build wizard vs.
  retrofit wizard) at these two endpoints directly.
- **`day_of_year` still exists on every endpoint but the UI must never show
  it.** Use `design_day` (a scenario id from `GET /design-day-scenarios`)
  instead — see below. `day_of_year` is kept only for debugging/back-compat.
- **The ANSYS benchmark endpoint already exists** (`GET
  /validation/ansys-benchmark`) — the roadmap listed this under Phase 2/4a
  as "add UI"; the API half is done, only the dashboard page (4a/4c) is
  outstanding.
- **`carbon_kgco2e` is now a real, sourced number on `/optimize` designs**
  (backed by `materials.json`'s new `carbon_kgco2e_per_kg` + `carbon_citation`
  fields, mostly ICE Database v3.0/v4.1). It can still be `null` on an
  individual design if any of its materials has no carbon figure on file —
  render that as "—" / "unknown", never as 0. It is a *reported* figure
  (drives the new "Lowest Carbon" curated card) but is not one of the axes
  the optimizer actually searches on — see `engine/optimizer/objectives.py`.

## Sites

Only three site IDs exist right now, hardcoded in `api/routes/simulate.py:SITE_COORDS`:
`"leh"`, `"siachen"`, `"dras"`. There is no map-click/geocode endpoint yet —
Phase 4b's map picker should resolve a click to the nearest of these three
until a real site-registry / geocoding endpoint exists.

## GET /design-day-scenarios

No request body. Returns, in this fixed order:

```json
[
  {"id": "coldest_winter_night", "label": "Coldest Winter Night", "description": "..."},
  {"id": "sunniest_winter_day",  "label": "Sunniest Winter Day",  "description": "..."},
  {"id": "hottest_summer_day",   "label": "Hottest Summer Day",   "description": "..."},
  {"id": "typical_winter_day",   "label": "Typical Winter Day",   "description": "..."}
]
```

Populate the scenario picker from this call — don't hardcode the four names
client-side; more may be added later. Send the chosen `id` as `design_day` on
`/simulate`, `/optimize`, or `/retrofit/rank`.

## GET /materials

No request body. Returns the full materials library as a flat list:

```json
[{
  "id": "expanded_polystyrene_eps",
  "name": "...", "category": "...",
  "k": 0.035, "rho": 25.0, "cp": 1400.0,
  "cost_per_m3_inr": null, "cost_per_m2_inr": null,
  "cost_note": null, "citation": "...",
  "carbon_kgco2e_per_kg": 3.29, "carbon_citation": "..."
}]
```

`cost_per_m3_inr` / `cost_per_m2_inr` are per-material — only one of the two
is populated depending on the material's category (volumetric vs. sheet
goods). `carbon_kgco2e_per_kg` is embodied carbon per kg of material,
cradle-to-gate; a few vernacular/composite materials only have an
order-of-magnitude estimate — `carbon_citation` says so per material where
that applies, don't present those as equally certain as the database-backed
ones.

## GET /validation/ansys-benchmark

No request body. Returns:

```json
{
  "runs": [{
    "id": "...", "label": "...", "status": "complete | pending",
    "ours_min_indoor_temp_c": -13.2, "ansys_min_indoor_temp_c": -13.6,
    "abs_error_c": 0.4, "ours_wall_clock_s": 0.8, "ansys_wall_clock_s": 240.0,
    "speedup_x": 300.0, "note": "..."
  }],
  "n_complete": 2, "n_pending": 1,
  "mae_c": 0.4, "mean_speedup_x": 300.0,
  "note": "Runs with status='pending' have no real ANSYS number on file yet..."
}
```

`abs_error_c` / `speedup_x` are `null` (not `0`) on `status: "pending"` runs —
render those rows as "awaiting ANSYS run", not as a zero-error result.
`mae_c` / `mean_speedup_x` are computed over complete runs only.

## POST /simulate

New-build, single fixed design, one 24h run. All fields have defaults except
`site_id`.

Request (fields relevant to the frontend; see `SimulateRequest` in
`api/routes/simulate.py` for the full/current list):
```json
{
  "site_id": "leh",
  "design_day": "coldest_winter_night",
  "wall_material_id": "local_stone_masonry",
  "insulation_material_id": "expanded_polystyrene_eps",
  "wall_thickness_m": 0.3,
  "insulation_thickness_m": 0.1,
  "floor_area_m2": 16.0,
  "ceiling_height_m": 2.4,
  "leakage_area_cm2": 200.0,
  "night_gate_enabled": false,
  "night_gate_close_hour": 19.0,
  "night_gate_open_hour": 7.0,
  "night_gate_closed_leakage_area_cm2": 60.0
}
```

Response: `hours` / `indoor_temp_c` / `outdoor_temp_c` (24 points each, for
the 24h thermal curve chart), `min_indoor_temp_c`, `max_indoor_temp_c`,
`mean_ach`, `wall_u_value_wm2k`, `safety_passed` + `safety_reasons` (always
render `safety_passed: false` as a hard block, not a warning — it's a
non-overridable gate, per the roadmap's safety-interlock differentiator),
`co_steady_state_ppm`, `night_gate_hours_closed`.

## POST /optimize

New-build, searches a design space, returns curated + explorable results.
`site_id` and the four form fields below are the only required-feeling
inputs — everything else has a working default.

Request:
```json
{
  "site_id": "leh",
  "design_day": "coldest_winter_night",
  "floor_area_m2": 16.0,
  "ceiling_height_m": 2.4,
  "sensible_heat_w": 200.0,
  "explore_offset": 0,
  "explore_page_size": 6
}
```

Response:
- `curated_designs`: up to 5 labeled picks (`label` + `why` + full `design`
  object) — this is the "5–6 curated cards" from the roadmap's output layer.
  Render these as cards, in the order returned.
- `explore_more` + `explore_has_more` + `explore_next_offset`: the "Explore
  more" button re-calls `/optimize` with `explore_offset` set to
  `explore_next_offset` from the previous response, same other fields —
  it pages through the *same* Pareto front, it does not re-optimize.
- `pareto_front`: full front, kept for back-compat — don't build new UI
  against this directly, use `curated_designs` + `explore_more`.
- Each `RankedDesignOut` (used in all three of the above) has:
  `wall_material_id`, `insulation_material_id`, `wall_thickness_m`,
  `insulation_thickness_m`, `leakage_area_cm2`, `comfort_coldest_hour_c`,
  `cost_inr`, `weight_kg`, `carbon_kgco2e` (always null, see above),
  `wall_u_value_wm2k`, `safety_passed`.

No 3D geometry/exploded-view data is returned yet — `/optimize` returns the
material/thickness spec, not a full parametric mesh. The Phase 4a 3D viewer
should build its box geometry client-side from `wall_thickness_m` /
`insulation_thickness_m` / `floor_area_m2` / `ceiling_height_m` (matching
`make_simple_box_geometry`'s simple-box assumption — same shape the solver
itself uses), not expect a separate geometry payload.

## POST /retrofit/rank

Retrofit, ranks upgrade candidates against one fully-specified existing
structure. Unlike `/optimize`, most fields here are **required** — this
describes a real existing building, there's nothing for the system to
default. Missing a required field returns a 422, not a filled-in guess.

Request (required fields have no default and must be sent):
```json
{
  "site_id": "leh",
  "design_day": "coldest_winter_night",
  "floor_area_m2": 16.0,
  "ceiling_height_m": 2.4,
  "leakage_area_cm2": 350.0,
  "wall_material_id": "local_stone_masonry",
  "wall_thickness_m": 0.4,
  "insulation_material_id": null,
  "insulation_thickness_m": 0.0,
  "sensible_heat_w": 200.0
}
```
`insulation_material_id: null` + `insulation_thickness_m: 0.0` is the
explicit, valid way to say "this building has no insulation today" — the
form must allow submitting that combination, not treat it as an incomplete
form.

Response:
- `baseline`: the existing structure's own performance
  (`comfort_coldest_hour_c`, `wall_u_value_wm2k`, `safety_passed` +
  `safety_reasons`) — show this first, as the "before" reference point.
- `ranked_interventions`: single-variable upgrades, each with `kind`,
  `label`, `comfort_coldest_hour_c` (after), `delta_comfort_c`,
  `added_cost_inr` (nullable — see below), `cost_per_degree_inr` (nullable),
  `wall_u_value_wm2k`. Sorted best cost-per-degree first.
- `rejected_interventions`: candidates that failed the safety interlock
  once applied — `kind` + `label` + `reason`. Show these separately, with
  the reason, not silently drop them.
- `unavailable_interventions`: candidates not yet modeled (no sourced cost
  data, etc.) — `kind` + `label` + `reason`. Show as "not available yet",
  not as a ranked option.
- `added_cost_inr` / `cost_per_degree_inr` can be `null` on an otherwise-
  ranked intervention (e.g. Night Gate — no product cost data exists yet).
  Render as "cost unknown", not "free" or "$0".

## Common error shape

Every endpoint returns FastAPI's default `{"detail": "..."}` on 4xx (bad
`site_id`, out-of-range `day_of_year`, missing required retrofit field,
unresolvable `design_day` for a site with too little cached data, etc.).
Surface `detail` directly — there's no separate machine-readable error code
field yet.

## Not yet in the contract (don't build UI assuming these exist)

- Map click / GPS / place-name geocoding → still a fixed 3-site dropdown.
- PDF/CSV export → no endpoint yet (Phase 4c, client-side or new endpoint,
  undecided — flag this when you get there, don't block on it now).
- Bulk/sandbox multi-shelter layout → not implemented.
- Live 24h dashboard summary cards (comfort-hours %, fuel-avoided, etc.) →
  `/simulate` returns the raw curve; compute these client-side from
  `hours`/`indoor_temp_c`/`outdoor_temp_c` for now, or flag if you want a
  server-side summary endpoint instead.
