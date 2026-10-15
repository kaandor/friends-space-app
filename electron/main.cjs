const { app, BrowserWindow, shell, ipcMain, screen, Tray, Menu, nativeImage, Notification, desktopCapturer, session, dialog } = require('electron')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const isDev = !app.isPackaged
const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')

// Google OAuth credentials for Electron (token refresh)
// O renderer NUNCA envia o secret (não vai no bundle). O main resolve nesta
// ordem: env GOOGLE_CLIENT_SECRET → electron/auth-secret.json (arquivo local
// gitignored, embalado no asar no build) → .env.desktop em dev.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '685740602799-vg75t5pmlmtuke7ngh03imrsagqfnns9.apps.googleusercontent.com'
function loadDesktopClientSecret() {
  if (process.env.GOOGLE_CLIENT_SECRET) return process.env.GOOGLE_CLIENT_SECRET
  try {
    const f = path.join(__dirname, 'auth-secret.json')
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (j && j.client_secret) return String(j.client_secret)
    }
  } catch { }
  if (!app.isPackaged) {
    try {
      const envFile = path.join(__dirname, '..', '.env.desktop')
      const raw = fs.readFileSync(envFile, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*GOOGLE_CLIENT_SECRET\s*=\s*(.+?)\s*$/)
        if (m) return m[1].replace(/^['"]|['"]$/g, '')
      }
    } catch { }
  }
  return ''
}
const GOOGLE_CLIENT_SECRET = loadDesktopClientSecret()

let inputProc = null
let mainWindow = null
let tray = null
let cursorFeedTimer = null
let isQuitting = false
let overlayWindow = null
let overlayHideTimer = null
let overlayData = null
let sharePickerWindow = null
let sharePickerResolve = null

// O script de injecao de mouse/teclado nao pode ser executado de dentro do
// app.asar (o PowerShell nao le arquivos de asar). Extrai para userData uma
// vez (re-extrai se o script mudar) e executa de la.
function inputScriptPath() {
  const bundled = path.join(__dirname, 'input-exec.ps1')
  if (!app.isPackaged) return bundled
  const target = path.join(app.getPath('userData'), 'input-exec.ps1')
  try {
    if (!fs.existsSync(target) || fs.statSync(bundled).mtimeMs > fs.statSync(target).mtimeMs) {
      fs.copyFileSync(bundled, target)
    }
  } catch { }
  return target
}

function ensureInputProc() {
  if (inputProc && !inputProc.killed) return inputProc
  const script = inputScriptPath()
  try {
    inputProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    })
    inputProc.on('error', () => { inputProc = null })
    inputProc.on('exit', () => { inputProc = null })
  } catch { inputProc = null }
  return inputProc
}

