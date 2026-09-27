"""
Phase A deliverable: the ShelterModel schema.

Everything downstream (3D twin, blueprint export, budget, optimizer) reads
and writes THIS shape from now on. It replaces the old assumption baked into
`make_simple_box_geometry` (same wall material/thickness on all four sides).

Design principles baked in, per the roadmap:
  - Every wall is independent: its own material, insulation, thickness,
    and openings (windows/doors/vents). North wall in Ladakh should look
    nothing like the south (Trombe) wall, and now it can.
  - Thickness is OPTIONAL. Leave it None and the system solves for the
    thinnest thickness that still clears the safety/comfort target for
    this site + occupancy purpose (see engine/optimizer/auto_thickness.py).
    This is the "stop asking the user for numbers they can't reason
    about" requirement.
  - `occupancy.purpose` drives sane defaults (military forward post vs.
    a long-stay research station have different comfort targets, budget
    ceilings, and structure lifetimes) instead of the user guessing.
  - This module is additive: `engine/solver/thermal_solver.py` and the
    existing `/simulate` endpoint are UNTOUCHED. `to_geometry_spec()`
    below produces the exact same `GeometrySpec` object that the solver
    already consumes, just built from richer, per-wall input instead of
    one shared config. Nothing about the physics engine changes.
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from engine.materials.loader import MaterialsLibrary
from engine.solver.night_gate import NightGateSchedule
from engine.solver.rc_network import ConstructionAssembly, Layer
from engine.solver.thermal_solver import GeometrySpec, SurfaceSpec

CARDINALS = ("N", "E", "S", "W")

# ---------------------------------------------------------------------------
# Occupancy purpose presets — drives comfort target + default budget ceiling
# + expected structure lifetime. This is what lets the system say "this is
# a military forward post, so build it differently" instead of the user
# picking every parameter by hand.
# ---------------------------------------------------------------------------


class OccupancyPurpose(str, Enum):
    military_forward_post = "military_forward_post"   # short stays, rotating personnel, ruggedness > comfort
    military_permanent = "military_permanent"          # long-term garrison, comfort matters more
    research_station = "research_station"              # long stay, equipment-sensitive, stable temp priority
    civilian_expedition = "civilian_expedition"        # short stay, cost-sensitive
    civilian_permanent = "civilian_permanent"          # family/long-term dwelling


@dataclass(frozen=True)
class OccupancyPreset:
    min_indoor_target_c: float          # design target for coldest hour
    max_budget_inr_per_m2: float        # soft ceiling used by auto-design/optimizer
    design_lifetime_years: int
    notes: str


OCCUPANCY_PRESETS: dict[OccupancyPurpose, OccupancyPreset] = {
    OccupancyPurpose.military_forward_post: OccupancyPreset(
        min_indoor_target_c=12.0, max_budget_inr_per_m2=45000, design_lifetime_years=5,
        notes="Short rotations, rapid-deploy priority; comfort target is 'safe', not 'cozy'.",
    ),
    OccupancyPurpose.military_permanent: OccupancyPreset(
        min_indoor_target_c=16.0, max_budget_inr_per_m2=65000, design_lifetime_years=15,
        notes="Garrison-grade; higher insulation spend justified by duration of use.",
    ),
    OccupancyPurpose.research_station: OccupancyPreset(
        min_indoor_target_c=18.0, max_budget_inr_per_m2=80000, design_lifetime_years=20,
        notes="Equipment + long-stay personnel; stability matters more than peak temp.",
    ),
    OccupancyPurpose.civilian_expedition: OccupancyPreset(
        min_indoor_target_c=10.0, max_budget_inr_per_m2=30000, design_lifetime_years=3,
        notes="Cost-sensitive, short-duration; minimum viable envelope.",
    ),
    OccupancyPurpose.civilian_permanent: OccupancyPreset(
        min_indoor_target_c=18.0, max_budget_inr_per_m2=70000, design_lifetime_years=25,
        notes="Family dwelling; comfort and long-run fuel savings both matter.",
    ),
}


class Occupancy(BaseModel):
    purpose: OccupancyPurpose = OccupancyPurpose.civilian_permanent
    headcount: int = Field(4, ge=1, le=200)
    stay_duration_days: Optional[int] = Field(
        None, description="If null, uses the purpose preset's typical duration."
    )

    def preset(self) -> OccupancyPreset:
        return OCCUPANCY_PRESETS[self.purpose]


# ---------------------------------------------------------------------------
# Openings (windows / doors / vents) — cut out of a specific wall
# ---------------------------------------------------------------------------


class OpeningType(str, Enum):
    window = "window"
    door = "door"
    vent = "vent"


class Opening(BaseModel):
    type: OpeningType
    width_m: float = Field(..., gt=0)
    height_m: float = Field(..., gt=0)
    # position of the opening's bottom-left corner within the wall, meters
    # from the wall's left edge / floor. Used by the blueprint + 3D
    # renderers (Phase C/D); the thermal solver only needs the area + which
    # glazing material (for windows).
    offset_x_m: float = 0.0
    offset_z_m: float = 0.0
    glazing_material_id: Optional[str] = Field(
        None, description="Required for type=window; ignored for door/vent."
    )

    @property
    def area_m2(self) -> float:
        return self.width_m * self.height_m

    @model_validator(mode="after")
    def _check_glazing(self):
        if self.type == OpeningType.window and not self.glazing_material_id:
            raise ValueError("window openings must set glazing_material_id")
        return self


# ---------------------------------------------------------------------------
# Per-wall spec — the core Phase A change: no more one shared assembly
# ---------------------------------------------------------------------------


class WallSpec(BaseModel):
    cardinal: str = Field(..., description="'N', 'E', 'S', or 'W' (pre-rotation compass label)")
    structural_material_id: str
    insulation_material_id: Optional[str] = None
    structural_thickness_m: Optional[float] = Field(
        None, description="None = system solves for the optimal thickness."
    )
    insulation_thickness_m: Optional[float] = Field(
        None, description="None = system solves for the optimal thickness."
    )
    openings: list[Opening] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_cardinal(self):
        if self.cardinal not in CARDINALS:
            raise ValueError(f"cardinal must be one of {CARDINALS}, got {self.cardinal!r}")
        return self

    @property
    def is_auto_thickness(self) -> bool:
        return self.structural_thickness_m is None or (
            self.insulation_material_id is not None and self.insulation_thickness_m is None
        )


class RoofSpec(BaseModel):
    structural_material_id: str
    insulation_material_id: Optional[str] = None
    structural_thickness_m: Optional[float] = None
    insulation_thickness_m: Optional[float] = None
    slope_deg: float = Field(11.0, ge=0, le=60, description="0 = flat; Ladakh vernacular sheds run ~10-15deg")
    orientation_deg: float = Field(180.0, ge=0, lt=360, description="downslope-facing compass bearing")


class FloorSpec(BaseModel):
    structural_material_id: str = "local_stone_masonry"
    insulation_material_id: Optional[str] = None
    structural_thickness_m: float = 0.15
    insulation_thickness_m: Optional[float] = None
    ground_temp_c: float = 2.0


class ShelterModel(BaseModel):
    """The single source of truth for one shelter design."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str = "Untitled shelter"
    site_id: str = "leh"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    length_m: float = Field(4.0, gt=0, description="footprint dimension along the N/S wall run")
    width_m: float = Field(4.0, gt=0, description="footprint dimension along the E/W wall run")
    ceiling_height_m: float = Field(2.4, gt=0)
    orientation_deg: float = Field(0.0, ge=0, lt=360, description="compass bearing wall_N faces")

    occupancy: Occupancy = Field(default_factory=Occupancy)

    walls: list[WallSpec] = Field(
        default_factory=lambda: [
            WallSpec(cardinal=c, structural_material_id="local_stone_masonry") for c in CARDINALS
        ]
    )
    roof: RoofSpec = Field(default_factory=lambda: RoofSpec(structural_material_id="local_stone_masonry"))
    floor: FloorSpec = Field(default_factory=FloorSpec)

    leakage_area_cm2: float = 200.0
    night_gate_enabled: bool = False
    night_gate_close_hour: float = 19.0
    night_gate_open_hour: float = 7.0
    night_gate_closed_leakage_area_cm2: float = 60.0

    @model_validator(mode="after")
    def _check_walls(self):
        cardinals_present = {w.cardinal for w in self.walls}
        missing = set(CARDINALS) - cardinals_present
        if missing:
            raise ValueError(f"ShelterModel must define all 4 walls; missing {sorted(missing)}")
        return self

    @property
    def floor_area_m2(self) -> float:
        return self.length_m * self.width_m

    def wall(self, cardinal: str) -> WallSpec:
        for w in self.walls:
            if w.cardinal == cardinal:
                return w
        raise KeyError(cardinal)

    def needs_auto_thickness(self) -> bool:
        return any(w.is_auto_thickness for w in self.walls)


