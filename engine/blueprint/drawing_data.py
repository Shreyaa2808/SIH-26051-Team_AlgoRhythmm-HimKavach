"""
Computes everything a renderer needs to draw the blueprint set, from a
ShelterModel (+ optionally the resolved auto-thicknesses returned by
POST /shelter/design). Pure data — no SVG/PDF/drawing-library code here,
so svg_generator.py and pdf_export.py can never disagree about geometry.

Units: all lengths in the returned dataclasses are METERS. Renderers
convert to their own drawing units (px, pt) at the last moment via a
single `scale` (units-per-meter) they choose for their page/viewport.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from engine.shelter_model import CARDINALS, ShelterModel, WallSpec

# Fallback thickness (m) used only for drawing when a thickness is still
# `None` (auto) and no resolved value was supplied — never affects the
# thermal solver, only keeps the drawing from collapsing to zero width.
_DEFAULT_DRAW_THICKNESS_M = 0.35
_DEFAULT_INSULATION_DRAW_THICKNESS_M = 0.08

_WALL_DIM_FOR = {"N": "length_m", "S": "length_m", "E": "width_m", "W": "width_m"}
_BASE_BEARING = {"N": 0.0, "E": 90.0, "S": 180.0, "W": 270.0}


@dataclass
class OpeningLayout:
    type: str
    x_m: float          # offset from the wall's left edge (drawing left-to-right)
    z_m: float           # offset from floor (elevations) / unused in plan
    width_m: float
    height_m: float


@dataclass
class WallLayout:
    cardinal: str
    gross_length_m: float
    structural_thickness_m: float
    insulation_thickness_m: float
    total_thickness_m: float
    material_id: str
    insulation_material_id: str | None
    openings: list[OpeningLayout]
    bearing_deg: float   # compass bearing this wall faces, post-rotation


@dataclass
class RoofLayout:
    slope_deg: float
    orientation_deg: float
    structural_thickness_m: float
    insulation_thickness_m: float
    rise_m: float         # vertical rise from eave to ridge over half-span


@dataclass
class FloorLayout:
    structural_thickness_m: float
    insulation_thickness_m: float


@dataclass
class TitleBlockInfo:
    project_name: str
    site_id: str
    drawing_date: str
    revision: str = "A"
    scale_label: str = ""
    drawn_for: str = "SIH26051 — LADAKH-ADAPT / HimKavach"


@dataclass
class BlueprintData:
    length_m: float          # footprint dimension along N/S wall run
    width_m: float           # footprint dimension along E/W wall run
    ceiling_height_m: float
    orientation_deg: float
    walls: dict[str, WallLayout]
    roof: RoofLayout
    floor: FloorLayout
    title_block: TitleBlockInfo


def _resolve_thickness(explicit: float | None, key: str, resolved: dict[str, float],
                        default: float) -> float:
    if explicit is not None:
        return explicit
    if key in resolved:
        return resolved[key]
    return default


def build_blueprint_data(
    model: ShelterModel,
    resolved_thicknesses: dict[str, float] | None = None,
) -> BlueprintData:
    resolved = resolved_thicknesses or {}
    rotated_bearing = {c: (b + model.orientation_deg) % 360.0 for c, b in _BASE_BEARING.items()}

    walls: dict[str, WallLayout] = {}
    for cardinal in CARDINALS:
        w: WallSpec = model.wall(cardinal)
        struct_t = _resolve_thickness(
            w.structural_thickness_m, f"{cardinal}_structural", resolved, _DEFAULT_DRAW_THICKNESS_M
        )
        ins_t = 0.0
        if w.insulation_material_id:
            ins_t = _resolve_thickness(
                w.insulation_thickness_m, f"{cardinal}_insulation", resolved,
                _DEFAULT_INSULATION_DRAW_THICKNESS_M,
            )
        openings = [
            OpeningLayout(type=o.type.value, x_m=o.offset_x_m, z_m=o.offset_z_m,
                          width_m=o.width_m, height_m=o.height_m)
            for o in w.openings
        ]
        walls[cardinal] = WallLayout(
            cardinal=cardinal,
            gross_length_m=getattr(model, _WALL_DIM_FOR[cardinal]),
            structural_thickness_m=struct_t,
            insulation_thickness_m=ins_t,
            total_thickness_m=struct_t + ins_t,
            material_id=w.structural_material_id,
            insulation_material_id=w.insulation_material_id,
            openings=openings,
            bearing_deg=rotated_bearing[cardinal],
        )

    roof_struct_t = _resolve_thickness(
        model.roof.structural_thickness_m, "roof_structural", resolved, _DEFAULT_DRAW_THICKNESS_M
    )
    roof_ins_t = 0.0
    if model.roof.insulation_material_id:
        roof_ins_t = _resolve_thickness(
            model.roof.insulation_thickness_m, "roof_insulation", resolved,
            _DEFAULT_INSULATION_DRAW_THICKNESS_M,
        )
    import math
    half_span = max(model.length_m, model.width_m) / 2.0
    rise_m = half_span * math.tan(math.radians(model.roof.slope_deg))

    roof = RoofLayout(
        slope_deg=model.roof.slope_deg,
        orientation_deg=model.roof.orientation_deg,
        structural_thickness_m=roof_struct_t,
        insulation_thickness_m=roof_ins_t,
        rise_m=rise_m,
    )

    floor_ins_t = 0.0
    if model.floor.insulation_material_id:
        floor_ins_t = _resolve_thickness(
            model.floor.insulation_thickness_m, "floor_insulation", resolved,
            _DEFAULT_INSULATION_DRAW_THICKNESS_M,
        )
    floor = FloorLayout(
        structural_thickness_m=model.floor.structural_thickness_m,
        insulation_thickness_m=floor_ins_t,
    )

    title_block = TitleBlockInfo(
        project_name=model.name,
        site_id=model.site_id,
        drawing_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )

    return BlueprintData(
        length_m=model.length_m, width_m=model.width_m,
        ceiling_height_m=model.ceiling_height_m, orientation_deg=model.orientation_deg,
        walls=walls, roof=roof, floor=floor, title_block=title_block,
    )
