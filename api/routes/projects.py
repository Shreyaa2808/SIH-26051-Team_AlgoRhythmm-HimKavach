"""Person 1: design-project routes (create/open/save/rename/delete)."""
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from engine import project_store

router = APIRouter(prefix="/design-projects", tags=["design-projects"])


class RenameBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


@router.get("")
def list_projects():
    return project_store.list_all()


@router.get("/{project_id}")
def get_project(project_id: str):
    doc = project_store.load(project_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


@router.put("/{project_id}")
def save_project(project_id: str, project: dict = Body(...)):
    if project.get("projectId") != project_id:
        raise HTTPException(status_code=400, detail="projectId does not match URL")
    return project_store.save(project)


@router.patch("/{project_id}/rename")
def rename_project(project_id: str, body: RenameBody):
    name = body.name.strip()
    if not name or not project_store.rename(project_id, name):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True, "name": name}


@router.delete("/{project_id}")
def delete_project(project_id: str):
    if not project_store.delete(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}