// Controle remoto no Linux: Wayland nao tem xdotool util (o compositor
// bloqueia injecao) — nesses casos avisa o renderer UMA vez por sessao e
// ignora (voz/tela seguem 100%). X11 + xdotool funciona total.
function isWaylandSession() {
  try {
    if (process.env.WAYLAND_DISPLAY) return true
    return String(process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland'
  } catch { return false }
}
let xdotoolChecked = null
function hasXdotool() {
  if (xdotoolChecked !== null) return xdotoolChecked
  try {
    const { spawnSync } = require('node:child_process')
    const r = spawnSync('xdotool', ['--help'], { stdio: 'ignore' })
    xdotoolChecked = !(r && r.error)
  } catch { xdotoolChecked = false }
  return xdotoolChecked
}
function linuxKeyName(key) {
  if (!key) return null
  const map = { Enter: 'Return', Escape: 'Escape', Tab: 'Tab', Backspace: 'BackSpace', Delete: 'Delete', Shift: 'Shift_L', Control: 'Control_L', Alt: 'Alt_L', CapsLock: 'Caps_Lock', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'Page_Up', PageDown: 'Page_Down', ' ': 'space' }
  if (map[key]) return map[key]
  if (key.length === 1) return key
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  return null
}
let rcUnavailNotified = false
function notifyRemoteUnavailableOnce() {
  if (rcUnavailNotified) return
  rcUnavailNotified = true
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('remote-control-unavailable') } catch { }
}
ipcMain.on('remote-control-input', (_event, data) => {
  try {
    const d = typeof data === 'string' ? JSON.parse(data) : data
    const disp = mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay()
    if (process.platform === 'linux') {
      const { spawnSync } = require('node:child_process')
      if (isWaylandSession() || !hasXdotool()) { notifyRemoteUnavailableOnce(); return }
      // Protocolo real usa d.t (o ramo antigo lia d.it e NUNCA disparava:
      // controle no Linux nao funcionava). d.x/d.y normalizados 0..1.
      const t = d.t || d.it
      if (t === 'move' && typeof d.x === 'number') {
        const px = Math.round((d.x || 0) * disp.size.width)
        const py = Math.round((d.y || 0) * disp.size.height)
        spawnSync('xdotool', ['mousemove', String(px), String(py)])
      }
      else if (t === 'moveRel') spawnSync('xdotool', ['mousemove_relative', '--', String(Math.round(d.dx || 0)), String(Math.round(d.dy || 0))])
      else if (t === 'button') {
        const b = d.b || d.button
        spawnSync('xdotool', [d.down ? 'mousedown' : 'mouseup', b === 'right' ? '3' : b === 'middle' ? '2' : '1'])
      }
      else if (t === 'wheel') {
        const delta = typeof d.d === 'number' ? d.d : (d.deltaY || 0)
        spawnSync('xdotool', ['click', delta > 0 ? '5' : '4'])
      }
      else if (t === 'key') {
        const k = linuxKeyName(d.k || d.key)
        if (k) spawnSync('xdotool', [d.down ? 'keydown' : 'keyup', k])
      }
      return
    }
    // Windows: normalizado (0..1, client novo) -> pixels do display; valor
    // >1 = client em transicao mandando pixels absolutos (passa direto).
    const dd = d
    if (dd && dd.t === 'moveRel' && typeof dd.dx === 'number' && typeof dd.dy === 'number') {
      dd.t = 'moverel'
      dd.dx = Math.max(-5000, Math.min(5000, Math.round(dd.dx)))
      dd.dy = Math.max(-5000, Math.min(5000, Math.round(dd.dy)))
    }
    if (dd && dd.t === 'move' && typeof dd.x === 'number' && typeof dd.y === 'number'
      && dd.x <= 1.01 && dd.y <= 1.01 && dd.x >= 0 && dd.y >= 0) {
      dd.x = Math.round(dd.x * disp.size.width)
      dd.y = Math.round(dd.y * disp.size.height)
    }
    const proc = ensureInputProc()
    if (proc && proc.stdin && proc.stdin.writable) {
      proc.stdin.write(JSON.stringify(dd) + '\n')
    }
  } catch { }
})

ipcMain.handle('remote-control-info', () => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const display = win
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay()
  return { width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor, wayland: isWaylandSession() }
})

// Deteccao do app/jogo em foco (Mensagem de Status automatica, estilo Discord).
// Consulta a janela em primeiro plano via user32 (GetForegroundWindow) e
// devolve nome do processo + titulo da janela. Retorna null se a janela ativa
// for o proprio Friends Space ou se nao for possivel detectar.
const { execFile } = require('node:child_process')

function runPowerShell(script, timeoutMs) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: timeoutMs || 8000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout) => {
      if (err) { resolve(null); return }
      resolve(stdout.trim())
    })
  })
}

