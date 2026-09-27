"""
Phase A, item 4: persistence. Every saved design + its last simulation
result survives a refresh/restart. Plain SQLite, single file, zero external
services — this also directly supports the Phase F "fully offline" goal,
since it needs no network and no separate DB server.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app_state.sqlite3"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    site_id TEXT NOT NULL,
    model_json TEXT NOT NULL,
    last_sim_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute(_SCHEMA)
    conn.commit()
    return conn


def save_project(model_dict: dict, last_sim_dict: Optional[dict], db_path: Path = DB_PATH) -> str:
    conn = _connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO projects (id, name, site_id, model_json, last_sim_json, created_at, updated_at)
            VALUES (:id, :name, :site_id, :model_json, :last_sim_json, :created_at, :updated_at)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                site_id=excluded.site_id,
                model_json=excluded.model_json,
                last_sim_json=excluded.last_sim_json,
                updated_at=excluded.updated_at
            """,
            {
                "id": model_dict["id"],
                "name": model_dict.get("name", "Untitled shelter"),
                "site_id": model_dict.get("site_id", "leh"),
                "model_json": json.dumps(model_dict),
                "last_sim_json": json.dumps(last_sim_dict) if last_sim_dict is not None else None,
                "created_at": model_dict.get("created_at"),
                "updated_at": model_dict.get("updated_at"),
            },
        )
        conn.commit()
        return model_dict["id"]
    finally:
        conn.close()


def list_projects(db_path: Path = DB_PATH) -> list[dict]:
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            "SELECT id, name, site_id, created_at, updated_at FROM projects ORDER BY updated_at DESC"
        ).fetchall()
        return [
            {"id": r[0], "name": r[1], "site_id": r[2], "created_at": r[3], "updated_at": r[4]}
            for r in rows
        ]
    finally:
        conn.close()


def load_project(project_id: str, db_path: Path = DB_PATH) -> Optional[dict]:
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT model_json, last_sim_json FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if row is None:
            return None
        model_json, last_sim_json = row
        return {
            "model": json.loads(model_json),
            "last_sim": json.loads(last_sim_json) if last_sim_json else None,
        }
    finally:
        conn.close()


def delete_project(project_id: str, db_path: Path = DB_PATH) -> bool:
    conn = _connect(db_path)
    try:
        cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
