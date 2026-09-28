# HimKavach Phase F — Offline Desktop Build

This shell packages:

- the Vite/React UI
- the FastAPI + physics engine as a PyInstaller executable
- SQLite persistence in the OS user-data directory
- the bundled climate/material seed data
- no external API requirement at runtime

## Build on Windows

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\build.ps1
```

The installer is created in:

```text
desktop/release/
```

The installed application starts the API on `127.0.0.1:8765`, launches the UI from the packaged files, and sets `HIMKAVACH_OFFLINE=1`.

### Offline location behavior

The desktop build includes the climate files already present in `data/climate`.

- Leh, Siachen and Dras work on a clean offline install.
- A custom location that was already cached in the shipped data also works.
- A brand-new arbitrary coordinate cannot fetch NASA POWER/elevation while offline; resolve it once online in the web/dev build, then package/copy its cache if it needs to be distributed.

The desktop UI therefore hides the live map/geocoder in offline mode instead of presenting controls that silently require the internet.