ipcMain.handle('get-active-app', async () => {
  const script = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class FsWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue | Out-Null
$h = [FsWin]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { "none"; exit }
$procId = [uint32]0
[FsWin]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { "none"; exit }
$title = if ($p.MainWindowTitle) { $p.MainWindowTitle } else { "" }
[PSCustomObject]@{ name = $p.ProcessName; pid = $p.Id; title = $title } | ConvertTo-Json -Compress
`
  try {
    const raw = await runPowerShell(script, 8000)
    if (!raw || raw === 'none') return null
    const parsed = JSON.parse(raw)
    if (parsed.name && parsed.name.toLowerCase() === 'friends space') return null
    if (Number(parsed.pid) === process.pid) return null
    return { name: parsed.name, title: parsed.title || '' }
  } catch {
    return null
  }
})

// Feed da posicao real do mouse (estilo AnyDesk): o PC que esta sendo
// controlado envia a posicao do cursor para o controlador via data channel.
ipcMain.on('remote-cursor-feed', (_event, payload) => {
  const enabled = Boolean(payload && payload.enabled)
  if (enabled && cursorFeedTimer === null) {
    cursorFeedTimer = setInterval(() => {
      const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
      if (!win || win.webContents.isDestroyed()) return
      try {
        const pt = screen.getCursorScreenPoint()
        const display = screen.getDisplayNearestPoint(pt)
        const bounds = display.bounds
        win.webContents.send('remote-cursor', {
          x: Math.max(0, pt.x - bounds.x),
          y: Math.max(0, pt.y - bounds.y),
          width: bounds.width,
          height: bounds.height,
          scaleFactor: display.scaleFactor,
        })
      } catch { }
    }, 16)
  } else if (!enabled && cursorFeedTimer !== null) {
    clearInterval(cursorFeedTimer)
    cursorFeedTimer = null
  }
})

ipcMain.on('window-control', (_event, action) => {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  if (!win) return
  if (action === 'minimize') win.minimize()
  else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize() }
  else if (action === 'fullscreen') win.setFullScreen(true)
  else if (action === 'windowed') win.setFullScreen(false)
  else if (action === 'close') win.close()
})

ipcMain.on('native-notification', (_event, payload) => {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: String(payload?.title || 'Friends Space'),
      body: String(payload?.body || ''),
      silent: Boolean(payload?.silent),
    })
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
    n.show()
  } catch { }
})

ipcMain.handle('tray-set-call', (_event, inCall) => {
  if (tray) {
    tray.setToolTip(inCall ? 'Friends Space — Em chamada' : 'Friends Space')
  }
  return true
})

// OAuth 2.0 do Google para o app desktop: fluxo PKCE com loopback (127.0.0.1).
// Abre o navegador padrao, captura o codigo de autorizacao e troca pelo token.
const crypto = require('node:crypto')

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Porta fixa de callback do OAuth (registre esta mesma URI no Google Console:
// http://127.0.0.1:37115/ ou http://localhost:37115/ no client usado pelo app).
const OAUTH_PORT = 37115

function oauthLog(...args) {
  try {
    const line = new Date().toISOString() + ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    fs.appendFileSync(path.join(app.getPath('userData'), 'oauth-debug.log'), line + '\n')
  } catch { }
}

ipcMain.handle('google-auth', async (_event, authUrl, clientSecret, refreshToken) => {
  let client_id = ''
  try {
    client_id = new URL(authUrl || '').searchParams.get('client_id') || ''
  } catch { }

  // Fluxo de renovacao: access_token expirou (~1h) mas temos o refresh_token.
  if (refreshToken) {
    try {
      oauthLog('refreshing token, client_id=', client_id)
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: client_id || GOOGLE_CLIENT_ID,
          client_secret: clientSecret || GOOGLE_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      })
      const raw = await tokenRes.text()
      oauthLog('refresh response', tokenRes.status, raw)
      let tokenData = {}
      try {
        tokenData = raw ? JSON.parse(raw) : {}
      } catch {
        tokenData = {}
      }
      if (tokenRes.ok && tokenData.access_token) {
        return { accessToken: tokenData.access_token, refreshToken }
      }
      const refreshDesc = tokenData.error_description || ''
      return { error: ((tokenData && tokenData.error) || `refresh-${tokenRes.status}`) + (refreshDesc ? `: ${refreshDesc}` : '') }
    } catch {
      return { error: 'refresh' }
    }
  }

  return new Promise((resolve) => {
    let done = false
    let verifier = ''
    const finish = (result) => {
      if (done) return
      done = true
      try { server.close() } catch { }
      resolve(result)
    }
    const server = http.createServer((req, res) => {
      const html = '<html><body style="background:#0d0e10;color:#4ade80;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Conectado! Voce pode fechar esta janela.</body></html>'
      const errHtml = '<html><body style="background:#111;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Login cancelado ou erro de autorizacao.</body></html>'
      try {
        oauthLog('callback hit', req.method, req.url)
        const url = new URL(req.url, 'http://127.0.0.1')
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')
        const errorDesc = url.searchParams.get('error_description') || url.searchParams.get('error_uri') || ''
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(errHtml)
          oauthLog('authorize error', error, errorDesc)
          finish({ error: errorDesc ? `${error}: ${errorDesc}` : error })
          return
        }
        if (!code) {
          // Nao eh o redirect real do Google (favicon, probe, etc.). Responde
          // e continua esperando pelo callback com o codigo.
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('ok')
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        oauthLog('code received, exchanging')
        ;(async () => {
          try {
            oauthLog('exchanging code, client_id=', client_id)
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id,
                client_secret: clientSecret || GOOGLE_CLIENT_SECRET,
                redirect_uri: `http://127.0.0.1:${OAUTH_PORT}/`,
                grant_type: 'authorization_code',
                code_verifier: verifier,
              }),
            })
            const raw = await tokenRes.text()
            oauthLog('token response', tokenRes.status, raw)
            let tokenData = {}
            try {
              tokenData = raw ? JSON.parse(raw) : {}
            } catch {
              tokenData = {}
            }
            if (!tokenRes.ok || !tokenData.access_token) {
              const desc = tokenData.error_description || tokenData.error_uri || ''
              finish({ error: ((tokenData && tokenData.error) || `token-${tokenRes.status}`) + (desc ? `: ${desc}` : '') })
              return
            }
            let profile = null
            if (tokenData.id_token) {
              try {
                const parts = String(tokenData.id_token).split('.')
                if (parts.length === 3) {
                  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
                  profile = {
                    googleId: payload.sub,
                    email: payload.email,
                    name: payload.name,
                    photoUrl: payload.picture || '',
                  }
                }
              } catch { }
            }
            finish({ accessToken: tokenData.access_token, profile, refreshToken: tokenData.refresh_token })
          } catch {
            finish({ error: 'exchange' })
          }
        })()
      } catch {
        res.writeHead(500)
        res.end('')
        finish({ error: 'callback' })
      }
    })
    server.on('error', (err) => { oauthLog('server error', err.code); finish({ error: 'server' }) })
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      oauthLog('listening on', OAUTH_PORT)
      verifier = base64UrlEncode(crypto.randomBytes(32))
      const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest())
      client_id = ''
      try {
        const u = new URL(authUrl)
        client_id = u.searchParams.get('client_id') || ''
      } catch { }
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      let scope = 'openid email profile'
      try {
        scope = new URL(authUrl).searchParams.get('scope') || scope
      } catch { }
      url.searchParams.set('client_id', client_id)
      url.searchParams.set('redirect_uri', `http://127.0.0.1:${OAUTH_PORT}/`)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scope)
      // access_type=offline + consent: sem isso o Google nem sempre devolve
      // refresh_token (só no 1º consentimento) e o app cai no re-login a cada
      // ~1h quando o access_token expira.
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'select_account consent')
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', base64UrlEncode(crypto.randomBytes(16)))
      oauthLog('opening scope=', scope, url.toString())
      try { shell.openExternal(url.toString()) } catch { finish({ error: 'open' }) }
      // Timeout de seguranca caso o usuario nunca complete o login.
      setTimeout(() => { if (!done) finish({ error: 'timeout' }) }, 5 * 60 * 1000)
    })
  })
})

