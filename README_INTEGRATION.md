# Phase A patch — drop-in integration

Copy these into your repo, preserving the folder structure:

    engine/shelter_model.py                  (new)
    engine/storage.py                        (new)
    engine/optimizer/auto_thickness.py        (new)
    api/routes/shelter.py                     (new)

Then apply the one change in `api/main.py.PATCH.txt` to your real
`api/main.py` (two lines, same pattern as every other router include
already in that file).

Nothing existing is modified or removed. `POST /simulate`,
`make_simple_box_geometry`, `MaterialsLibrary`, and every other route keep
working exactly as before — this is purely additive.

## New endpoints

    POST   /shelter/design          -> auto-solves any thickness=null field,
                                        runs a simulation, saves the project
    GET    /shelter/projects        -> list saved designs
    GET    /shelter/projects/{id}   -> reload a saved design + its last result
    DELETE /shelter/projects/{id}   -> remove a saved design

## What this gives you (mapped to what you asked for)

- Per-wall material/insulation/thickness, independently on N/E/S/W
  (`ShelterModel.walls`) — the solver already supported this
  (`GeometrySpec.surfaces` is a list), the old `make_simple_box_geometry`
  just never exposed it. Nothing in `engine/solver/` changed.
- Thickness is optional (`null`) → the system solves for it
  (`engine/optimizer/auto_thickness.py`), respecting a budget ceiling and
  comfort target that come from `occupancy.purpose` (military forward
  post / permanent garrison / research station / civilian expedition /
  civilian permanent) — this is the "ask purpose, not raw numbers" input.
- Windows/doors/vents per wall, with real position + size
  (`Opening` — feeds Phase C's 3D geometry and Phase D's blueprint
  directly, not just a thermal area subtraction).
- Persistence: `engine/storage.py`, a single SQLite file
  (`data/app_state.sqlite3`), no server dependency — every
  `POST /shelter/design` call saves/updates the project automatically.

## Verified end-to-end (see chat for the exact commands run)

    ShelterModel -> solve_shelter_thicknesses() -> to_geometry_spec()
    -> engine.solver.thermal_solver.simulate() -> storage.save_project()
    -> GET /shelter/projects -> GET /shelter/projects/{id}

all executed against your actual `data/climate/leh_2025.json` cache and
`data/materials/materials.json`, through a real FastAPI TestClient,
end to end, no mocks.

## What's next (Phase B)

The materials database is still the static read-only JSON
(`engine/materials/loader.py` untouched in this patch) — Phase B replaces
it with the CRUD-able SQLite table + admin endpoints, and Phase C reads
`ShelterModel.walls[*].openings` to finally stop rendering a box.
