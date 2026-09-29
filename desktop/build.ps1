$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repo

Write-Host "==> Building React frontend"
npm --prefix web install
npm --prefix web run build

Write-Host "==> Building frozen FastAPI backend"
python -m pip install -r requirements.txt
python -m pip install pyinstaller
if (Test-Path "desktop/backend-dist") {
  Remove-Item "desktop/backend-dist" -Recurse -Force
}
python -m PyInstaller desktop/himkavach.spec --clean --noconfirm --distpath desktop/backend-dist --workpath desktop/pyinstaller-work

Write-Host "==> Building Electron installer"
npm --prefix desktop install
npm --prefix desktop run dist

Write-Host ""
Write-Host "Done. Installer is under desktop/release/"