// Atualização automática via GitHub Releases (electron-updater).
// O feed vem do app-update.yml gerado no build (publish.github do
// package.json). Funciona empacotado; em dev ou sem feed, falha em
// silêncio e o app usa o checkUpdate do backend como fallback.
let updater = null
try {
  updater = require('electron-updater').autoUpdater
} catch { updater = null }

function sendUpdateEvent(payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('app-update', payload)
    }
  } catch { }
}

function notifyUpdate(title, body) {
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({ title, body })
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
    })
    n.show()
  } catch { }
}

function setupAutoUpdater() {
  if (!updater || !app.isPackaged) return
  try {
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false
    updater.on('checking-for-update', () => sendUpdateEvent({ status: 'checking' }))
    updater.on('update-available', (info) => {
      sendUpdateEvent({ status: 'available', version: (info && info.version) || '' })
      notifyUpdate('Friends Space', 'Nova versão disponível — baixando em segundo plano.')
    })
    updater.on('update-not-available', () => sendUpdateEvent({ status: 'up-to-date' }))
    updater.on('download-progress', (p) => sendUpdateEvent({ status: 'downloading', percent: Math.round((p && p.percent) || 0) }))
    updater.on('update-downloaded', (info) => {
      sendUpdateEvent({ status: 'downloaded', version: (info && info.version) || '' })
      notifyUpdate('Friends Space', 'Atualização pronta — será instalada ao sair.')
    })
    updater.on('error', (err) => sendUpdateEvent({ status: 'error', message: String((err && err.message) || err || 'erro') }))
    setTimeout(() => { try { updater.checkForUpdates() } catch { } }, 30 * 1000)
    setInterval(() => { try { updater.checkForUpdates() } catch { } }, 6 * 3600 * 1000)
  } catch { }
}

