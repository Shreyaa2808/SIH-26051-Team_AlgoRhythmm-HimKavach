"""
Renders BlueprintData (drawing_data.py) into standalone SVG strings:
one plan view, four elevations (N/E/S/W), and one section. Every
dimension, opening position, and roof line comes straight from the
model's own geometry — nothing here is a static template.

Each SVG is self-contained (viewBox, embedded styles) so it can be
previewed directly in the frontend AND fed to pdf_export.py's sibling
reportlab drawing without needing to parse it back out.
"""
from __future__ import annotations

import math

from .drawing_data import BlueprintData, WallLayout

PX_PER_M = 60.0          # drawing scale for on-screen SVG preview
MARGIN_PX = 70
DIM_OFFSET_PX = 28
TITLE_BLOCK_H_PX = 70


def _m(v: float) -> float:
    return v * PX_PER_M


def _dimension_line(x1: float, y1: float, x2: float, y2: float, label: str) -> str:
    """A horizontal or vertical dimension line with tick marks + a label."""
    tick = 6
    if abs(y1 - y2) < 0.01:  # horizontal
        mid_x, mid_y = (x1 + x2) / 2, y1
        return (
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="dim-line"/>'
            f'<line x1="{x1}" y1="{y1 - tick}" x2="{x1}" y2="{y1 + tick}" class="dim-tick"/>'
            f'<line x1="{x2}" y1="{y2 - tick}" x2="{x2}" y2="{y2 + tick}" class="dim-tick"/>'
            f'<text x="{mid_x}" y="{mid_y - 6}" class="dim-text" text-anchor="middle">{label}</text>'
        )
    mid_x, mid_y = x1, (y1 + y2) / 2
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="dim-line"/>'
        f'<line x1="{x1 - tick}" y1="{y1}" x2="{x1 + tick}" y2="{y1}" class="dim-tick"/>'
        f'<line x1="{x2 - tick}" y1="{y2}" x2="{x2 + tick}" y2="{y2}" class="dim-tick"/>'
        f'<text x="{mid_x - 10}" y="{mid_y}" class="dim-text" text-anchor="end" '
        f'transform="rotate(-90 {mid_x - 10} {mid_y})">{label}</text>'
    )


def _north_arrow(cx: float, cy: float, orientation_deg: float) -> str:
    # orientation_deg = compass bearing wall_N faces; arrow points toward
    # true north, i.e. rotated by -orientation_deg from the drawing's "up".
    r = 22
    ang = math.radians(-orientation_deg)
    tip_x, tip_y = cx + r * math.sin(ang), cy - r * math.cos(ang)
    return (
        f'<g class="north-arrow">'
        f'<circle cx="{cx}" cy="{cy}" r="{r + 6}" class="north-circle"/>'
        f'<line x1="{cx}" y1="{cy}" x2="{tip_x:.1f}" y2="{tip_y:.1f}" class="north-line"/>'
        f'<text x="{tip_x:.1f}" y="{tip_y - 4:.1f}" class="north-label" text-anchor="middle">N</text>'
        f'</g>'
    )


def _scale_bar(x: float, y: float) -> str:
    bar_m = 1.0
    bar_px = _m(bar_m)
    return (
        f'<g class="scale-bar">'
        f'<line x1="{x}" y1="{y}" x2="{x + bar_px}" y2="{y}" class="dim-line"/>'
        f'<line x1="{x}" y1="{y - 4}" x2="{x}" y2="{y + 4}" class="dim-tick"/>'
        f'<line x1="{x + bar_px}" y1="{y - 4}" x2="{x + bar_px}" y2="{y + 4}" class="dim-tick"/>'
        f'<text x="{x + bar_px / 2}" y="{y - 8}" class="dim-text" text-anchor="middle">1 m</text>'
        f'</g>'
    )


