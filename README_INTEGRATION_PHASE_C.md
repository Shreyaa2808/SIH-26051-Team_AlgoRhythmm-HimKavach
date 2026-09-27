# Phase C patch — the real 3D digital twin

Adds to Phase A + B (does not replace them). Copy in, preserving folders:

    api/routes/shelter.py                     (REPLACES — adds per-surface
                                                heat-flux data to the
                                                response, everything else
                                                in the file is unchanged)
    web/src/components/DigitalTwinModule.jsx  (REPLACES existing file)

Then apply the one line in `web/src/App.jsx.PATCH.txt` (drops the now-unused
`simResult` prop on `<DigitalTwinModule>`, passes `siteId` instead).
`api/main.py.PATCH.txt` is now cumulative for Phase A+B — if you already
applied it, there's nothing further to do there for Phase C.

## What actually changed vs. the old box

The old `DigitalTwinModule.jsx` drew 4 flat `boxGeometry` walls, one shared
color from a single `min_indoor_temp_c` number, no windows, no real
thickness, no per-wall material. The new one:

- **Real per-wall thickness.** Each wall's box depth is the *actual*
  resolved structural + insulation thickness from `/shelter/design`
  (Phase A's auto-thickness solver), not a hardcoded `0.15`.
- **Real punched openings.** `wallSegments()` / `carveRect()` splits each
  wall into the solid rectangles that remain after subtracting every
  window/door in `ShelterModel.walls[*].openings` — an actual hole with a
  translucent glazing pane filling it, not a flat-colored box pretending
  a window exists. No CSG library needed (none was installed;
  `three-bvh-csg` isn't in your `package.json`), so this uses plain
  rectangle math instead — cheaper to render and easier to keep in sync
  with the thermal solver's own opening geometry.
- **Real heat map.** Colors come from `heat_flux_wm2` in the new
  `surfaces` field on `/shelter/design`'s response — computed from each
  surface's *actual* `ConstructionAssembly.u_value()` and the
  simulation's own mean indoor/outdoor temps (see the smoke test output
  in chat: a window shows ~84 W/m², an insulated stone wall ~6.5 W/m²,
  in the same design — that's the solver's real physics, not a stand-in
  gradient). Toggle between Heat map and Material view.
- **Real single-pitch roof** at the actual `slope_deg`/`orientation_deg`
  from the model (matches the "Monoslope Shed Roof" vernacular form in
  your reference screenshots), not a fixed two-slope gable.
- **Cutaway.** A dropdown hides any one wall so you can see inside.
- **Config lives in the same tab.** Per-wall structural/insulation
  material + add/remove windows + dims + occupancy purpose + roof slope,
  all calling `/shelter/design` on "Generate design" — this is the
  what-if loop the roadmap asked for, wired to the real endpoint from
  day one rather than bolted on later.

## Verified

- `POST /shelter/design` re-tested with a window opening in the payload:
  confirmed `surfaces` returns per-surface area/U-value/heat-flux,
  including the window as its own high-flux surface next to the wall
  it's cut from (see chat).
- `DigitalTwinModule.jsx` passed real `eslint` against your project's own
  config (hooks rules, unused-vars, the lot) — zero errors.
- Production `vite build` could not be verified in this sandbox (a
  missing native binding for `rolldown` unrelated to this code — pre-
  existing platform-specific dependency issue, not caused by this patch).
  Run `npm run build` on your machine to confirm; if `rolldown`/native
  binding errors show up there too, `npm i` again per the error message's
  own suggestion (unrelated to Phase C).

## Known simplification (call it out, don't hide it)

- Only one opening type gets a glazing pane (`window`); `door`/`vent`
  openings are punched (visually correct hole) but left unglazed — doors
  don't need glass, and vents are tiny relative to a wall, so this was a
  deliberate scope cut, not an oversight.
- Multiple overlapping openings on the same wall aren't supported (the
  carving algorithm assumes non-overlapping rectangles); the UI doesn't
  currently stop you from adding overlapping ones, so validate that
  server-side next if you expect real users to hit it.

## What's next (Phase D)

The professional 2D blueprint (plan/elevations/sections with real
dimension lines) reads from this exact same `ShelterModel` +
`resolved_thicknesses` + `surfaces` data — no new backend work, just a new
renderer (SVG, not a 3D screenshot) consuming what Phase A/B/C already
produce.
