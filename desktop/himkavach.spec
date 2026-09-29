# PyInstaller spec for the offline FastAPI backend.
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).resolve().parent

datas = [
    (str(ROOT / "data"), "data"),
]

hiddenimports = []
for pkg in ("uvicorn", "fastapi", "starlette", "pydantic", "scipy", "sklearn"):
    hiddenimports.extend(collect_submodules(pkg))

a = Analysis(
    [str(ROOT / "desktop" / "backend_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="himkavach-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)