_STYLE = """
<style>
  .outline { fill: none; stroke: #1a1a1a; stroke-width: 2; }
  .wall-band { fill: #d8d3c8; stroke: #1a1a1a; stroke-width: 1.2; }
  .insulation-band { fill: #eee6cf; stroke: #8a7f5f; stroke-width: 0.8; stroke-dasharray: 3 2; }
  .opening-window { fill: #bfe3f2; stroke: #1a1a1a; stroke-width: 1; }
  .opening-door { fill: none; stroke: #1a1a1a; stroke-width: 1; }
  .opening-vent { fill: #e5e5e5; stroke: #1a1a1a; stroke-width: 1; stroke-dasharray: 2 2; }
  .roof-line { fill: #f0ede4; stroke: #1a1a1a; stroke-width: 1.5; }
  .ground-hatch { stroke: #7a6a4f; stroke-width: 1; }
  .dim-line { stroke: #444; stroke-width: 0.75; }
  .dim-tick { stroke: #444; stroke-width: 0.75; }
  .dim-text { font: 10px 'Courier New', monospace; fill: #222; }
  .north-circle { fill: none; stroke: #1a1a1a; stroke-width: 1; }
  .north-line { stroke: #1a1a1a; stroke-width: 1.5; marker-end: url(#arrowhead); }
  .north-label { font: bold 11px sans-serif; fill: #1a1a1a; }
  .title { font: bold 13px sans-serif; fill: #1a1a1a; }
  .subtitle { font: 10px sans-serif; fill: #444; }
  .tb-border { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
  .tb-divider { stroke: #1a1a1a; stroke-width: 0.75; }
</style>
"""

_DEFS = (
    '<defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" '
    'orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#1a1a1a"/></marker></defs>'
)


def _title_block(view_name: str, data: BlueprintData, viewport_w: float, viewport_h: float) -> str:
    tb = data.title_block
    x, y, w, h = 0, viewport_h - TITLE_BLOCK_H_PX, viewport_w, TITLE_BLOCK_H_PX
    return (
        f'<g class="title-block">'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="tb-border" fill="#fff"/>'
        f'<line x1="{x}" y1="{y + 24}" x2="{x + w}" y2="{y + 24}" class="tb-divider"/>'
        f'<line x1="{x + w * 0.62}" y1="{y}" x2="{x + w * 0.62}" y2="{y + h}" class="tb-divider"/>'
        f'<text x="{x + 10}" y="{y + 17}" class="title">{tb.project_name} — {view_name}</text>'
        f'<text x="{x + 10}" y="{y + 40}" class="subtitle">Site: {tb.site_id}</text>'
        f'<text x="{x + 10}" y="{y + 55}" class="subtitle">SIH26051 · LADAKH-ADAPT / HimKavach</text>'
        f'<text x="{x + w * 0.62 + 10}" y="{y + 17}" class="subtitle">Date: {tb.drawing_date}</text>'
        f'<text x="{x + w * 0.62 + 10}" y="{y + 34}" class="subtitle">Rev: {tb.revision}</text>'
        f'<text x="{x + w * 0.62 + 10}" y="{y + 51}" class="subtitle">Scale: 1:{int(100 / PX_PER_M * 100) or 1} (@60px/m)</text>'
        f'</g>'
    )


def _svg_wrap(view_name: str, data: BlueprintData, body: str, w_px: float, h_px: float) -> str:
    total_h = h_px + TITLE_BLOCK_H_PX
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w_px} {total_h}" '
        f'width="{w_px}" height="{total_h}">'
        f'{_STYLE}{_DEFS}'
        f'<rect x="0" y="0" width="{w_px}" height="{total_h}" fill="#ffffff"/>'
        f'{body}'
        f'{_title_block(view_name, data, w_px, total_h)}'
        f'</svg>'
    )


