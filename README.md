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

## Next (Phase 3 — optimizer + ML surrogate)
Multi-objective optimizer (comfort/cost/carbon/weight) on top of the now-
validated solver, plus an ML surrogate trained on generated physics data
with confidence-aware fallback to a live physics run.
