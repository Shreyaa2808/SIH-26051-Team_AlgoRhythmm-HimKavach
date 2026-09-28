# Phase E patch — optimizer <-> 3D twin <-> blueprint

Copy these files over your repo, preserving folders. No new dependencies,
no changes to api/main.py (the new endpoint lives in the existing
optimize router), no new database tables.

NEW
  engine/optimizer/snow.py            roof snow load (IS 875 Pt 4 style shape coefficient)
  engine/optimizer/instantiate.py     Pareto genome -> full ShelterModel
  web/src/components/ParetoChart.jsx  clickable cost-vs-comfort scatter

CHANGED
  engine/optimizer/search_space.py    roof slope + ceiling height are optional free genes
  engine/optimizer/objectives.py      uses slope/height, computes snow load, snow limit = hard constraint
  engine/optimizer/optimize.py        passes the flags through, snow check on the surrogate path
  engine/optimizer/surrogate.py       encoder follows the search space's genes
  api/routes/optimize.py              new request fields, new POST /optimize/instantiate, de-dupes the front
  web/src/App.jsx                     wiring, optimizer error handling, options state
  web/src/components/OptimizeModule.jsx   chart + selection + "Open in 3D twin / blueprint"
  web/src/components/DigitalTwinModule.jsx  accepts a `seed` prop
  web/src/components/BlueprintModule.jsx    accepts `initialProjectId`
  web/src/components/ClimateModule.jsx      no hardcoded 'leh' fallback, stale-response guard
