"""
Phase D API surface.

  POST /blueprint/preview   body: {model, resolved_thicknesses?}
                             -> {"views": {plan, elevation_N/E/S/W, section}}
                             SVG strings for the frontend BlueprintModule
                             to render inline.
  POST /blueprint/pdf       same body -> a single multi-page PDF
                             (the actual downloadable deliverable).
  GET  /blueprint/projects/{project_id}/pdf
                             -> builds the PDF straight from a saved
                             project's model + resolved thicknesses
                             (as returned by POST /shelter/design), so
                             the frontend doesn't need to resend the model.

Both preview and pdf are built from the exact same
engine.blueprint.drawing_data.BlueprintData, so what a person sees in
the browser and what they download can never disagree.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from engine import storage
from engine.blueprint.drawing_data import build_blueprint_data
from engine.blueprint.pdf_export import build_pdf
from engine.blueprint.svg_generator import render_all
from engine.shelter_model import ShelterModel

router = APIRouter(prefix="/blueprint", tags=["blueprint"])


class BlueprintRequest(BaseModel):
    model: ShelterModel
    resolved_thicknesses: dict[str, float] = {}


@router.post("/preview")
def preview(req: BlueprintRequest):
    data = build_blueprint_data(req.model, req.resolved_thicknesses)
    return {"views": render_all(data)}


@router.post("/pdf")
def pdf(req: BlueprintRequest):
    data = build_blueprint_data(req.model, req.resolved_thicknesses)
    pdf_bytes = build_pdf(data)
    filename = f"{req.model.name.replace(' ', '_') or 'shelter'}_blueprint.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/projects/{project_id}/pdf")
def pdf_for_project(project_id: str):
    proj = storage.load_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail=f"No saved project '{project_id}'.")
    model = ShelterModel.model_validate(proj["model"])
    last_sim = proj.get("last_sim") or {}
    resolved = last_sim.get("resolved_thicknesses", {})
    data = build_blueprint_data(model, resolved)
    pdf_bytes = build_pdf(data)
    filename = f"{model.name.replace(' ', '_') or 'shelter'}_blueprint.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
