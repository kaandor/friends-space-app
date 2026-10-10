const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('picker', {
  getSources: () => ipcRenderer.invoke('picker:sources'),
  choose: (sourceId) => ipcRenderer.send('picker:choose', sourceId),
  cancel: () => ipcRenderer.send('picker:cancel'),
})
