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
  remoteControlSelftest: () => ipcRenderer.invoke('remote-control-selftest'),
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
  setOverlay: (data) => ipcRenderer.send('overlay-update', data),
  onOverlayRender: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('overlay-render', listener)
    return () => ipcRenderer.removeListener('overlay-render', listener)
  },
  onOverlayRefresh: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('overlay-refresh', listener)
    return () => ipcRenderer.removeListener('overlay-refresh', listener)
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
