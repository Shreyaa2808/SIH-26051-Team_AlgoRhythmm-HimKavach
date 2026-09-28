"""
Phase 3 orchestrator — NEW-BUILD ONLY.

Pipeline:
  1. Sample an initial batch of designs, evaluate with the REAL physics
     solver (objectives.evaluate_design). This seeds the surrogate and is
     also what we fall back to entirely if scikit-learn isn't available.
  2. Fit ComfortCostWeightSurrogate on that batch.
  3. Run NSGA-II where the per-individual evaluate_fn:
       - asks the surrogate for a prediction
       - if surrogate.trustworthy: use the surrogate's numbers, SAFETY
         UNKNOWN (see step 4 — never trust the surrogate for safety)
       - if NOT trustworthy (comfort_std over threshold): fall back to a
         real physics run for this individual right now, and remember it
         so the surrogate gets retrained on it next refresh
     Every `retrain_every_n_generations`, the surrogate is refit on all
     physics points collected so far (initial batch + every fallback +
     every periodic re-verification sample), so it keeps improving as the
     search explores regions the initial sample didn't cover well.
  4. HARD REQUIREMENT: every individual in the GA's final Pareto front is
     re-evaluated with the real physics solver (regardless of whether step
     3 already had a physics-backed value for it) and its ACTUAL
     safety_passed is checked. Any design that fails safety is dropped
     from the returned front, never silently kept with a warning. This is
     the same non-negotiable rule as /simulate's interlock — the optimizer
     does not get to relax it just because a surrogate said it looked good.

This keeps physics-call count roughly: initial_batch + (some fraction of
population*generations, for untrustworthy predictions) + final_front_size.
Much less than population*generations physics calls if the surrogate earns
its keep, degrades gracefully to "basically the plain physics GA" if it
doesn't (e.g. very early on, or on a weird design space it hasn't seen).
"""
from __future__ import annotations

import random
from dataclasses import dataclass

from engine.materials.loader import MaterialsLibrary
from engine.optimizer.nsga2 import NSGA2, NSGA2Config, EvaluatedIndividual
from engine.optimizer.objectives import ObjectiveResult, evaluate_design
from engine.optimizer.search_space import DesignSpace, FixedParams, height_of, slope_of
from engine.optimizer.snow import roof_snow_load_kpa, snow_violation_reason
from engine.solver.thermal_solver import SiteSpec

try:
    from engine.optimizer.surrogate import ComfortCostWeightSurrogate

    _SURROGATE_AVAILABLE = True
except ImportError:
    _SURROGATE_AVAILABLE = False


@dataclass
class OptimizeConfig:
    initial_sample_size: int = 25
    population_size: int = 40
    generations: int = 15
    retrain_every_n_generations: int = 3
    use_surrogate: bool = True
    seed: int | None = 42
    # Phase E: opt-in free genes (off = legacy search space)
    free_roof_slope: bool = False
    free_ceiling_height: bool = False


@dataclass
class RankedDesign:
    genome: dict
    objectives: ObjectiveResult
    physics_verified: bool  # True once step 4 has run on it


def _to_evaluated(genome: dict, obj: ObjectiveResult) -> EvaluatedIndividual:
    violation = 0.0 if obj.safety_passed else 1.0
    return EvaluatedIndividual(
        genome=genome,
        objectives=obj.as_vector(),
        feasible=obj.safety_passed,
        violation=violation,
        raw=obj,
    )


