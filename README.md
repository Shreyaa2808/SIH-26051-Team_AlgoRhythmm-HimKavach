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

## Next (Phase 1 — you, solo critical path)
Build engine/solver/: 1D multi-node RC transient solver (ISO 52016-1 style),
Perez solar geometry, Swinbank sky radiation, altitude-corrected infiltration,
hard ACH/CO safety interlock. Wire into api/routes/simulate.py.
Don't let B start on drawings/optimizer against this until it returns sane
24h temperature curves.
