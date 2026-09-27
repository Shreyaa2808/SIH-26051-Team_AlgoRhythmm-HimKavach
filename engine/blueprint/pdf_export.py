"""
Renders BlueprintData into an actual multi-page PDF deliverable —
one page per view (plan, 4 elevations, section) — using reportlab
directly (no SVG->PDF conversion step, no extra native-lib dependency).

This replaces the old screenshotted/static PDF: every dimension line,
opening position, and roof pitch here is computed live from the model,
via the exact same drawing_data.BlueprintData the SVG previews use, so
the PDF a civil engineer downloads can never disagree with what the
frontend showed.
"""
from __future__ import annotations

import io

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from .drawing_data import BlueprintData, WallLayout

PT_PER_M = 90.0  # drawing scale within the page (points per meter)
PAGE_W, PAGE_H = landscape(A4)
MARGIN = 2.0 * cm
TITLE_BLOCK_H = 2.4 * cm


def _m(v: float) -> float:
    return v * PT_PER_M


def _title_block(c: canvas.Canvas, view_name: str, data: BlueprintData) -> None:
    tb = data.title_block
    x, y, w, h = 0, 0, PAGE_W, TITLE_BLOCK_H
    c.setLineWidth(1.2)
    c.rect(x + MARGIN * 0.3, y + 0.3 * cm, w - MARGIN * 0.6, h - 0.6 * cm)
    divider_x = x + (w - MARGIN * 0.6) * 0.62 + MARGIN * 0.3
    c.line(divider_x, y + 0.3 * cm, divider_x, y + h - 0.3 * cm)
    c.line(x + MARGIN * 0.3, y + h - 0.9 * cm, x + w - MARGIN * 0.3, y + h - 0.9 * cm)

    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + MARGIN * 0.5, y + h - 0.65 * cm, f"{tb.project_name} — {view_name}")
    c.setFont("Helvetica", 8.5)
    c.drawString(x + MARGIN * 0.5, y + h - 1.5 * cm, f"Site: {tb.site_id}")
    c.drawString(x + MARGIN * 0.5, y + 0.55 * cm, tb.drawn_for)
    c.drawString(divider_x + 0.3 * cm, y + h - 0.65 * cm, f"Date: {tb.drawing_date}")
    c.drawString(divider_x + 0.3 * cm, y + h - 1.35 * cm, f"Rev: {tb.revision}")
    c.drawString(divider_x + 0.3 * cm, y + h - 2.05 * cm, f"Scale: 1:{100 / PT_PER_M * 72 / 28.35:.0f} (approx)")


def _dim_h(c: canvas.Canvas, x1, x2, y, label: str) -> None:
    c.setLineWidth(0.5)
    c.line(x1, y, x2, y)
    c.line(x1, y - 3, x1, y + 3)
    c.line(x2, y - 3, x2, y + 3)
    c.setFont("Courier", 8)
    c.drawCentredString((x1 + x2) / 2, y + 4, label)


def _dim_v(c: canvas.Canvas, x, y1, y2, label: str) -> None:
    c.setLineWidth(0.5)
    c.line(x, y1, x, y2)
    c.line(x - 3, y1, x + 3, y1)
    c.line(x - 3, y2, x + 3, y2)
    c.setFont("Courier", 8)
    c.saveState()
    c.translate(x - 6, (y1 + y2) / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, label)
    c.restoreState()


def _north_arrow(c: canvas.Canvas, cx, cy, orientation_deg: float) -> None:
    import math
    r = 16
    ang = math.radians(-orientation_deg)
    tip_x, tip_y = cx + r * math.sin(ang), cy + r * math.cos(ang)
    c.setLineWidth(1)
    c.circle(cx, cy, r + 5, stroke=1, fill=0)
    c.line(cx, cy, tip_x, tip_y)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(tip_x, tip_y + 3, "N")


def _scale_bar(c: canvas.Canvas, x, y) -> None:
    bar_px = _m(1.0)
    c.setLineWidth(0.5)
    c.line(x, y, x + bar_px, y)
    c.line(x, y - 3, x, y + 3)
    c.line(x + bar_px, y - 3, x + bar_px, y + 3)
    c.setFont("Courier", 8)
    c.drawCentredString(x + bar_px / 2, y + 5, "1 m")


def _new_page_origin() -> tuple[float, float]:
    return MARGIN, TITLE_BLOCK_H + MARGIN


def _draw_plan(c: canvas.Canvas, data: BlueprintData) -> None:
    length_px, width_px = _m(data.length_m), _m(data.width_m)
    ox, oy = _new_page_origin()

    c.setLineWidth(2)
    c.rect(ox, oy, length_px, width_px)

    for cardinal, wall in data.walls.items():
        t_px = _m(wall.total_thickness_m)
        c.setLineWidth(1)
        if cardinal == "N":
            c.rect(ox, oy + width_px - t_px, length_px, t_px, fill=0)
        elif cardinal == "S":
            c.rect(ox, oy, length_px, t_px, fill=0)
        elif cardinal == "W":
            c.rect(ox, oy, t_px, width_px, fill=0)
        elif cardinal == "E":
            c.rect(ox + length_px - t_px, oy, t_px, width_px, fill=0)

        for op in wall.openings:
            op_px = _m(op.width_m)
            if cardinal in ("N", "S"):
                y0 = oy + width_px - t_px if cardinal == "N" else oy
                c.rect(ox + _m(op.x_m), y0, op_px, t_px, fill=0)
            else:
                x0 = ox if cardinal == "W" else ox + length_px - t_px
                c.rect(x0, oy + _m(op.x_m), t_px, op_px, fill=0)

    _dim_h(c, ox, ox + length_px, oy + width_px + 20, f"{data.length_m:.2f} m")
    _dim_v(c, ox - 20, oy, oy + width_px, f"{data.width_m:.2f} m")
    _north_arrow(c, ox + length_px + 30, oy + width_px - 20, data.orientation_deg)
    _scale_bar(c, ox, oy - 22)
    c.setFont("Helvetica", 9)
    c.drawString(ox, oy + width_px + 34, "PLAN VIEW")
    _title_block(c, "Plan View", data)