def run_new_build_optimization(
    materials_lib: MaterialsLibrary,
    site: SiteSpec,
    fixed: FixedParams,
    outdoor_temp_c: list[float],
    ghi_wm2: list[float],
    wind_ms: list[float],
    lw_down_wm2: list[float] | None,
    config: OptimizeConfig | None = None,
) -> list[RankedDesign]:
    config = config or OptimizeConfig()
    rng = random.Random(config.seed)
    space = DesignSpace(
        materials_lib,
        free_roof_slope=config.free_roof_slope,
        free_ceiling_height=config.free_ceiling_height,
    )

    def run_physics(genome: dict) -> ObjectiveResult:
        return evaluate_design(
            materials_lib, site, fixed, genome,
            outdoor_temp_c, ghi_wm2, wind_ms, lw_down_wm2,
        )

    # --- 1. seed with a real-physics initial sample ---
    physics_genomes: list[dict] = [space.random_individual(rng) for _ in range(config.initial_sample_size)]
    physics_results: list[ObjectiveResult] = [run_physics(g) for g in physics_genomes]

    use_surrogate = config.use_surrogate and _SURROGATE_AVAILABLE
    surrogate = ComfortCostWeightSurrogate(space) if use_surrogate else None
    if surrogate is not None:
        surrogate.fit(physics_genomes, physics_results)

    gen_counter = {"n": 0}

    def evaluate_fn(genome: dict) -> EvaluatedIndividual:
        if surrogate is None:
            obj = run_physics(genome)
            physics_genomes.append(genome)
            physics_results.append(obj)
            return _to_evaluated(genome, obj)

        pred = surrogate.predict(genome)
        if pred.trustworthy:
            # Surrogate stands in for comfort/cost/weight. Safety is
            # UNKNOWN at this point — we optimistically assume feasible so
            # the GA can rank it, but this individual is NOT allowed to
            # leave the pipeline without the step-4 physics safety check.
            # Snow load is closed-form in the genome (no physics needed), so
            # unlike thermal safety it CAN be checked exactly here — this
            # stops the GA wasting its population on designs over the
            # user's snow limit. Thermal safety is still only checked in
            # step 4.
            slope = slope_of(genome, fixed)
            snow_reason = snow_violation_reason(
                slope, fixed.ground_snow_load_kpa, fixed.max_roof_snow_load_kpa
            )
            fake_obj = ObjectiveResult(
                comfort_coldest_hour_c=pred.comfort_coldest_hour_c,
                cost_inr=pred.cost_inr,
                weight_kg=pred.weight_kg,
                carbon_kgco2e=None,
                safety_passed=snow_reason is None,
                safety_reasons=[snow_reason] if snow_reason else [],
                wall_u_value_wm2k=float("nan"),
                roof_slope_deg=slope,
                ceiling_height_m=height_of(genome, fixed),
                roof_snow_load_kpa=roof_snow_load_kpa(slope, fixed.ground_snow_load_kpa),
            )
            return _to_evaluated(genome, fake_obj)

        # not trustworthy -> fall back to real physics right now
        obj = run_physics(genome)
        physics_genomes.append(genome)
        physics_results.append(obj)
        return _to_evaluated(genome, obj)

    ga_config = NSGA2Config(
        population_size=config.population_size,
        generations=1,  # we drive the generation loop ourselves, to allow retraining
        seed=config.seed,
    )
    ga = NSGA2(space, evaluate_fn, ga_config)

    # bootstrap population once, then hand-roll the generation loop so we
    # can retrain the surrogate between generations
    pop_genomes = [space.random_individual(rng) for _ in range(config.population_size)]
    pop = [evaluate_fn(g) for g in pop_genomes]

    for gen in range(config.generations):
        from engine.optimizer.nsga2 import (
            fast_non_dominated_sort,
            crowding_distance,
            _tournament_select,
        )

        fronts = fast_non_dominated_sort(pop)
        fronts_of, crowd = {}, {}
        for rank, front in enumerate(fronts):
            d = crowding_distance(pop, front)
            for i in front:
                fronts_of[i] = rank
                crowd[i] = d[i]

        offspring_genomes = []
        while len(offspring_genomes) < config.population_size:
            i1 = _tournament_select(pop, fronts_of, crowd, rng)
            i2 = _tournament_select(pop, fronts_of, crowd, rng)
            c1, c2 = ga._crossover(pop[i1].genome, pop[i2].genome)
            offspring_genomes.append(ga._mutate(c1))
            offspring_genomes.append(ga._mutate(c2))
        offspring_genomes = offspring_genomes[: config.population_size]
        offspring = [evaluate_fn(g) for g in offspring_genomes]

        combined = pop + offspring
        fronts = fast_non_dominated_sort(combined)
        new_pop = []
        for front in fronts:
            if len(new_pop) + len(front) <= config.population_size:
                new_pop.extend(combined[i] for i in front)
            else:
                d = crowding_distance(combined, front)
                remaining = config.population_size - len(new_pop)
                ranked = sorted(front, key=lambda i: d[i], reverse=True)
                new_pop.extend(combined[i] for i in ranked[:remaining])
                break
        pop = new_pop

        if surrogate is not None and (gen + 1) % config.retrain_every_n_generations == 0:
            surrogate.fit(physics_genomes, physics_results)

    fronts = fast_non_dominated_sort(pop) if pop else []
    pareto = [pop[i] for i in fronts[0]] if fronts else []

    # --- 4. hard requirement: physics-verify + re-check safety on the front ---
    verified: list[RankedDesign] = []
    for ind in pareto:
        obj = run_physics(ind.genome)
        if not obj.safety_passed:
            continue  # never return a design the real interlock rejects
        verified.append(RankedDesign(genome=ind.genome, objectives=obj, physics_verified=True))

    verified.sort(key=lambda rd: rd.objectives.cost_inr)
    return verified