ipcMain.handle('update:check', async () => {
  try {
    if (!updater || !app.isPackaged) return { ok: false, reason: 'unavailable' }
    const result = await updater.checkForUpdates()
    const info = result && result.updateInfo ? result.updateInfo : null
    return { ok: true, version: (info && info.version) || '', files: (info && info.files ? info.files.length : 0) }
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err || 'erro') }
  }
})

ipcMain.handle('update:install', () => {
  try {
    if (updater) updater.quitAndInstall(false, true)
    return true
  } catch { return false }
})

ipcMain.handle('app:version', () => {
  try { return app.getVersion() } catch { return '1.0.0' }
})

// RNNoise (áudio limpo) no app empacotado: fetch(file://) é bloqueado pelo
// Chromium, então o renderer pede os bytes por aqui (fs funciona no asar).
ipcMain.handle('rnnoise:load', () => {
  try {
    const cands = (name) => [
      path.join(__dirname, '..', 'dist', 'rnnoise', name),
      path.join(__dirname, '..', 'public', 'rnnoise', name),
    ]
    let gluePath = null
    let wasmPath = null
    for (const p of cands('rnnoise.js')) { try { if (fs.existsSync(p)) { gluePath = p; break } } catch { } }
    for (const p of cands('rnnoise.wasm')) { try { if (fs.existsSync(p)) { wasmPath = p; break } } catch { } }
    if (!gluePath || !wasmPath) return null
    return {
      glue: fs.readFileSync(gluePath, 'utf8'),
      wasmBase64: fs.readFileSync(wasmPath).toString('base64'),
    }
  } catch { return null }
})

function trayIconPath() {
  // .ico quebra o Tray no Linux (startup crash) — usa png por plataforma.
  const candidates = process.platform === 'linux'
    ? ['icon.png', 'icon.ico']
    : process.platform === 'darwin'
      ? ['icon.icns', 'icon.png', 'icon.ico']
      : ['icon.ico', 'icon.png']
  for (const name of candidates) {
    try {
      const p = path.join(__dirname, '..', 'build', name)
      if (fs.existsSync(p)) return p
    } catch { }
  }
  return undefined
}