def _draw_elevation(c: canvas.Canvas, data: BlueprintData, cardinal: str) -> None:
    wall: WallLayout = data.walls[cardinal]
    span_px, height_px = _m(wall.gross_length_m), _m(data.ceiling_height_m)
    ox, oy = _new_page_origin()
    oy += _m(data.roof.rise_m)

    c.setLineWidth(2)
    c.rect(ox, oy, span_px, height_px)

    ridge_x, ridge_y = ox + span_px / 2, oy + height_px + _m(data.roof.rise_m)
    c.setLineWidth(1.5)
    p = c.beginPath()
    p.moveTo(ox - 6, oy + height_px)
    p.lineTo(ridge_x, ridge_y)
    p.lineTo(ox + span_px + 6, oy + height_px)
    c.drawPath(p)

    for op in wall.openings:
        w_px, h_px = _m(op.width_m), _m(op.height_m)
        x0 = ox + _m(op.x_m)
        y0 = oy + _m(op.z_m)
        c.setLineWidth(1)
        c.rect(x0, y0, w_px, h_px, fill=0)

    _dim_h(c, ox, ox + span_px, oy + height_px + _m(data.roof.rise_m) + 16, f"{wall.gross_length_m:.2f} m")
    _dim_v(c, ox - 20, oy, oy + height_px, f"{data.ceiling_height_m:.2f} m")
    c.setLineWidth(0.5)
    c.line(ox - 15, oy, ox + span_px + 15, oy)
    _scale_bar(c, ox, oy - 22)
    c.setFont("Helvetica", 9)
    c.drawString(ox, oy + height_px + _m(data.roof.rise_m) + 30, f"ELEVATION {cardinal}")
    _title_block(c, f"Elevation {cardinal}", data)


def _draw_section(c: canvas.Canvas, data: BlueprintData) -> None:
    span_px, height_px = _m(data.width_m), _m(data.ceiling_height_m)
    ox, oy = _new_page_origin()
    oy += _m(data.roof.rise_m)
    floor_t_px = _m(data.floor.structural_thickness_m + data.floor.insulation_thickness_m)

    c.setLineWidth(2)
    c.rect(ox, oy, span_px, height_px)
    c.setLineWidth(1)
    c.rect(ox, oy - floor_t_px, span_px, floor_t_px)

    for side, wall in (("N", data.walls["N"]), ("S", data.walls["S"])):
        t_px = _m(wall.total_thickness_m)
        x = ox if side == "N" else ox + span_px - t_px
        c.rect(x, oy, t_px, height_px)
        label = f"{side}: {wall.structural_thickness_m*100:.0f}cm struct"
        if wall.insulation_thickness_m:
            label += f" + {wall.insulation_thickness_m*100:.0f}cm ins"
        c.setFont("Courier", 7.5)
        c.drawString(x, oy + height_px + 6, label)

    ridge_x, ridge_y = ox + span_px / 2, oy + height_px + _m(data.roof.rise_m)
    c.setLineWidth(1.5)
    p = c.beginPath()
    p.moveTo(ox - 6, oy + height_px)
    p.lineTo(ridge_x, ridge_y)
    p.lineTo(ox + span_px + 6, oy + height_px)
    c.drawPath(p)
    roof_label = f"roof {data.roof.slope_deg:.0f} deg, {data.roof.structural_thickness_m*100:.0f}cm"
    if data.roof.insulation_thickness_m:
        roof_label += f" + {data.roof.insulation_thickness_m*100:.0f}cm ins"
    c.setFont("Courier", 7.5)
    c.drawCentredString(ridge_x, ridge_y + 8, roof_label)

    _dim_v(c, ox - 30, oy, oy + height_px, f"{data.ceiling_height_m:.2f} m")
    _scale_bar(c, ox, oy - floor_t_px - 22)
    c.setFont("Helvetica", 9)
    c.drawString(ox, oy + height_px + _m(data.roof.rise_m) + 22, "SECTION A-A")
    _title_block(c, "Section A-A", data)


def build_pdf(data: BlueprintData) -> bytes:
    """Renders the full drawing set (plan, 4 elevations, section) as a
    single multi-page PDF and returns it as bytes."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(A4))

    _draw_plan(c, data)
    c.showPage()
    for cardinal in ("N", "E", "S", "W"):
        _draw_elevation(c, data, cardinal)
        c.showPage()
    _draw_section(c, data)
    c.showPage()

    c.save()
    return buf.getvalue()
