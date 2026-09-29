"""
API entrypoint. Run with:
    uvicorn api.main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="High-Altitude Shelter Thermal Sim API",
    version="0.0.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


from api.routes.materials import router as materials_router
app.include_router(materials_router)

from api.routes.simulate import router as simulate_router
app.include_router(simulate_router)

from api.routes.optimize import router as optimize_router
app.include_router(optimize_router)

from api.routes.retrofit import router as retrofit_router
app.include_router(retrofit_router)

from api.routes.design_days import router as design_days_router
app.include_router(design_days_router)

from api.routes.benchmark import router as benchmark_router
app.include_router(benchmark_router)

from api.routes.climate_status import router as climate_status_router
app.include_router(climate_status_router)

from api.routes.sandbox import router as sandbox_router
app.include_router(sandbox_router)

from api.routes.location import router as location_router
app.include_router(location_router)

from api.routes.shelter import router as shelter_router
app.include_router(shelter_router)
from api.routes.blueprint import router as blueprint_router
app.include_router(blueprint_router)
from api.routes.projects import router as projects_router
app.include_router(projects_router)