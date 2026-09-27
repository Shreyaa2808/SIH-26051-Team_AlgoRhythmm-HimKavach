"""
Phase D deliverable: professional 2D CAD-style blueprint generation.

Produces a real drawing set (plan, 4 elevations, 1 section) from the same
ShelterModel that drives the 3D twin (Phase C) and the thermal solver —
not a screenshot of the 3D scene, and not the old static "not at all good"
PDF. Everything here is computed from live model data: wall lengths,
opening positions, resolved thicknesses, roof slope.

Modules:
  drawing_data.py  — pure geometry/layout computation shared by both
                     renderers (no drawing-library imports here).
  svg_generator.py — renders drawing_data into standalone SVG strings
                     (what the frontend BlueprintModule previews inline).
  pdf_export.py     — renders the same drawing_data into a multi-page PDF
                     with reportlab (the actual deliverable Claude was
                     asked for), reusing drawing_data so the PDF and the
                     on-screen SVG preview can never drift apart.
"""
