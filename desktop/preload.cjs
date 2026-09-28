const { contextBridge } = require('electron');

const apiPort = process.env.HIMKAVACH_API_PORT || '8765';

contextBridge.exposeInMainWorld('himkavachConfig', {
  apiUrl: `http://127.0.0.1:${apiPort}`,
  desktop: true,
  offline: true,
});
