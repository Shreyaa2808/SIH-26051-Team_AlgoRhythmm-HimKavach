"""
Person 1: design-project persistence.

A "design project" is the whole HimKavach journey (site -> shelter -> baseline
-> optimize -> ...), stored as one JSON document. This is separate from
engine/storage.py, which stores individual 3D-twin shelter models.
Same SQLite file, new table, works fully offline.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from engine.runtime_paths import PROJECTS_DB

DB_PATH = PROJECTS_DB

_SCHEMA = """
CREATE TABLE IF NOT EXISTS design_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    site_label TEXT,
    step TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

_COLS = "id, name, mode, site_label, step, created_at, updated_at"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute(_SCHEMA)
    conn.commit()
    return conn


def _summary(r) -> dict:
    return {
        "id": r[0], "name": r[1], "mode": r[2], "site_label": r[3],
        "step": r[4], "created_at": r[5], "updated_at": r[6],
    }


def get_summary(pid: str, db_path: Path = DB_PATH) -> Optional[dict]:
    conn = _connect(db_path)
    try:
        r = conn.execute(f"SELECT {_COLS} FROM design_projects WHERE id=?", (pid,)).fetchone()
        return _summary(r) if r else None
    finally:
        conn.close()


def save(project: dict, db_path: Path = DB_PATH) -> dict:
    """Insert or update a project document. Returns its summary row."""
    pid = project["projectId"]
    meta = project.get("meta") or {}
    now = _now()
    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO design_projects
                (id, name, mode, site_label, step, data_json, created_at, updated_at)
            VALUES (:id, :name, :mode, :site_label, :step, :data, :now, :now)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, mode=excluded.mode,
                site_label=excluded.site_label, step=excluded.step,
                data_json=excluded.data_json, updated_at=excluded.updated_at
            """,
            {
                "id": pid,
                "name": project.get("projectName") or "Untitled shelter",
                "mode": project.get("mode") or "new",
                "site_label": (project.get("site") or {}).get("label"),
                "step": meta.get("step"),
                "data": json.dumps(project),
                "now": now,
            },
        )
        conn.commit()
    finally:
        conn.close()
    return get_summary(pid, db_path)


def list_all(db_path: Path = DB_PATH) -> list[dict]:
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            f"SELECT {_COLS} FROM design_projects ORDER BY updated_at DESC"
        ).fetchall()
        return [_summary(r) for r in rows]
    finally:
        conn.close()


def load(pid: str, db_path: Path = DB_PATH) -> Optional[dict]:
    conn = _connect(db_path)
    try:
        r = conn.execute("SELECT data_json FROM design_projects WHERE id=?", (pid,)).fetchone()
        return json.loads(r[0]) if r else None
    finally:
        conn.close()


def rename(pid: str, name: str, db_path: Path = DB_PATH) -> bool:
    """Rename inside both the column and the stored document."""
    doc = load(pid, db_path)
    if doc is None:
        return False
    doc["projectName"] = name
    save(doc, db_path)
    return True


def delete(pid: str, db_path: Path = DB_PATH) -> bool:
    conn = _connect(db_path)
    try:
        cur = conn.execute("DELETE FROM design_projects WHERE id=?", (pid,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()