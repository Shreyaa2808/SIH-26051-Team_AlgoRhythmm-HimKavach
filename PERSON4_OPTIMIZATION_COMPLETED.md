# Person 4 — Optimization + Design Comparison (Completed)

## Scope
This branch owns the optimization → comparison → selected-design handoff.

### Completed
- User-facing optimization cards replace Pareto-first decision making.
- Advanced engineering constraints are separated from the primary decision flow.
- Baseline shelter configuration is carried into optimization instead of silently reverting to old default geometry/load assumptions.
- Each generated design can be independently simulated using its own envelope variables.
- Comparison page provides ready side-by-side engineering metrics.
- Comparison page can run the 24-hour thermal simulation for every generated design and shows simulation-derived indoor/outdoor/solar/heat-loss/safety metrics.
- Per-design thermal inspection remains available.
- Pareto remains available as an advanced trade-off explorer.
- Selected design is handed off through the existing `selectedDesign` / instantiate path for the Digital Twin.
- CSV export remains available.
- Explainable `why` text is shown with curated candidates.

## Deliberate boundary
The optimizer's underlying objective set remains the existing engineering implementation (comfort, material cost and envelope weight). The UI does not pretend that carbon is an optimization objective; carbon is reported when available.

## Validation
- Python API/engine modules pass `python -m compileall`.
- Frontend build/lint could not be executed in this environment because `web/node_modules` is not installed. Run `npm ci && npm run build && npm run lint` on a machine with the repo dependencies available before merging.
