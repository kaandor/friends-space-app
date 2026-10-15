const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  remoteControlInput: (data) => ipcRenderer.send('remote-control-input', data),
  remoteControlInfo: () => ipcRenderer.invoke('remote-control-info'),
  remoteCursorFeed: (enabled) => ipcRenderer.send('remote-cursor-feed', { enabled }),
  onRemoteCursor: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('remote-cursor', listener)
    return () => ipcRenderer.removeListener('remote-cursor', listener)
  },
  onRemoteControlUnavailable: (cb) => {
    const listener = (_event, data) => cb(data && data.reason ? data.reason : 'generic')
    ipcRenderer.on('remote-control-unavailable', listener)
    return () => ipcRenderer.removeListener('remote-control-unavailable', listener)
  },
  windowControl: (action) => ipcRenderer.send('window-control', action),
  onWindowState: (cb) => {
    const listener = (_event, state) => cb(state)
    ipcRenderer.on('window-state', listener)
    return () => ipcRenderer.removeListener('window-state', listener)
  },
  notify: (title, body, silent) => ipcRenderer.send('native-notification', { title, body, silent }),
  traySetCall: (inCall) => ipcRenderer.invoke('tray-set-call', inCall),
  googleAuth: (authUrl, clientSecret, refreshToken) => ipcRenderer.invoke('google-auth', authUrl, clientSecret, refreshToken),
  getActiveApp: () => ipcRenderer.invoke('get-active-app'),
  setOverlay: (users) => ipcRenderer.send('overlay-update', users),
  onOverlayRender: (cb) => {
    const listener = (_event, users) => cb(users)
    ipcRenderer.on('overlay-render', listener)
    return () => ipcRenderer.removeListener('overlay-render', listener)
  },
  appVersion: () => ipcRenderer.invoke('app:version'),
  loadRnnoiseAssets: () => ipcRenderer.invoke('rnnoise:load'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onAppUpdate: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('app-update', listener)
    return () => ipcRenderer.removeListener('app-update', listener)
  },
})
