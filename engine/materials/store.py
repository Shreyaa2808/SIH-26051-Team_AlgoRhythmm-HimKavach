"""
Phase B: the materials database, made editable.

Replaces `data/materials/materials.json` as the source of truth with a
single SQLite file. On first run, if the table is empty, it seeds itself
from the existing materials.json so nothing from Phase 0-A is lost — every
material you already had (with its citations) is preserved, just now
sitting in a table you can add to / edit / delete from instead of a
read-only file.

New fields added, per the roadmap ("three or four more parameters,
availability, and the power-lifting thing"):
  - availability: 'local' | 'regional' | 'imported' | 'fabricated_onsite'
  - logistics_note: free text, e.g. "airliftable in standard Chinook
    underslung load" / "requires paved-road delivery, no air option"
  - last_updated: ISO8601, set automatically on every create/update, and
    shown in the UI so a stale cost figure is visible as stale.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "materials" / "materials.sqlite3"
SEED_JSON_PATH = Path(__file__).resolve().parents[2] / "data" / "materials" / "materials.json"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    k REAL NOT NULL,
    rho REAL NOT NULL,
    cp REAL NOT NULL,
    cost_per_m3_inr REAL,
    cost_per_m2_inr REAL,
    cost_note TEXT,
    citation TEXT,
    carbon_kgco2e_per_kg REAL,
    carbon_citation TEXT,
    availability TEXT DEFAULT 'regional',
    logistics_note TEXT DEFAULT '',
    last_updated TEXT NOT NULL
);
"""

VALID_AVAILABILITY = {"local", "regional", "imported", "fabricated_onsite"}

_FIELDS = [
    "id", "name", "category", "k", "rho", "cp", "cost_per_m3_inr", "cost_per_m2_inr",
    "cost_note", "citation", "carbon_kgco2e_per_kg", "carbon_citation",
    "availability", "logistics_note", "last_updated",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute(_SCHEMA)
    conn.commit()
    _seed_if_empty(conn)
    return conn


def _seed_if_empty(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM materials").fetchone()[0]
    if count > 0 or not SEED_JSON_PATH.exists():
        return
    raw = json.loads(SEED_JSON_PATH.read_text())
    now = _now()
    for m in raw["materials"]:
        conn.execute(
            """INSERT INTO materials
               (id, name, category, k, rho, cp, cost_per_m3_inr, cost_per_m2_inr,
                cost_note, citation, carbon_kgco2e_per_kg, carbon_citation,
                availability, logistics_note, last_updated)
               VALUES (:id, :name, :category, :k, :rho, :cp, :cost_per_m3_inr, :cost_per_m2_inr,
                       :cost_note, :citation, :carbon_kgco2e_per_kg, :carbon_citation,
                       :availability, :logistics_note, :last_updated)""",
            {
                "id": m["id"], "name": m["name"], "category": m["category"],
                "k": m["k"], "rho": m["rho"], "cp": m["cp"],
                "cost_per_m3_inr": m.get("cost_per_m3_inr"), "cost_per_m2_inr": m.get("cost_per_m2_inr"),
                "cost_note": m.get("cost_note", ""), "citation": m.get("citation", ""),
                "carbon_kgco2e_per_kg": m.get("carbon_kgco2e_per_kg"),
                "carbon_citation": m.get("carbon_citation", ""),
                # seeded materials default to 'regional' with no logistics note --
                # editable immediately after seeding, same as any other entry.
                "availability": "regional", "logistics_note": "",
                "last_updated": now,
            },
        )
    conn.commit()


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in _FIELDS}


def list_materials(db_path: Path = DB_PATH) -> list[dict]:
    conn = _connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT * FROM materials ORDER BY category, name").fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_material(material_id: str, db_path: Path = DB_PATH) -> Optional[dict]:
    conn = _connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
        return _row_to_dict(row) if row else None
    finally:
        conn.close()


def _validate(data: dict) -> None:
    required = ["id", "name", "category", "k", "rho", "cp"]
    missing = [f for f in required if data.get(f) in (None, "")]
    if missing:
        raise ValueError(f"missing required field(s): {missing}")
    if data["k"] <= 0 or data["rho"] <= 0 or data["cp"] <= 0:
        raise ValueError("k, rho, and cp must all be positive numbers")
    avail = data.get("availability", "regional")
    if avail not in VALID_AVAILABILITY:
        raise ValueError(f"availability must be one of {sorted(VALID_AVAILABILITY)}, got {avail!r}")


def create_material(data: dict, db_path: Path = DB_PATH) -> dict:
    _validate(data)
    conn = _connect(db_path)
    try:
        existing = conn.execute("SELECT 1 FROM materials WHERE id = ?", (data["id"],)).fetchone()
        if existing:
            raise ValueError(f"material id '{data['id']}' already exists — use update instead")
        now = _now()
        conn.execute(
            """INSERT INTO materials
               (id, name, category, k, rho, cp, cost_per_m3_inr, cost_per_m2_inr,
                cost_note, citation, carbon_kgco2e_per_kg, carbon_citation,
                availability, logistics_note, last_updated)
               VALUES (:id, :name, :category, :k, :rho, :cp, :cost_per_m3_inr, :cost_per_m2_inr,
                       :cost_note, :citation, :carbon_kgco2e_per_kg, :carbon_citation,
                       :availability, :logistics_note, :last_updated)""",
            {
                "id": data["id"], "name": data["name"], "category": data["category"],
                "k": data["k"], "rho": data["rho"], "cp": data["cp"],
                "cost_per_m3_inr": data.get("cost_per_m3_inr"), "cost_per_m2_inr": data.get("cost_per_m2_inr"),
                "cost_note": data.get("cost_note", ""), "citation": data.get("citation", ""),
                "carbon_kgco2e_per_kg": data.get("carbon_kgco2e_per_kg"),
                "carbon_citation": data.get("carbon_citation", ""),
                "availability": data.get("availability", "regional"),
                "logistics_note": data.get("logistics_note", ""),
                "last_updated": now,
            },
        )
        conn.commit()
        return get_material(data["id"], db_path)
    finally:
        conn.close()


def update_material(material_id: str, patch: dict, db_path: Path = DB_PATH) -> Optional[dict]:
    conn = _connect(db_path)
    try:
        current = get_material(material_id, db_path)
        if current is None:
            return None
        merged = {**current, **{k: v for k, v in patch.items() if k != "id"}}
        _validate(merged)
        merged["last_updated"] = _now()
        conn.execute(
            """UPDATE materials SET name=:name, category=:category, k=:k, rho=:rho, cp=:cp,
               cost_per_m3_inr=:cost_per_m3_inr, cost_per_m2_inr=:cost_per_m2_inr,
               cost_note=:cost_note, citation=:citation,
               carbon_kgco2e_per_kg=:carbon_kgco2e_per_kg, carbon_citation=:carbon_citation,
               availability=:availability, logistics_note=:logistics_note,
               last_updated=:last_updated
               WHERE id=:id""",
            merged,
        )
        conn.commit()
        return get_material(material_id, db_path)
    finally:
        conn.close()


def delete_material(material_id: str, db_path: Path = DB_PATH) -> bool:
    conn = _connect(db_path)
    try:
        cur = conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
