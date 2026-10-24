const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('widgets', {
  init: (name) => ipcRenderer.invoke('widget:init', name),
  onLocked: (callback) => subscribe('widget:locked', callback),
  openExternal: (url) => ipcRenderer.send('widget:open-external', url),

  media: {
    get: () => ipcRenderer.invoke('media:get'),
    onUpdate: (callback) => subscribe('media:update', callback),
    command: (command) => ipcRenderer.send('media:command', command)
  },
  discord: { get: () => ipcRenderer.invoke('discord:get') },
  weather: { get: () => ipcRenderer.invoke('weather:get') },
  system: { get: () => ipcRenderer.invoke('system:get') }
});
