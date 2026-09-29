"""
Runtime paths for normal development and the packaged desktop build.

Normal mode:
    data/ remains the source of truth.

Desktop mode:
    HIMKAVACH_DATA_DIR points at Electron's writable user-data directory.
    Bundled reference data is still read from the PyInstaller bundle.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    BUNDLED_DATA_DIR = Path(getattr(sys, "_MEIPASS")) / "data"
else:
    BUNDLED_DATA_DIR = Path(__file__).resolve().parents[1] / "data"

USER_DATA_DIR = Path(
    os.environ.get("HIMKAVACH_DATA_DIR", str(BUNDLED_DATA_DIR))
).expanduser().resolve()

CLIMATE_DIR = USER_DATA_DIR / "climate"
MATERIALS_DIR = USER_DATA_DIR / "materials"
PROJECTS_DB = USER_DATA_DIR / "app_state.sqlite3"
BUNDLED_MATERIALS_JSON = BUNDLED_DATA_DIR / "materials" / "materials.json"

OFFLINE_MODE = os.environ.get("HIMKAVACH_OFFLINE", "0") == "1"
