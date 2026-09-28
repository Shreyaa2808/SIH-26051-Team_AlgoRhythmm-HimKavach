"""
ML surrogate for the Phase 3 optimizer.

Why: NSGA-II needs on the order of population_size * generations physics
evaluations (e.g. 40 * 15 = 600), and each real evaluate_design() call runs
a full 24h implicit-Euler thermal solve. That's slow enough to matter for
an interactive tool. The surrogate predicts (comfort, cost, weight) from
the design dict directly, skipping the solver.

Model: one RandomForestRegressor per objective, trained on physics-labeled
samples. Cost and weight are cheap closed-form functions of the design
(see objectives.py) so a "surrogate" for them is really just interpolating
a smooth function — the forest handles that easily. Comfort is the reason
this whole module exists: it depends on the full transient physics.

Confidence-aware fallback (this is the actual "confidence-aware" part, not
just a naming aspiration):
  - A random forest's per-tree predictions give a free uncertainty
    estimate: predict with EVERY tree, take the std-dev across trees.
  - If comfort's predicted std exceeds `comfort_std_threshold_c`, we don't
    trust the surrogate for that candidate. The caller (optimize.py) is
    expected to re-evaluate those candidates with the real physics solver
    instead of accepting the surrogate's mean prediction.
  - This threshold is deliberately configurable and starts conservative
    (0.5 C) rather than tuned against a validation set we don't have yet —
    tightening/loosening it against real held-out physics runs is future
    work, not a Phase 3 blocker.

Known limitation to put on the slide: the surrogate is trained fresh per
optimization run (per site / per fixed floor area+height), not shipped as
a pretrained artifact. That keeps it honest (never extrapolating across a
site it hasn't seen) at the cost of an upfront sampling budget every time
someone changes the site or building size.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

try:
    from sklearn.ensemble import RandomForestRegressor
except ImportError as e:  # pragma: no cover
    raise ImportError(
        "scikit-learn is required for engine/optimizer/surrogate.py. "
        "Add it to requirements.txt and `pip install -r requirements.txt`."
    ) from e

CATEGORICAL_FIELDS = ("wall_material_id", "insulation_material_id")
CONTINUOUS_FIELDS = ("wall_thickness_m", "insulation_thickness_m", "leakage_area_cm2")


@dataclass
class SurrogatePrediction:
    comfort_coldest_hour_c: float
    comfort_std_c: float  # uncertainty estimate, across-tree std-dev
    cost_inr: float
    weight_kg: float
    trustworthy: bool  # comfort_std_c <= threshold used at predict() time


class DesignEncoder:
    """One-hot for categorical fields + raw floats for continuous fields."""

    def __init__(self, space):
        self.space = space
        self.wall_ids = list(space.wall_material_ids)
        self.ins_ids = list(space.insulation_material_ids)
        # Phase E: the continuous genes now depend on the run (roof slope /
        # ceiling height are optional). Take them from the search space so
        # the surrogate always sees exactly the genes the GA is varying.
        self.cont_fields = tuple(space.continuous_bounds.keys())

    def encode(self, individual: dict) -> np.ndarray:
        wall_oh = [1.0 if individual["wall_material_id"] == w else 0.0 for w in self.wall_ids]
        ins_oh = [1.0 if individual["insulation_material_id"] == i else 0.0 for i in self.ins_ids]
        cont = [individual[f] for f in self.cont_fields]
        return np.array(wall_oh + ins_oh + cont, dtype=float)

    def encode_batch(self, individuals: list[dict]) -> np.ndarray:
        return np.stack([self.encode(ind) for ind in individuals])


class ComfortCostWeightSurrogate:
    def __init__(self, space, n_estimators: int = 150, comfort_std_threshold_c: float = 0.5, seed: int | None = 0):
        self.encoder = DesignEncoder(space)
        self.comfort_std_threshold_c = comfort_std_threshold_c
        self._comfort_forest = RandomForestRegressor(n_estimators=n_estimators, random_state=seed)
        self._cost_forest = RandomForestRegressor(n_estimators=n_estimators, random_state=seed)
        self._weight_forest = RandomForestRegressor(n_estimators=n_estimators, random_state=seed)
        self._fitted = False

    def fit(self, individuals: list[dict], objective_results: list) -> None:
        """objective_results: list[objectives.ObjectiveResult] (feasible + infeasible both OK to include)."""
        X = self.encoder.encode_batch(individuals)
        y_comfort = np.array([r.comfort_coldest_hour_c for r in objective_results])
        y_cost = np.array([r.cost_inr for r in objective_results])
        y_weight = np.array([r.weight_kg for r in objective_results])
        self._comfort_forest.fit(X, y_comfort)
        self._cost_forest.fit(X, y_cost)
        self._weight_forest.fit(X, y_weight)
        self._fitted = True

    def predict(self, individual: dict) -> SurrogatePrediction:
        if not self._fitted:
            raise RuntimeError("Surrogate not fitted yet — call fit() with an initial sample set first.")
        x = self.encoder.encode(individual).reshape(1, -1)

        per_tree_comfort = np.array([t.predict(x)[0] for t in self._comfort_forest.estimators_])
        comfort_mean = float(per_tree_comfort.mean())
        comfort_std = float(per_tree_comfort.std())

        cost_mean = float(self._cost_forest.predict(x)[0])
        weight_mean = float(self._weight_forest.predict(x)[0])

        return SurrogatePrediction(
            comfort_coldest_hour_c=comfort_mean,
            comfort_std_c=comfort_std,
            cost_inr=cost_mean,
            weight_kg=weight_mean,
            trustworthy=comfort_std <= self.comfort_std_threshold_c,
        )
