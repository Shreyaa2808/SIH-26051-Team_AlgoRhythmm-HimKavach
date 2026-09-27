"""
Materials library loader.

Phase B change: this now reads from the editable SQLite-backed store
(engine/materials/store.py) instead of the static, read-only
data/materials/materials.json. The JSON file still exists and is used
exactly once, automatically, to seed the database the first time it's
created — after that, materials.json is not read again; all reads/writes
go through the DB, which is what api/routes/materials.py's add/edit/delete
endpoints operate on.

Backward compatible: `Material` still has the same k/rho/cp/thermal_diffusivity
shape every existing caller (engine/solver/*, engine/shelter_model.py,
engine/optimizer/*) already relies on. `MaterialsLibrary()` with no
arguments now reads from the DB; passing an explicit `json_path=` still
loads a plain JSON file directly (useful for tests/fixtures), bypassing
the DB entirely.

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

from engine.materials import store as _store


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
    # Phase B additions. Defaulted so any code (or fixture JSON) built
    # against the pre-Phase-B shape keeps working unchanged.
    availability: str = "regional"
    logistics_note: str = ""
    last_updated: str = ""

    @property
    def thermal_diffusivity(self) -> float:
        """alpha = k / (rho * cp), m^2/s — used by the RC solver for node sizing."""
        return self.k / (self.rho * self.cp)


def _material_from_dict(m: dict) -> Material:
    return Material(
        id=m["id"], name=m["name"], category=m["category"],
        k=m["k"], rho=m["rho"], cp=m["cp"],
        cost_per_m3_inr=m.get("cost_per_m3_inr"), cost_per_m2_inr=m.get("cost_per_m2_inr"),
        cost_note=m.get("cost_note", ""), citation=m.get("citation", ""),
        carbon_kgco2e_per_kg=m.get("carbon_kgco2e_per_kg"), carbon_citation=m.get("carbon_citation", ""),
        availability=m.get("availability", "regional"),
        logistics_note=m.get("logistics_note", ""),
        last_updated=m.get("last_updated", ""),
    )


class MaterialsLibrary:
    def __init__(self, json_path: Optional[Path] = None, db_path: Optional[Path] = None):
        self._materials: dict[str, Material] = {}
        if json_path is not None:
            raw = json.loads(Path(json_path).read_text())
            for m in raw["materials"]:
                self._materials[m["id"]] = _material_from_dict(m)
        else:
            for m in _store.list_materials(db_path or _store.DB_PATH):
                self._materials[m["id"]] = _material_from_dict(m)

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
        print(f"{mat.id:35s} k={mat.k:6.3f}  rho={mat.rho:7.1f}  cp={mat.cp:6.0f}  cost=₹{cost}/{unit}  [{mat.availability}]")
