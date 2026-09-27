"""
Materials library loader.

Usage:
    from engine.materials.loader import MaterialsLibrary

    lib = MaterialsLibrary()
    eps = lib.get("expanded_polystyrene_eps")
    print(eps.k, eps.rho, eps.cp)
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "data" / "materials" / "materials.json"


@dataclass
class Material:
    id: str
    name: str
    category: str
    k: float          # W/(m·K)
    rho: float         # kg/m^3
    cp: float          # J/(kg·K)
    cost_per_m3_inr: Optional[float]
    cost_per_m2_inr: Optional[float]
    cost_note: str
    citation: str
    carbon_kgco2e_per_kg: Optional[float] = None
    carbon_citation: str = ""

    @property
    def thermal_diffusivity(self) -> float:
        """alpha = k / (rho * cp), m^2/s — used by the RC solver for node sizing."""
        return self.k / (self.rho * self.cp)


class MaterialsLibrary:
    def __init__(self, path: Path = DEFAULT_PATH):
        self._path = path
        raw = json.loads(path.read_text())
        self._materials: dict[str, Material] = {}
        for m in raw["materials"]:
            self._materials[m["id"]] = Material(
                id=m["id"],
                name=m["name"],
                category=m["category"],
                k=m["k"],
                rho=m["rho"],
                cp=m["cp"],
                cost_per_m3_inr=m.get("cost_per_m3_inr"),
                cost_per_m2_inr=m.get("cost_per_m2_inr"),
                cost_note=m.get("cost_note", ""),
                citation=m.get("citation", ""),
                carbon_kgco2e_per_kg=m.get("carbon_kgco2e_per_kg"),
                carbon_citation=m.get("carbon_citation", ""),
            )

    def get(self, material_id: str) -> Material:
        if material_id not in self._materials:
            raise KeyError(
                f"Unknown material '{material_id}'. Available: {list(self._materials)}"
            )
        return self._materials[material_id]

    def all(self) -> list[Material]:
        return list(self._materials.values())

    def by_category(self, category: str) -> list[Material]:
        return [m for m in self._materials.values() if m.category == category]


if __name__ == "__main__":
    lib = MaterialsLibrary()
    for mat in lib.all():
        cost = mat.cost_per_m3_inr or mat.cost_per_m2_inr
        unit = "m3" if mat.cost_per_m3_inr else "m2"
        print(f"{mat.id:35s} k={mat.k:6.3f}  rho={mat.rho:7.1f}  cp={mat.cp:6.0f}  cost=₹{cost}/{unit}")
