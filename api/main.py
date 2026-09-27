
"""
API entrypoint. Run with:
    uvicorn api.main:app --reload --port 8000

Phase 0: skeleton only, health check + materials listing.
Phase 1 adds api/routes/simulate.py with the real /simulate endpoint.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engine.materials.loader import MaterialsLibrary

app = FastAPI(title="High-Altitude Shelter Thermal Sim API", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
            "cost_per_m3_inr": getattr(m, "cost_per_m3_inr", None),
            "cost_per_m2_inr": getattr(m, "cost_per_m2_inr", None),
            "cost_note": getattr(m, "cost_note", None),
            "citation": getattr(m, "citation", None),
        }
        for m in _materials_lib.all()
    ]


from api.routes.simulate import router as simulate_router
app.include_router(simulate_router)

from api.routes.optimize import router as optimize_router
app.include_router(optimize_router)

from api.routes.retrofit import router as retrofit_router
app.include_router(retrofit_router)

from api.routes.design_days import router as design_days_router
app.include_router(design_days_router)