def render_plan(data: BlueprintData) -> str:
    length_px, width_px = _m(data.length_m), _m(data.width_m)
    ox, oy = MARGIN_PX, MARGIN_PX
    body = [f'<rect x="{ox}" y="{oy}" width="{length_px}" height="{width_px}" class="outline"/>']

    # wall bands drawn as thickened borders on each side, proportional to
    # that wall's actual resolved thickness
    for cardinal, wall in data.walls.items():
        t_px = _m(wall.total_thickness_m)
        if cardinal == "N":
            body.append(f'<rect x="{ox}" y="{oy}" width="{length_px}" height="{t_px}" class="wall-band"/>')
        elif cardinal == "S":
            body.append(f'<rect x="{ox}" y="{oy + width_px - t_px}" width="{length_px}" height="{t_px}" class="wall-band"/>')
        elif cardinal == "W":
            body.append(f'<rect x="{ox}" y="{oy}" width="{t_px}" height="{width_px}" class="wall-band"/>')
        elif cardinal == "E":
            body.append(f'<rect x="{ox + length_px - t_px}" y="{oy}" width="{t_px}" height="{width_px}" class="wall-band"/>')

        # openings projected onto the plan as gaps/marks along that wall
        for op in wall.openings:
            op_px = _m(op.width_m)
            if cardinal in ("N", "S"):
                oy_op = oy if cardinal == "N" else oy + width_px - t_px
                ox_op = ox + _m(op.x_m)
                cls = "opening-window" if op.type == "window" else "opening-door"
                body.append(f'<rect x="{ox_op}" y="{oy_op}" width="{op_px}" height="{t_px}" class="{cls}"/>')
            else:
                ox_op = ox if cardinal == "W" else ox + length_px - t_px
                oz_op = oy + _m(op.x_m)
                cls = "opening-window" if op.type == "window" else "opening-door"
                body.append(f'<rect x="{ox_op}" y="{oz_op}" width="{t_px}" height="{op_px}" class="{cls}"/>')

    # overall dimensions
    body.append(_dimension_line(ox, oy - DIM_OFFSET_PX, ox + length_px, oy - DIM_OFFSET_PX,
                                 f"{data.length_m:.2f} m"))
    body.append(_dimension_line(ox - DIM_OFFSET_PX, oy, ox - DIM_OFFSET_PX, oy + width_px,
                                 f"{data.width_m:.2f} m"))

    body.append(_north_arrow(ox + length_px + 40, oy + 40, data.orientation_deg))
    body.append(_scale_bar(ox, oy + width_px + 45))

    w_px = length_px + 2 * MARGIN_PX + 60
    h_px = width_px + 2 * MARGIN_PX + 20
    return _svg_wrap("Plan View", data, "".join(body), w_px, h_px)


def render_elevation(data: BlueprintData, cardinal: str) -> str:
    wall: WallLayout = data.walls[cardinal]
    span_m = wall.gross_length_m
    span_px, height_px = _m(span_m), _m(data.ceiling_height_m)
    ox, oy = MARGIN_PX, MARGIN_PX + _m(data.roof.rise_m) + 10

    body = [f'<rect x="{ox}" y="{oy}" width="{span_px}" height="{height_px}" class="outline"/>']

    # roof silhouette above the wall — a simple ridge line, height driven
    # by the model's actual roof slope, not a fixed decorative triangle
    ridge_x = ox + span_px / 2
    ridge_y = oy - _m(data.roof.rise_m)
    eave_overhang = 8
    body.append(
        f'<polygon points="{ox - eave_overhang},{oy} {ridge_x},{ridge_y} '
        f'{ox + span_px + eave_overhang},{oy}" class="roof-line"/>'
    )

    for op in wall.openings:
        op_w_px, op_h_px = _m(op.width_m), _m(op.height_m)
        op_x = ox + _m(op.x_m)
        op_y = oy + height_px - _m(op.z_m) - op_h_px
        cls = {"window": "opening-window", "door": "opening-door", "vent": "opening-vent"}[op.type]
        body.append(f'<rect x="{op_x}" y="{op_y}" width="{op_w_px}" height="{op_h_px}" class="{cls}"/>')

    body.append(_dimension_line(ox, oy - 12, ox + span_px, oy - 12, f"{span_m:.2f} m"))
    body.append(_dimension_line(ox - DIM_OFFSET_PX, oy, ox - DIM_OFFSET_PX, oy + height_px,
                                 f"{data.ceiling_height_m:.2f} m"))
    # ground hatch line
    body.append(f'<line x1="{ox - 20}" y1="{oy + height_px}" x2="{ox + span_px + 20}" '
                f'y2="{oy + height_px}" class="ground-hatch"/>')
    body.append(_scale_bar(ox, oy + height_px + 30))

    w_px = span_px + 2 * MARGIN_PX + 20
    h_px = height_px + _m(data.roof.rise_m) + 2 * MARGIN_PX
    return _svg_wrap(f"Elevation {cardinal}", data, "".join(body), w_px, h_px)


