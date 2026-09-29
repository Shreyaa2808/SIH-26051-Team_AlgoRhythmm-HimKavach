# `designInput` schema (v1) — owned by Person 2 (Shelter Design Wizard)

One normalized JSON object describing a shelter **before** any simulation.
Source of truth: `web/src/features/design/designInput.js`.
Import: `import { createDefaultDesignInput, validateDesignInput, deriveGeometry, toSimulatePayload } from 'features/design'` (relative path in this repo: `./features/design/index.js`).

Rules: plain JSON only · field names frozen after merge (additive changes OK) · derived values are never stored.

## Shape

```js
{
  version: 1,
  mode: 'new-build' | 'retrofit',

  site:      { siteId, label, latitude, longitude, elevationM, designDay },

  shelter:   { type, usage, season, occupants,
               occupancyPattern, scheduleStartHour, scheduleEndHour },

  geometry:  { shape, lengthM, widthM, heightM, orientationDeg, roofSlopeDeg },

  envelope:  { wall | roof | floor | insulation: {
                 mode: 'recommend' | 'select' | 'custom',
                 materialId,            // id from GET /materials
                 thicknessM,
                 custom: { name, k, rho, cp, costPerM3 } } },

  openings:  { windows: [{ id, wall:'N|E|S|W', widthM, heightM, sillM, glazingId, frame, operable,
                           offsetM }],            // offsetM: null = auto-spaced (added in Phase 4)
               doors:   [{ id, wall, widthM, heightM, type, offsetM }],
               leakageAreaCm2 },

  operations:{ activity, heatingType, heatingW, ventilationType,
               internalLoadsW, coGenerationLpm,
               sensibleHeatOverrideW,             // null = computed; number = manual total (Phase 4)
               nightGate: { enabled, closeHour, openHour, closedLeakageCm2 } }
}
```

`wall` labels are **pre-rotation** compass labels (same convention as `/simulate`);
`orientationDeg` rotates the whole building.

### Opening positions (Phase 4)

`offsetM` is the distance in metres from the wall's **left edge as seen from outside** to the opening's
left edge (counter-clockwise when viewed from above). `null` means auto-spaced with equal gaps.
Starting corner per wall label: N → east end, W → north end, S → west end, E → south end.
Window `sillM` is measured from the floor; doors sit on the floor. P5 (3D) and P6 (blueprint) should use
`deriveOpenings(designInput).walls[label].placed` instead of re-deriving positions.

## Helpers (pure functions)

| Function | Purpose |
|---|---|
| `createDefaultDesignInput(overrides)` | New input with safe defaults |
| `hydrateDesignInput(saved)` | Restore an older/partial save |
| `deriveGeometry(geometry)` | floor area, volume, perimeter, wall/roof/envelope area |
| `deriveOperations(input)` | metabolic + internal + heater W → `sensibleHeatW` (or the manual override; also returns `computedW`, `overridden`) |
| `deriveOpenings(input)` | per-wall gross/opening/net areas, opening ratio, placed positions, overlaps; window-to-wall ratio |
| `layoutWall(wallLengthM, items)` | place openings along one wall; reports overlaps and out-of-bounds |
| `createWindow(overrides)` / `createDoor(overrides, ceilingM)` | new opening with defaults |
| `glazingCostInr(windows, materialsById)` | glazing supply cost from `/materials`; `null` if a price is missing |
| `resolveEnvelope(envelope)` | what will actually be simulated (`selected` / `custom` / `recommended-default`) |
| `validateDesignInput(input)` | `{ ready, errors{section:[]}, warnings[] }` — `ready` = baseline can run |
| `toSimulatePayload(input)` | `{ payload, notes[] }` for `POST /simulate` |

## What `/simulate` can and cannot represent today

`toSimulatePayload` returns a `notes` array for every gap. **Show these to the user**
(don't hide them) so nothing looks simulated when it isn't.

| Wizard collects | `/simulate` today |
|---|---|
| Length × width | square footprint of same floor area |
| Several windows | one wall only (largest total window area) |
| Doors | not modelled |
| Separate roof/floor materials | wall build-up used everywhere |
| Custom materials | not accepted (falls back, with a note) |
| Occupancy schedule | not applied; internal gain is continuous for 24 h |
| Non-rectangular shape | not modelled |
| Window frame, sill, position, openable flag | not modelled (glazing area + type only) |
| Ventilation type (natural / mechanical) | not modelled; air exchange comes from leakage area |
| Heater type | not modelled; heater W is added to internal gain, CO rate goes to the safety check |
| Night Gate | modelled as lower leakage while closed (hours 0–23, closed leakage must be > 0) |

Closing these gaps is an engine/API change (not Person 2's files).

## Consumers

- **P1** stores it as `project.designInput` (or split across `site/shelter/envelope/openings/operations`).
- **P3** (retrofit) can reuse the same object with `mode: 'retrofit'`.
- **P4** calls `toSimulatePayload(designInput)`, never hand-builds `/simulate` bodies.
- **P5** reads `geometry`, `envelope`, `openings` for 3D; `envelope.*.mode === 'recommend'` means "let the optimizer choose".
- **P6** reads everything for blueprint / reports.
