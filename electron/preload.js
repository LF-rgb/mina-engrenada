const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gameAPI', {
  writeSave: (slot, text) => ipcRenderer.invoke('save:write', slot, text),
  readSave: (slot) => ipcRenderer.invoke('save:read', slot),
  saveInfo: (slot) => ipcRenderer.invoke('save:info', slot),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (t) => ipcRenderer.invoke('settings:write', t),
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', on),
});
