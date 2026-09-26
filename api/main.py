"""
API entrypoint. Run with:
    uvicorn api.main:app --reload --port 8000

Phase 0: skeleton only, health check + materials listing.
Phase 1 adds api/routes/simulate.py with the real /simulate endpoint.
"""
from fastapi import FastAPI

from engine.materials.loader import MaterialsLibrary

app = FastAPI(title="High-Altitude Shelter Thermal Sim API", version="0.0.1")

_materials_lib = MaterialsLibrary()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/materials")
def list_materials():
    return [
        {
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "k": m.k,
            "rho": m.rho,
            "cp": m.cp,
        }
        for m in _materials_lib.all()
    ]


# Phase 1: from api.routes.simulate import router as simulate_router
# app.include_router(simulate_router)