function cmpVersions(a, b) {
  const norm = (v) => String(v || '').trim().replace(/^[v=\s]+/, '').split('.').map(p => {
    const n = parseInt(p, 10)
    return Number.isFinite(n) ? n : 0
  })
  const x = norm(a)
  const y = norm(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}
function backendCheckUpdate() {
  // Fallback sem electron-updater: pergunta ao backend (mesma fonte do site).
  return new Promise((resolve) => {
    try {
      const https = require('node:https')
      const body = JSON.stringify({ action: 'checkUpdate' })
      const req = https.request('https://friends-space.pages.dev/api/app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let raw = ''
        res.on('data', (c) => { raw += c })
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.setTimeout(15000, () => { try { req.destroy() } catch { } resolve(null) })
      req.write(body)
      req.end()
    } catch { resolve(null) }
  })
}
async function manualCheckForUpdates() {
  // Botao do tray SEMPRE responde: updater, backend ou erro explicado.
  const current = (() => { try { return app.getVersion() } catch { return '' } })()
  try {
    if (updater && app.isPackaged) {
      const result = await updater.checkForUpdates()
      const info = result && result.updateInfo ? result.updateInfo : null
      const latest = info && info.version ? String(info.version) : ''
      if (latest && cmpVersions(latest, current) > 0) {
        notifyUpdate('Friends Space', 'Nova versão ' + latest + ' baixando em segundo plano.')
        dialog.showMessageBoxSync({
          type: 'info', title: 'Friends Space',
          message: 'Nova versão disponível: ' + latest + ' (atual: ' + (current || '?') + '). Baixando em segundo plano.',
        })
      } else {
        dialog.showMessageBoxSync({
          type: 'info', title: 'Friends Space',
          message: 'Você está na versão mais recente' + (current ? ' (' + current + ').' : '.'),
        })
      }
      return
    }
  } catch (e) {
    // cai para o fallback do backend
  }
  try {
    const r = await backendCheckUpdate()
    const latest = r && r.latestVersion ? String(r.latestVersion) : ''
    if (latest && cmpVersions(latest, current) > 0) {
      const url = r.downloadUrl || 'https://github.com/kaandor/update-electro/releases/latest'
      const btn = dialog.showMessageBoxSync({
        type: 'info', title: 'Friends Space', buttons: ['Baixar agora', 'Depois'], defaultId: 0,
        message: 'Nova versão disponível: ' + latest + ' (atual: ' + (current || '?') + ').',
      })
      if (btn === 0) { try { shell.openExternal(url) } catch { } }
    } else if (latest) {
      dialog.showMessageBoxSync({ type: 'info', title: 'Friends Space', message: 'Você está na versão mais recente' + (current ? ' (' + current + ').' : '.') })
    } else {
      dialog.showMessageBoxSync({ type: 'warning', title: 'Friends Space', message: 'Não foi possível verificar agora. Tente de novo em instantes.' })
    }
  } catch {
    try { dialog.showMessageBoxSync({ type: 'warning', title: 'Friends Space', message: 'Não foi possível verificar agora. Tente de novo em instantes.' }) } catch { }
  }
}
function buildTray() {
  const trayIcon = trayIconPath()
  try {
    tray = new Tray(trayIcon || nativeImage.createEmpty())
  tray.setToolTip('Friends Space')
  const loginItem = (() => { try { return app.getLoginItemSettings().openAtLogin } catch { return false } })()
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Friends Space', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } } },
    { type: 'separator' },
    {
      label: process.platform === 'linux' ? 'Iniciar com o sistema' : 'Iniciar com o Windows',
      type: 'checkbox',
      checked: loginItem,
      click: (item) => {
        try {
          app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true, args: ['--hidden'] })
        } catch { }
      },
    },
    { type: 'separator' },
    { label: 'Verificar atualizações', click: () => { void manualCheckForUpdates() } },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide()
      else { mainWindow.show(); mainWindow.focus() }
    }
  })
  } catch {
    // Sem tray (ex.: Linux sem libappindicator) o app segue sem icone.
    tray = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    title: 'Friends Space',
    frame: isDev ? true : false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show()
  })
  mainWindow.on('maximize', () => { if (mainWindow) mainWindow.webContents.send('window-state', 'maximized') })
  mainWindow.on('unmaximize', () => { if (mainWindow) mainWindow.webContents.send('window-state', 'normal') })
  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedPopupHosts = ['accounts.google.com', 'accounts.youtube.com', 'oauth2.googleapis.com', 'myaccount.google.com', 'consent.google.com']
    const host = (() => {
      try { return new URL(url).hostname } catch { return '' }
    })()
    if (allowedPopupHosts.includes(host)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          width: 480,
          height: 640,
          backgroundColor: '#ffffff',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL(devUrl)
  } else if (fs.existsSync(indexHtml)) {
    mainWindow.loadFile(indexHtml)
  } else {
    mainWindow.loadURL('https://friends-space.pages.dev')
  }
}

// Overlay in-game (estilo Discord): janela transparente, sempre no topo, que
// passa cliques direto para o jogo e mostra os avatares de quem esta falando.
// Sobe apenas quando ha alguem falando e some ~2,5s apos o silencio.
const OVERLAY_HTML = path.join(__dirname, 'overlay.html')

function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 96,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  // setVisibleOnAllWorkspaces com opcoes so existe no macOS — no Linux lanca excecao.
  try {
    if (process.platform === 'darwin') overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    else if (typeof overlayWindow.setVisibleOnAllWorkspaces === 'function') overlayWindow.setVisibleOnAllWorkspaces(true)
  } catch { }
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setPosition(12, 12, false)
  if (fs.existsSync(OVERLAY_HTML)) overlayWindow.loadFile(OVERLAY_HTML)
  overlayWindow.on('closed', () => { overlayWindow = null })
  return overlayWindow
}

