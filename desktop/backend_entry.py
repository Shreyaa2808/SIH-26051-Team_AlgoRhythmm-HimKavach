"""Frozen FastAPI entrypoint used by the HimKavach desktop shell."""
from __future__ import annotations

import os
import uvicorn

from api.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.environ.get("HIMKAVACH_API_HOST", "127.0.0.1"),
        port=int(os.environ.get("HIMKAVACH_API_PORT", "8765")),
        log_level=os.environ.get("HIMKAVACH_LOG_LEVEL", "warning"),
    )