def render_section(data: BlueprintData) -> str:
    """One N-S section cut through the building showing the floor/wall/roof
    build-up with each layer's resolved thickness labeled."""
    span_m = data.width_m
    span_px, height_px = _m(span_m), _m(data.ceiling_height_m)
    ox, oy = MARGIN_PX + 40, MARGIN_PX + _m(data.roof.rise_m) + 10

    floor_t_px = _m(data.floor.structural_thickness_m + data.floor.insulation_thickness_m)
    body = [
        f'<rect x="{ox}" y="{oy}" width="{span_px}" height="{height_px}" class="outline"/>',
        f'<rect x="{ox}" y="{oy + height_px}" width="{span_px}" height="{floor_t_px}" class="wall-band"/>',
    ]
    if data.floor.insulation_thickness_m:
        ins_px = _m(data.floor.insulation_thickness_m)
        body.append(f'<rect x="{ox}" y="{oy + height_px}" width="{span_px}" height="{ins_px}" '
                    f'class="insulation-band"/>')

    # left (N) and right (S) wall build-up, each with structural + insulation band
    for side, wall in (("N", data.walls["N"]), ("S", data.walls["S"])):
        t_px = _m(wall.total_thickness_m)
        x = ox if side == "N" else ox + span_px - t_px
        body.append(f'<rect x="{x}" y="{oy}" width="{t_px}" height="{height_px}" class="wall-band"/>')
        if wall.insulation_thickness_m:
            ins_px = _m(wall.insulation_thickness_m)
            ins_x = x + (0 if side == "N" else t_px - ins_px)
            body.append(f'<rect x="{ins_x}" y="{oy}" width="{ins_px}" height="{height_px}" '
                        f'class="insulation-band"/>')
        body.append(f'<text x="{x}" y="{oy - 14}" class="dim-text">{side}: '
                    f'{wall.structural_thickness_m * 100:.0f}cm struct'
                    + (f' + {wall.insulation_thickness_m * 100:.0f}cm ins' if wall.insulation_thickness_m else '')
                    + '</text>')

    ridge_x = ox + span_px / 2
    ridge_y = oy - _m(data.roof.rise_m)
    body.append(f'<polygon points="{ox - 10},{oy} {ridge_x},{ridge_y} {ox + span_px + 10},{oy}" '
                f'class="roof-line"/>')
    body.append(f'<text x="{ridge_x}" y="{ridge_y - 8}" class="dim-text" text-anchor="middle">'
                f'roof {data.roof.slope_deg:.0f}° · {data.roof.structural_thickness_m * 100:.0f}cm'
                + (f' + {data.roof.insulation_thickness_m * 100:.0f}cm ins' if data.roof.insulation_thickness_m else '')
                + '</text>')

    body.append(_dimension_line(ox - DIM_OFFSET_PX - 20, oy, ox - DIM_OFFSET_PX - 20, oy + height_px,
                                 f"{data.ceiling_height_m:.2f} m"))
    body.append(_scale_bar(ox, oy + height_px + floor_t_px + 30))

    w_px = span_px + 2 * MARGIN_PX + 60
    h_px = height_px + floor_t_px + _m(data.roof.rise_m) + 2 * MARGIN_PX
    return _svg_wrap("Section A-A", data, "".join(body), w_px, h_px)


def render_all(data: BlueprintData) -> dict[str, str]:
    """Returns the full drawing set keyed by view name, ready to preview
    inline (frontend) or hand to pdf_export.build_pdf()."""
    out = {"plan": render_plan(data)}
    for cardinal in ("N", "E", "S", "W"):
        out[f"elevation_{cardinal}"] = render_elevation(data, cardinal)
    out["section"] = render_section(data)
    return out