ipcMain.on('overlay-update', (_event, users) => {
  overlayData = Array.isArray(users) ? users : null
  if (overlayHideTimer !== null) { clearTimeout(overlayHideTimer); overlayHideTimer = null }
  const win = overlayWindow || createOverlay()
  if (!win || win.webContents.isDestroyed()) return
  if (!overlayData || overlayData.length === 0) {
    overlayHideTimer = setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
    }, 2500)
    try { win.webContents.send('overlay-render', []) } catch { }
    return
  }
  try {
    win.webContents.send('overlay-render', overlayData)
  } catch { }
  if (!win.isVisible()) win.show()
})

app.on('before-quit', () => {
  isQuitting = true
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(function () {
    // Compartilhamento de tela: o renderer chama navigator.mediaDevices.getDisplayMedia,
    // que no Electron so funciona se o main registrar este handler. Abre um seletor
    // com miniaturas de monitores e janelas — capturar cegamente a tela principal
    // deixa a propria janela do app preta na captura (e pode derrubar o renderer).
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sourceId = await showSharePicker()
        if (!sourceId) {
          callback(null)
          return
        }
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
        const source = sources.find((s) => s.id === sourceId)
        if (source) callback({ video: source })
        else callback(null)
      } catch {
        callback(null)
      }
    })

    // Abre a janela de escolha de fonte para compartilhar.
    function showSharePicker() {
      return new Promise(function (resolve) {
        if (sharePickerResolve) {
          const prev = sharePickerResolve
          sharePickerResolve = null
          prev(null)
        }
        sharePickerResolve = resolve
        sharePickerWindow = new BrowserWindow({
          width: 720,
          height: 560,
          parent: mainWindow,
          modal: true,
          resizable: false,
          minimizable: false,
          maximizable: false,
          title: 'Compartilhar tela',
          backgroundColor: '#1e1f22',
          webPreferences: {
            preload: path.join(__dirname, 'picker-preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
          },
        })
        sharePickerWindow.setMenuBarVisibility(false)
        sharePickerWindow.loadFile(path.join(__dirname, 'picker.html'))
        sharePickerWindow.on('closed', function () {
          sharePickerWindow = null
          const r = sharePickerResolve
          sharePickerResolve = null
          if (r) r(null)
        })
      })
    }

    ipcMain.handle('picker:sources', async () => {
      const tryGet = async (opts) => {
        try { return await desktopCapturer.getSources(opts) } catch { return [] }
      }
      let sources = await tryGet({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true })
      if (!sources || !sources.length) sources = await tryGet({ types: ['screen', 'window'], thumbnailSize: { width: 160, height: 100 } })
      if (!sources || !sources.length) sources = await tryGet({ types: ['screen', 'window'] })
      return (sources || []).map(function (s) {
        let thumb = ''
        try { thumb = s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '' } catch { thumb = '' }
        return {
          id: s.id,
          name: s.name || s.id,
          kind: String(s.id).startsWith('screen:') ? 'screen' : 'window',
          thumbnail: thumb,
        }
      })
    })

    ipcMain.on('picker:choose', (_event, sourceId) => {
      const r = sharePickerResolve
      sharePickerResolve = null
      if (sharePickerWindow) {
        sharePickerWindow.destroy()
        sharePickerWindow = null
      }
      if (r) r(sourceId)
    })

    ipcMain.on('picker:cancel', () => {
      const r = sharePickerResolve
      sharePickerResolve = null
      if (sharePickerWindow) {
        sharePickerWindow.destroy()
        sharePickerWindow = null
      }
      if (r) r(null)
    })

    createWindow()
    buildTray()
    setupAutoUpdater()
    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => { isQuitting = true })

app.on('will-quit', function () {
  if (cursorFeedTimer !== null) { clearInterval(cursorFeedTimer); cursorFeedTimer = null }
  if (inputProc && !inputProc.killed) {
    try { inputProc.stdin.end() } catch { }
    try { inputProc.kill() } catch { }
  }
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
