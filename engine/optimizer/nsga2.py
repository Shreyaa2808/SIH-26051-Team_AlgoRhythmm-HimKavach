"""
Minimal NSGA-II implementation over the mixed discrete/continuous design
dicts from search_space.py. No new heavy dependency (e.g. DEAP) — this is
~150 lines and easy for either of us to debug/modify later.

Constraint handling: the Phase 1 safety interlock (ACH/CO) is NOT folded
into the objective vector. A design that fails safety is not "a worse
design", it's not a valid design at all. We use constrained-domination
(Deb's rule): any feasible individual dominates any infeasible one,
regardless of objective values; among two infeasible individuals, lower
total constraint violation wins. This guarantees the returned Pareto front
never contains a design the interlock rejected.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable

Individual = dict
ObjectiveVector = tuple[float, ...]  # all entries MINIMIZE


@dataclass
class EvaluatedIndividual:
    genome: Individual
    objectives: ObjectiveVector
    feasible: bool
    violation: float = 0.0  # 0 if feasible
    raw: object = None      # original ObjectiveResult / surrogate output, for callers


def dominates(a: EvaluatedIndividual, b: EvaluatedIndividual) -> bool:
    if a.feasible != b.feasible:
        return a.feasible  # feasible always dominates infeasible
    if not a.feasible and not b.feasible:
        return a.violation < b.violation
    # both feasible: standard Pareto dominance
    at_least_one_better = False
    for av, bv in zip(a.objectives, b.objectives):
        if av > bv:
            return False
        if av < bv:
            at_least_one_better = True
    return at_least_one_better


def fast_non_dominated_sort(pop: list[EvaluatedIndividual]) -> list[list[int]]:
    n = len(pop)
    dominated_by = [set() for _ in range(n)]
    domination_count = [0] * n
    fronts: list[list[int]] = [[]]

    for p in range(n):
        for q in range(n):
            if p == q:
                continue
            if dominates(pop[p], pop[q]):
                dominated_by[p].add(q)
            elif dominates(pop[q], pop[p]):
                domination_count[p] += 1
        if domination_count[p] == 0:
            fronts[0].append(p)

    i = 0
    while fronts[i]:
        next_front = []
        for p in fronts[i]:
            for q in dominated_by[p]:
                domination_count[q] -= 1
                if domination_count[q] == 0:
                    next_front.append(q)
        i += 1
        fronts.append(next_front)
    fronts.pop()  # last one is always empty
    return fronts


def crowding_distance(pop: list[EvaluatedIndividual], front: list[int]) -> dict[int, float]:
    dist = {i: 0.0 for i in front}
    if not front:
        return dist
    n_obj = len(pop[front[0]].objectives)
    for m in range(n_obj):
        front_sorted = sorted(front, key=lambda i: pop[i].objectives[m])
        dist[front_sorted[0]] = float("inf")
        dist[front_sorted[-1]] = float("inf")
        lo = pop[front_sorted[0]].objectives[m]
        hi = pop[front_sorted[-1]].objectives[m]
        span = hi - lo
        if span == 0:
            continue
        for k in range(1, len(front_sorted) - 1):
            prev_v = pop[front_sorted[k - 1]].objectives[m]
            next_v = pop[front_sorted[k + 1]].objectives[m]
            dist[front_sorted[k]] += (next_v - prev_v) / span
    return dist


def _tournament_select(pop, fronts_of, crowd, rng) -> int:
    a, b = rng.sample(range(len(pop)), 2)
    fa, fb = fronts_of[a], fronts_of[b]
    if fa != fb:
        return a if fa < fb else b
    return a if crowd[a] > crowd[b] else b


@dataclass
class NSGA2Config:
    population_size: int = 40
    generations: int = 15
    crossover_rate: float = 0.9
    mutation_rate: float = 0.2
    categorical_fields: tuple[str, ...] = ("wall_material_id", "insulation_material_id")
    seed: int | None = None


class NSGA2:
    """
    evaluate_fn(genome: dict) -> EvaluatedIndividual
    space: search_space.DesignSpace (for random_individual/clip_continuous
           and to know which categorical choices are valid)
    """

    def __init__(self, space, evaluate_fn: Callable[[Individual], EvaluatedIndividual], config: NSGA2Config):
        self.space = space
        self.evaluate_fn = evaluate_fn
        self.config = config
        self.rng = random.Random(config.seed)

    def _crossover(self, p1: Individual, p2: Individual) -> tuple[Individual, Individual]:
        c1, c2 = dict(p1), dict(p2)
        if self.rng.random() > self.config.crossover_rate:
            return c1, c2
        for field_name in self.config.categorical_fields:
            if self.rng.random() < 0.5:
                c1[field_name], c2[field_name] = c2[field_name], c1[field_name]
        for field_name in self.space.continuous_bounds:
            alpha = self.rng.random()
            v1 = alpha * p1[field_name] + (1 - alpha) * p2[field_name]
            v2 = alpha * p2[field_name] + (1 - alpha) * p1[field_name]
            c1[field_name], c2[field_name] = v1, v2
        return self.space.clip_continuous(c1), self.space.clip_continuous(c2)

    def _mutate(self, ind: Individual) -> Individual:
        out = dict(ind)
        if self.rng.random() < self.config.mutation_rate:
            out["wall_material_id"] = self.rng.choice(self.space.wall_material_ids)
        if self.rng.random() < self.config.mutation_rate:
            out["insulation_material_id"] = self.rng.choice(self.space.insulation_material_ids)
        for field_name, b in self.space.continuous_bounds.items():
            if self.rng.random() < self.config.mutation_rate:
                span = b.hi - b.lo
                out[field_name] += self.rng.gauss(0, span * 0.1)
        return self.space.clip_continuous(out)

    def run(self) -> list[EvaluatedIndividual]:
        cfg = self.config
        pop_genomes = [self.space.random_individual(self.rng) for _ in range(cfg.population_size)]
        pop = [self.evaluate_fn(g) for g in pop_genomes]

        for _gen in range(cfg.generations):
            fronts = fast_non_dominated_sort(pop)
            fronts_of = {}
            crowd = {}
            for rank, front in enumerate(fronts):
                d = crowding_distance(pop, front)
                for i in front:
                    fronts_of[i] = rank
                    crowd[i] = d[i]

            offspring_genomes = []
            while len(offspring_genomes) < cfg.population_size:
                i1 = _tournament_select(pop, fronts_of, crowd, self.rng)
                i2 = _tournament_select(pop, fronts_of, crowd, self.rng)
                c1, c2 = self._crossover(pop[i1].genome, pop[i2].genome)
                offspring_genomes.append(self._mutate(c1))
                offspring_genomes.append(self._mutate(c2))
            offspring_genomes = offspring_genomes[: cfg.population_size]
            offspring = [self.evaluate_fn(g) for g in offspring_genomes]

            combined = pop + offspring
            fronts = fast_non_dominated_sort(combined)
            new_pop: list[EvaluatedIndividual] = []
            for front in fronts:
                if len(new_pop) + len(front) <= cfg.population_size:
                    new_pop.extend(combined[i] for i in front)
                else:
                    d = crowding_distance(combined, front)
                    remaining = cfg.population_size - len(new_pop)
                    ranked = sorted(front, key=lambda i: d[i], reverse=True)
                    new_pop.extend(combined[i] for i in ranked[:remaining])
                    break
            pop = new_pop

        fronts = fast_non_dominated_sort(pop)
        return [pop[i] for i in fronts[0]] if fronts else []
