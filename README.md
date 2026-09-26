# High-Altitude Shelter Thermal Sim

## Phase 0 status: DONE
- Repo structure: engine/, api/, web/, data/
- Materials library: data/materials/materials.json (15 materials: insulation,
  structural/thermal-mass, glazing, radiant control — k, rho, cp, cost, citation)
- Climate data: data/climate/fetch_nasa_power.py — run this locally (needs
  internet the sandbox doesn't have) to pull hourly 2025 T2M/RH2M/WS10M/GHI/
  PS/LW-down for Leh, Siachen, Dras from NASA POWER. Loader at
  data/climate/loader.py normalizes the JSON into plain arrays.
- API skeleton: api/main.py runs (FastAPI), /health and /materials confirmed
  working. /simulate endpoint is Phase 1's job.

## Setup
    pip install -r requirements.txt
    python3 data/climate/fetch_nasa_power.py     # needs internet
    uvicorn api.main:app --reload

## Phase 1 status: DONE
- engine/solver/solar_geometry.py — sun position + DISC (GHI->DNI) + Perez
  anisotropic sky-diffuse model, tilted-surface POA irradiance
- engine/solver/sky_radiation.py — Swinbank clear-sky Tsky, with fallback to
  measured ALLSKY_SFC_LW_DWN when available (more accurate, accounts for cloud)
- engine/solver/infiltration.py — altitude-density-corrected wind+stack ACH,
  plus check_safety_interlock() — the HARD ACH/CO gate. Every simulate() call
  runs this and returns safety_passed/safety_reasons.
- engine/solver/rc_network.py — multi-layer construction -> RC node chain
  (ISO 52016-1 style)
- engine/solver/thermal_solver.py — assembles all envelope surfaces + indoor
  air node into one implicit-Euler system, 5-min substeps, returns 24h curve
- api/routes/simulate.py — POST /simulate, wired into api/main.py

Verified with synthetic Leh-like winter data:
  - Indoor temp is damped + phase-shifted vs outdoor (correct thermal-mass behavior)
  - More insulation -> narrower indoor swing, lower U-value (correct direction)
  - Safety interlock correctly REJECTS a tight/sealed room with a combustion
    heater (CO ~5800ppm vs 9ppm limit) — hard gate confirmed working, not just flagging
  - Live /simulate endpoint tested end-to-end via curl, 200 OK, sane output

Known caveat for the limitations slide: DISC (GHI->DNI split) and the Perez
tilt model are physically standard but not fit specifically to high-altitude
thin-atmosphere conditions — fine for relative comparisons (insulation A vs
B), not a substitute for Phase 2 validation against real measured data.

## IMPORTANT before running for real
data/climate/ is NOT populated with real data yet — run fetch_nasa_power.py
locally (this sandbox has no internet) before /simulate will return anything
but a 404. It looks for data/climate/<site_id>_*.json.

## Next (Phase 2 — validation)
Run this solver against 1-2 published real cases (DIHAR/LEDeG Leh data or
the Springer paper) once real NASA POWER data is pulled. Get the hero
before/after number and an error-band stat before touching Phase 3.

## Phase 2 status: DONE
Two independent validation checks against the HIAL/FHNW Ladakh passive-
solar-house report (Hall & Geissler, FHNW, 2022 -- Swiss-funded, real
sensors, ESP-r simulation, the most rigorous published source found for
this exact building type/climate):

1. **Steady-state U-value check** (engine/validation/validate_uvalue.py):
   reproduced their PreFreb wall construction with our ConstructionAssembly.
   - Wall: our 0.235 W/m2K vs their published 0.19 W/m2K (23% error) --
     reasonable agreement; likely explained by their block's air-filled
     cavities being more insulating than the solid strawclay k we used
     (documented ambiguity, see script output).
   - Roof: 411% error -- expected and understood: their real roof has a
     dominant 20cm pashmina-wool insulation layer we don't have in the
     materials library, so our simplified reproduction only used strawclay.
     Not a solver bug; a materials-library gap.

2. **Transient hero-number run** (engine/validation/validate_transient.py):
   ran the full RC solver for a traditional (thick stone, thin insulation)
   vs an insulated (HIAL PreFreb-spec) room at real Leh January TMY
   conditions (mean -12.7C, from the FHNW report's own NREL TMY citation).
   Critically, this REQUIRED a multi-day spin-up (6 days) before reporting
   results -- a single 24h run from an arbitrary start temperature mostly
   reports that start temperature for high-thermal-mass constructions like
   thick stone, since their time constant exceeds 24h. (The FHNW report
   itself uses a 20-day pre-simulation for the same reason -- this cost us
   a wrong first result before we caught it.)
   **HERO NUMBER: insulation upgrade raises the coldest indoor hour by
   5.2C (-18.4C -> -13.2C).**

Known limitations (put these on the slide, don't hide them):
- The transient run uses a synthetic diurnal profile anchored to a real
  published monthly MEAN, not real hourly Leh data (still need to run
  fetch_nasa_power.py locally + re-run for a true hourly comparison)
- Our solver has no Trombe-wall/glazing-gap model yet, so we can't directly
  reproduce the FHNW report's actual measured room (which has one) --
  the hero number compares two of OUR OWN opaque-envelope constructions,
  not a direct match to their measured data
- adobe/rammed-earth material properties differ significantly between our
  two cited sources (documented in materials.json _known_discrepancies) --
  worth a sensitivity run with both value sets before the optimizer (Phase 3)
  leans on them

## Phase 3 status: DONE (new-build only — retrofit is Phase 3b, not this)
- engine/optimizer/search_space.py — free variables: wall material,
  insulation material, wall thickness, insulation thickness, leakage area
  (build-quality proxy). floor_area_m2/ceiling_height_m are FIXED inputs,
  not searched.
- engine/optimizer/objectives.py — comfort (coldest indoor hour, matches
  Phase 2's hero-number framing), cost (materials only, INR), weight
  (envelope mass, kg). **carbon is NOT implemented** — materials.json has
  no embodied-carbon field/citation for any material; `carbon_kgco2e` is
  always `None` rather than a fabricated number. Needs real sourced data
  before it can be a real objective.
- engine/optimizer/nsga2.py — from-scratch NSGA-II (no new GA dependency)
  over the mixed discrete/continuous design dict. Uses constrained-
  domination (Deb's rule) so the safety interlock is never folded into the
  objective weights — a failing design is never "just worse", it's invalid.
- engine/optimizer/surrogate.py — RandomForest-per-objective surrogate
  (needs scikit-learn, added to requirements.txt). Confidence-aware: per-
  tree std-dev on the comfort prediction decides whether to trust the
  surrogate or fall back to a real physics run for that candidate.
- engine/optimizer/optimize.py — orchestrates: physics-seeded surrogate,
  surrogate-accelerated NSGA-II with periodic retraining, then a HARD
  physics-verification + real safety re-check on every design in the
  final Pareto front before it's returned. No design reaches the API
  response on the surrogate's word alone.
- api/routes/optimize.py — POST /optimize, new-build only, mirrors
  /simulate's climate-loading path. Wired into api/main.py.

Smoke-tested end-to-end against synthetic winter data (real NASA POWER
data still isn't cached in this sandbox — same caveat as Phase 1/2): ranked
front correctly trades cheap/heavy stone+wool against pricier/lighter
SIP+XPS, all entries pass the safety interlock.

Known limitations for the slide:
- Surrogate is retrained fresh per optimization run, not shipped
  pretrained — see engine/optimizer/surrogate.py docstring for why.
- NSGA-II hyperparameters (pop size, generations, retrain cadence,
  comfort_std_threshold_c) are reasonable defaults, not tuned against a
  validation set.
- `carbon_kgco2e` is a real gap, not a placeholder waiting on formatting —
  someone needs to source per-material embodied-carbon numbers with
  citations before this objective can exist for real.

## Outstanding cross-team item (not a Phase 3 blocker, but flagging it)
Per the updated phase split, Phase 1's `/simulate` was supposed to gain a
`mode: "new" | "retrofit"` field (with materials/geometry becoming
`required: true` for retrofit) and `docs/api-contract.md` was supposed to
be updated to lock that schema with Person B before further frontend work.
Neither exists yet in this repo — `api/routes/simulate.py` still has no
`mode` field, and there's no `docs/api-contract.md` file. Phase 3 (this
optimizer) didn't need either (it's new-build-only and calls the solver
directly, not through /simulate), so it wasn't blocked, but Phase 3b
(retrofit intervention-ranker, next) will want the required-fields
contract decided first. Worth doing before starting 3b rather than after.

## Phase 3b status: DONE — retrofit intervention-ranker
- engine/retrofit/baseline.py — RetrofitBaseline: every field describing
  the existing structure is required (raises ValueError if missing), no
  optimizer/defaults filling gaps. `insulation_thickness_m == 0` +
  `insulation_material_id = None` is the explicit, valid way to say "no
  existing insulation" — that's baseline data, not a missing field.
- engine/retrofit/geometry.py — geometry builder that (unlike Phase 1/3's
  make_simple_box_geometry) omits the insulation layer entirely when
  thickness is 0, instead of passing a degenerate zero-thickness layer —
  a zero-thickness layer produces a zero-resistance edge, which is a
  division-by-zero in the solver's conductance assembly. Found this by
  trying it.
- engine/retrofit/interventions.py — generates the single-variable upgrade
  candidates: add insulation (baseline has none), increase/replace
  insulation (baseline has some), swap wall material. Night Gate is listed
  as a `NotYetAvailableIntervention` (blocked on Phase 5, not faked).
  Air-sealing/tightening is left out entirely — no sourced labor-cost data,
  same "don't fabricate a number" call as Phase 3's carbon objective.
- engine/retrofit/ranker.py — reuses engine/solver/thermal_solver.simulate()
  DIRECTLY, not engine/optimizer's NSGA-II/surrogate (nothing to search,
  just a small fixed candidate set to evaluate). Ranks by cost per degree C
  gained at the coldest hour. Any candidate that fails the safety interlock
  after being applied is excluded from the ranking and reported separately
  (with why) rather than shown with a warning badge — same hard-gate rule
  as everywhere else here.
- api/routes/retrofit.py — POST /retrofit/rank, wired into api/main.py.
  Separate endpoint from /optimize (not a mode toggle on it), since
  retrofit doesn't search a space, it ranks against one fixed structure.

Smoke-tested against synthetic winter data, both branches (no existing
insulation, and some existing insulation), plus the required-field
rejection path. Example result on a no-insulation stone baseline: rebuilding
in sun-dried mud brick beats adding an insulation layer on cost-per-degree
(₹8.7k/°C vs ₹21k/°C for mineral wool) — worth sanity-checking that against
real build practice before trusting it, since it's driven entirely by the
materials.json cost/k numbers, not a construction-labor estimate.

## Outstanding item, now actually relevant: the mode field / api-contract.md
Still not done (see the note added after Phase 3). Wasn't a blocker for 3b
either, since /retrofit/rank is its own endpoint with its own
all-required-fields request schema — it doesn't route through /simulate's
`mode` flag at all. But Person B's retrofit config-form validation (Phase
1.5/5 on their side) will want to know this schema, so pointing them at
api/routes/retrofit.py's RetrofitRankRequest (or writing it up in
docs/api-contract.md, which still doesn't exist) is worth doing now.

## Next (Phase 5 — Night Gate physics state)
Add a Night Gate physics state to the solver (time-varying assembly
resistance/schedule — closed at night, open in the day), then wire it back
into engine/retrofit/interventions.py to replace the current
NotYetAvailableIntervention stub with a real ranked candidate.
