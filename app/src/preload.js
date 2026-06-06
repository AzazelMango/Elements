const { contextBridge, ipcRenderer } = require('electron');

const rendererConfig = ipcRenderer.sendSync('get-renderer-config');

contextBridge.exposeInMainWorld('config', rendererConfig);

contextBridge.exposeInMainWorld('api', {
  quit:             ()         => ipcRenderer.send('quit-app'),
  loadTeams:        ()         => ipcRenderer.sendSync('teams:load'),
  saveTeams:        (teams)    => ipcRenderer.sendSync('teams:save', teams),
  loadSettings:     ()         => ipcRenderer.sendSync('settings:load'),
  saveSettings:     (settings) => ipcRenderer.sendSync('settings:save', settings),
  setResolution:    (opts)     => ipcRenderer.sendSync('window:setResolution', opts),
});
