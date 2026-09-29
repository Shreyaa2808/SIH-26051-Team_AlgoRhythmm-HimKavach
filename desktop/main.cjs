const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_HOST = '127.0.0.1';
const API_PORT = '8765';
let backend = null;

function bundledDataDir() {
  return path.join(process.resourcesPath, 'backend-data');
}

function writableDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function seedWritableData() {
  const source = bundledDataDir();
  const target = writableDataDir();

  fs.mkdirSync(target, { recursive: true });
  if (fs.existsSync(source)) {
    fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
  }
}

function backendExecutable() {
  const exe = process.platform === 'win32' ? 'himkavach-api.exe' : 'himkavach-api';
  return path.join(process.resourcesPath, 'backend', exe);
}

function startBackend() {
  const executable = backendExecutable();
  if (!fs.existsSync(executable)) {
    throw new Error(`Bundled backend not found: ${executable}`);
  }

  const env = {
    ...process.env,
    HIMKAVACH_API_HOST: API_HOST,
    HIMKAVACH_API_PORT: String(API_PORT),
    HIMKAVACH_OFFLINE: '1',
    HIMKAVACH_DATA_DIR: writableDataDir(),
    HIMKAVACH_LOG_LEVEL: 'warning',
  };

  backend = spawn(executable, [], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backend.stdout?.on('data', (data) => {
    console.log(`[backend] ${data}`.trim());
  });
  backend.stderr?.on('data', (data) => {
    console.error(`[backend] ${data}`.trim());
  });
}

async function waitForBackend(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://${API_HOST}:${API_PORT}/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('The local HimKavach API did not start in time.');
}

async function createWindow() {
  seedWritableData();
  startBackend();
  await waitForBackend();

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f7f9fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const indexPath = path.join(process.resourcesPath, 'web', 'index.html');
  await win.loadFile(indexPath);
}

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('HimKavach failed to start', error.stack || String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backend) backend.kill();
});