# ---------------------------------------------------------------------------
# ShelterModel -> GeometrySpec (feeds the existing, unmodified solver)
# ---------------------------------------------------------------------------

_WALL_DIM_FOR = {  # which footprint dimension gives a wall's gross length
    "N": "length_m", "S": "length_m", "E": "width_m", "W": "width_m",
}
_BASE_BEARING = {"N": 0.0, "E": 90.0, "S": 180.0, "W": 270.0}


def _assembly(materials_lib: MaterialsLibrary, name: str, structural_id: str,
              structural_thickness_m: float, insulation_id: str | None,
              insulation_thickness_m: float | None) -> ConstructionAssembly:
    layers = [Layer(material=materials_lib.get(structural_id), thickness_m=structural_thickness_m, n_nodes=3)]
    if insulation_id and insulation_thickness_m:
        layers.append(Layer(material=materials_lib.get(insulation_id), thickness_m=insulation_thickness_m, n_nodes=2))
    a = ConstructionAssembly(name=name, layers=layers)
    a.build_nodes()
    return a


def to_geometry_spec(
    model: ShelterModel,
    materials_lib: MaterialsLibrary,
    resolved_thicknesses: Optional[dict[str, float]] = None,
) -> GeometrySpec:
    """
    Builds the exact GeometrySpec the existing thermal_solver.simulate()
    already knows how to run, from a fully-specified ShelterModel.

    `resolved_thicknesses` supplies values for any wall/roof/floor field
    left as None (auto), keyed "<cardinal>_structural", "<cardinal>_insulation",
    "roof_structural", "roof_insulation", "floor_insulation". Call
    engine/optimizer/auto_thickness.solve_shelter_thicknesses() first to get
    this dict — to_geometry_spec() itself does no solving, it only assembles.
    Raises ValueError if a thickness is still missing after that.
    """
    resolved = resolved_thicknesses or {}

    def _need(key: str, explicit: float | None) -> float:
        if explicit is not None:
            return explicit
        if key in resolved:
            return resolved[key]
        raise ValueError(
            f"Thickness for '{key}' was left as auto but no resolved value was "
            f"supplied. Call solve_shelter_thicknesses(model, ...) first."
        )

    rotated_bearing = {c: (b + model.orientation_deg) % 360.0 for c, b in _BASE_BEARING.items()}
    surfaces: list[SurfaceSpec] = []

    for cardinal in CARDINALS:
        w = model.wall(cardinal)
        gross_len = getattr(model, _WALL_DIM_FOR[cardinal])
        gross_area = gross_len * model.ceiling_height_m
        opening_area = sum(o.area_m2 for o in w.openings)
        if opening_area >= gross_area:
            raise ValueError(f"wall {cardinal}: openings ({opening_area:.1f} m2) exceed wall area ({gross_area:.1f} m2)")
        net_area = gross_area - opening_area

        struct_t = _need(f"{cardinal}_structural", w.structural_thickness_m)
        ins_t = None
        if w.insulation_material_id:
            ins_t = _need(f"{cardinal}_insulation", w.insulation_thickness_m)

        surfaces.append(SurfaceSpec(
            name=f"wall_{cardinal}", area_m2=net_area, tilt_deg=90,
            azimuth_deg=rotated_bearing[cardinal],
            assembly=_assembly(materials_lib, f"wall_{cardinal}", w.structural_material_id,
                                struct_t, w.insulation_material_id, ins_t),
        ))

        for i, o in enumerate(w.openings):
            if o.type != OpeningType.window:
                continue  # doors/vents already subtracted from net_area; no separate thermal surface (Phase C gives them geometry)
            glazing = materials_lib.get(o.glazing_material_id)
            win_assembly = ConstructionAssembly(name=f"window_{cardinal}_{i}",
                                                 layers=[Layer(material=glazing, thickness_m=0.024, n_nodes=1)])
            win_assembly.build_nodes()
            surfaces.append(SurfaceSpec(
                name=f"window_{cardinal}_{i}", area_m2=o.area_m2, tilt_deg=90,
                azimuth_deg=rotated_bearing[cardinal], assembly=win_assembly,
            ))

    roof_tilt = max(0.0, model.roof.slope_deg)
    roof_area = model.floor_area_m2 / math.cos(math.radians(min(roof_tilt, 60.0))) if roof_tilt > 0 else model.floor_area_m2
    roof_struct_t = _need("roof_structural", model.roof.structural_thickness_m)
    roof_ins_t = _need("roof_insulation", model.roof.insulation_thickness_m) if model.roof.insulation_material_id else None
    surfaces.append(SurfaceSpec(
        name="roof", area_m2=roof_area, tilt_deg=roof_tilt if roof_tilt > 0 else 5,
        azimuth_deg=model.roof.orientation_deg,
        assembly=_assembly(materials_lib, "roof", model.roof.structural_material_id,
                            roof_struct_t, model.roof.insulation_material_id, roof_ins_t),
    ))

    floor_ins_t = _need("floor_insulation", model.floor.insulation_thickness_m) if model.floor.insulation_material_id else None
    surfaces.append(SurfaceSpec(
        name="floor", area_m2=model.floor_area_m2, tilt_deg=0, azimuth_deg=0,
        assembly=_assembly(materials_lib, "floor", model.floor.structural_material_id,
                            model.floor.structural_thickness_m, model.floor.insulation_material_id, floor_ins_t),
        is_ground_coupled=True, ground_temp_c=model.floor.ground_temp_c,
    ))

    return GeometrySpec(
        surfaces=surfaces,
        floor_area_m2=model.floor_area_m2,
        ceiling_height_m=model.ceiling_height_m,
        leakage_area_cm2=model.leakage_area_cm2,
        night_gate=(
            NightGateSchedule(
                close_hour=model.night_gate_close_hour,
                open_hour=model.night_gate_open_hour,
                leakage_area_closed_cm2=model.night_gate_closed_leakage_area_cm2,
            ) if model.night_gate_enabled else None
        ),
    )
