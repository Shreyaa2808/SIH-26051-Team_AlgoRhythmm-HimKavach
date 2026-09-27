# Phase B patch — editable materials database

Adds to the Phase A patch (does not replace it). Copy these in, preserving
folder structure:

    engine/materials/store.py                (new — SQLite CRUD layer)
    engine/materials/loader.py                (REPLACES existing file)
    api/routes/materials.py                   (new — add/edit/delete/list)
    web/src/components/MaterialsModule.jsx    (REPLACES existing file)

Then in `api/main.py`:
1. Delete the inline block:
       @app.get("/materials")
       def list_materials():
           ...
2. Add:
       from api.routes.materials import router as materials_router
       app.include_router(materials_router)

Nothing else changes. `ConfigForm.jsx`'s `fetch('/materials')` call still
gets the same JSON shape back (plus the new fields), so it keeps working
unmodified.

## What changed and why

- `data/materials/materials.json` is no longer read after first boot —
  it's used exactly once to seed `data/materials/materials.sqlite3`, then
  every read/write goes through the DB. Nothing in the JSON is lost; it's
  just not the source of truth anymore.
- Every material now carries `availability` ('local' / 'regional' /
  'imported' / 'fabricated_onsite') and a free-text `logistics_note`
  (the "power lifting thing" — airliftable vs. road-only vs. no lift
  needed) plus an auto-set `last_updated` timestamp shown in the UI, so a
  stale cost figure is visible as stale rather than silently trusted.
- New endpoints: `POST /materials` (create), `PUT /materials/{id}`
  (partial update), `DELETE /materials/{id}`, `GET /materials/{id}`.
  `GET /materials` (list) keeps its old path and shape.
- `engine/materials/loader.py`'s `Material` dataclass and
  `MaterialsLibrary.get()/.all()/.by_category()` are unchanged in shape —
  `engine/solver/*`, `engine/shelter_model.py`, and every existing route
  that does `MaterialsLibrary().get(...)` needed zero changes.

## Verified end-to-end (see chat for the exact commands run)

    seed from materials.json (16 materials) -> GET /materials
    -> POST /materials (create) -> PUT (update, last_updated bumps)
    -> GET (confirms update) -> DELETE -> GET (404, confirmed gone)
    -> POST /shelter/design (Phase A regression check: DB-backed
       MaterialsLibrary still feeds the thermal solver correctly)

all run against the real FastAPI app via TestClient, no mocks.

## What's next (Phase C)

The 3D digital twin (`DigitalTwinModule.jsx`) still draws 4 flat-colored
boxes from one shared config. Phase C reads the actual `ShelterModel` from
Phase A — per-wall material, thickness, and `openings` — and the materials'
real properties from this Phase B store, to finally render something that
looks like the buildings in your reference screenshots instead of a box.
