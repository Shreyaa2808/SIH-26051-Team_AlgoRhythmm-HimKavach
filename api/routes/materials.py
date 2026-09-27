"""
Phase B API surface: materials CRUD.

Replaces the inline, read-only `GET /materials` that used to live directly
in api/main.py (see api/main.py.PATCH.txt in this patch — remove that
inline block, include this router instead). Same response shape as before
for existing fields, plus availability/logistics_note/last_updated.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.materials import store

router = APIRouter(tags=["materials"])


class MaterialIn(BaseModel):
    id: str = Field(..., description="stable slug, e.g. 'expanded_polystyrene_eps'")
    name: str
    category: str
    k: float = Field(..., gt=0, description="thermal conductivity, W/(m·K)")
    rho: float = Field(..., gt=0, description="density, kg/m^3")
    cp: float = Field(..., gt=0, description="specific heat, J/(kg·K)")
    cost_per_m3_inr: float | None = None
    cost_per_m2_inr: float | None = None
    cost_note: str = ""
    citation: str = ""
    carbon_kgco2e_per_kg: float | None = None
    carbon_citation: str = ""
    availability: str = Field("regional", description="'local' | 'regional' | 'imported' | 'fabricated_onsite'")
    logistics_note: str = Field("", description="e.g. 'airliftable, Chinook underslung' or 'paved-road delivery only'")


class MaterialPatch(BaseModel):
    """Every field optional — PUT sends only what changed."""
    name: str | None = None
    category: str | None = None
    k: float | None = Field(None, gt=0)
    rho: float | None = Field(None, gt=0)
    cp: float | None = Field(None, gt=0)
    cost_per_m3_inr: float | None = None
    cost_per_m2_inr: float | None = None
    cost_note: str | None = None
    citation: str | None = None
    carbon_kgco2e_per_kg: float | None = None
    carbon_citation: str | None = None
    availability: str | None = None
    logistics_note: str | None = None


@router.get("/materials")
def list_materials():
    return store.list_materials()


@router.get("/materials/{material_id}")
def get_material(material_id: str):
    m = store.get_material(material_id)
    if m is None:
        raise HTTPException(status_code=404, detail=f"No material '{material_id}'.")
    return m


@router.post("/materials", status_code=201)
def create_material(material: MaterialIn):
    try:
        return store.create_material(material.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/materials/{material_id}")
def update_material(material_id: str, patch: MaterialPatch):
    try:
        updated = store.update_material(material_id, {k: v for k, v in patch.model_dump().items() if v is not None})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if updated is None:
        raise HTTPException(status_code=404, detail=f"No material '{material_id}'.")
    return updated


@router.delete("/materials/{material_id}")
def delete_material(material_id: str):
    ok = store.delete_material(material_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"No material '{material_id}'.")
    return {"deleted": material_id}
