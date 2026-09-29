# Design project store — hand-off for Person 1

Phase 6 wires the design wizard to a small project store so **New project → Site → Inputs → Simulation** and **Save → Refresh → Reopen** work today. It lives in `web/src/features/design/projectStore.js` and is deliberately tiny so your project system can replace it.

## What is saved

Per project (localStorage key `himkavach.designProjects.v1`):

```js
{ id, name, mode, createdAt, updatedAt, step, design, baseline }
// design   = designInput (see docs/design-input-schema.md)
// baseline = { data, key, notes } | null
//   data  = /simulate response
//   key   = JSON.stringify(design) when it ran; a result is shown only while it still matches
```

`toProjectShape(record)` flattens a record into the shared schema:

```js
{ projectId, projectName, mode,
  site, shelter /* includes geometry */, envelope, openings, operations,
  baseline /* /simulate response or null if stale */,
  optimizedDesigns: [], selectedDesign: null, validation: {}, outputs: {} }
```

## Swap-in contract

`<NewDesignPage store={yourStore} />` needs these methods (all synchronous; wrap async in your own cache if needed):

| Method | Returns |
|---|---|
| `list(mode)` | `[{ id, name, mode, siteLabel, updatedAt, hasBaseline }]`, newest first |
| `get(id)` | record or `null` |
| `create({ name, design, mode, step })` | record; becomes current |
| `update(id, { name?, design?, step?, baseline? })` | `{ record, persisted }` or `null` |
| `duplicate(id)` | record; becomes current |
| `remove(id)` | boolean |
| `setCurrent(id)` / `currentId()` | boolean / id |
| `ensureCurrent({ mode })` | record to show on open (creates one if none) |
| `isPersistent()` | `false` shows the "autosave unavailable" banner |

## Behaviours worth knowing

- Autosave is debounced (350 ms) and flushed on tab hide, close and unmount.
- Opening a project pushes its site, design day and baseline result up to `App` through the `onLocationChange`, `onDesignDayChange` and `onBaselineResult` props.
- Editing any input after a baseline run clears the old result in `App`, so stale numbers are never shown.
- A Phase 1–5 draft (`himkavach.designDraft.v1`) is migrated into a project the first time the store is empty, then removed.
- Unreadable saved data is copied to `himkavach.designProjects.v1.corrupt` before starting clean.
- `mode: 'retrofit'` projects are stored and listed separately, so Person 3 can reuse `NewDesignPage mode="retrofit"`.
