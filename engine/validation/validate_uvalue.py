"""
Phase 2 validation, part 1: steady-state U-value check.

Before trusting the transient solver, check that the steady-state
conduction math (the easy, unambiguous part) reproduces a published
real-world result. We rebuild the HIAL PreFreb wall and roof assemblies
from data/climate/leh_hial_reference.json using our own ConstructionAssembly
and compare our computed U-value to the paper's reported value.

This is deliberately a narrow, decisive test -- it validates conduction
resistance math and material-layer discretization, not solar gain,
infiltration, or transient response (those need the hourly-forcing run
in validate_transient.py).
"""
from __future__ import annotations

import json
from pathlib import Path

from engine.materials.loader import MaterialsLibrary
from engine.solver.rc_network import ConstructionAssembly, Layer

REFERENCE_PATH = Path(__file__).resolve().parents[2] / "data" / "climate" / "leh_hial_reference.json"


def load_reference() -> dict:
    return json.loads(REFERENCE_PATH.read_text())


def build_assembly_from_reference(name: str, spec: dict, materials_lib: MaterialsLibrary) -> ConstructionAssembly:
    layers = [
        Layer(
            material=materials_lib.get(l["material"]),
            thickness_m=l["thickness_m"],
            n_nodes=3,
        )
        for l in spec["layers_outside_to_inside"]
    ]
    assembly = ConstructionAssembly(name=name, layers=layers)
    assembly.build_nodes()
    return assembly


def run_uvalue_validation() -> list[dict]:
    ref = load_reference()
    lib = MaterialsLibrary()
    results = []

    for key, label in [("prefreb_wall_construction", "PreFreb wall"), ("prefreb_roof_construction", "PreFreb roof")]:
        spec = ref[key]
        assembly = build_assembly_from_reference(label, spec, lib)
        computed_u = assembly.u_value()
        published_u = spec["published_u_value_wm2k"]
        pct_error = 100.0 * (computed_u - published_u) / published_u

        results.append({
            "construction": label,
            "computed_u_wm2k": round(computed_u, 4),
            "published_u_wm2k": published_u,
            "pct_error": round(pct_error, 1),
            "note": spec.get("note", ""),
        })

    return results


if __name__ == "__main__":
    results = run_uvalue_validation()
    print(f"{'Construction':<15} {'Computed U':>12} {'Published U':>13} {'% error':>9}")
    for r in results:
        print(f"{r['construction']:<15} {r['computed_u_wm2k']:>10.4f}   {r['published_u_wm2k']:>11.3f}   {r['pct_error']:>7.1f}%")
        if r["note"]:
            print(f"  note: {r['note']}")
