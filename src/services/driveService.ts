import { getGoogleClientId, getGoogleClientSecret } from './googleAuth'

// Integracao com Google Drive.
// Toda midia/personalizacao do usuario fica no Drive DELE (pasta "FRIENDS-SPACE"),
// para o Friends Space nao ocupar o banco de dados com arquivos.
// Os arquivos ficam em "qualquer pessoa com o link pode ver" (reader/anyone):
// o link e anonimo como um CDN do Discord — quem recebe abre sem login e sem
// ver nada da conta do Drive de quem enviou. O ID do arquivo e aleatorio e
// longo, entao so quem tem o link acessa.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'friends-space:drive-token'
const ROOT_KEY = 'friends-space:drive-root-folder-id'

const SUBFOLDERS = ['fotos', 'videos', 'gifs', 'emojis', 'mensagens', 'mods', 'perfil', 'transmissoes', 'stories', 'posts']
const ROOT_FOLDER_NAME = 'FRIENDS-SPACE'

interface DriveToken {
  access_token: string
  expires_at: number
  email?: string
  refresh_token?: string
}

interface OAuth2Client {
  requestAccessToken: () => void
}

type GsiWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (resp: Partial<{ access_token: string; expires_in: number }>) => void
        }) => OAuth2Client
      }
    }
  }
}

let lastDriveError: string | null = null

export function getLastDriveError() {
  return lastDriveError
}

export function clearDriveError() {
  lastDriveError = null
}

// Token cru (mesmo expirado) — usado para tentar refresh antes de pedir login.
function loadStoredToken(): DriveToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const token = JSON.parse(raw) as DriveToken
    if (!token.access_token) return null
    return token
  } catch {
    return null
  }
}

// Token valido agora (nao expirado).
function loadToken(): DriveToken | null {
  const token = loadStoredToken()
  if (!token) return null
  if (token.expires_at && Date.now() > token.expires_at) return null
  return token
}

function saveToken(token: DriveToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
}

// Se o access_token expirou mas temos refresh_token (fluxo Electron), troca
// pelo novo silenciosamente. No WEB, renova via GIS (Google Identity Services)
// sem popup — o usuario ja autorizou o escopo antes. Retorna token valido ou null.
async function ensureFreshToken(): Promise<DriveToken | null> {
  const valid = loadToken()
  if (valid) return valid
  const stored = loadStoredToken()
  if (!stored) return null
  // Fluxo Electron: refresh_token trocado no main.cjs
  if (stored.refresh_token) {
    try {
      const electronApi = (window as unknown as {
        electronAPI?: {
          isElectron?: boolean
          googleAuth?: (authUrl?: string, clientSecret?: string, refreshToken?: string) => Promise<{ accessToken?: string; refreshToken?: string; error?: string }>
        }
      }).electronAPI
      if (electronApi?.isElectron && electronApi.googleAuth) {
        // Passa o client_id real no authUrl para o main usar no refresh (o main.cjs
        // extrai o client_id do authUrl; sem isso ele usa o do site e o refresh
        // falha com invalid_grant — token emitido com o client do desktop).
        const refreshAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(getGoogleClientId())}`
        const result = await electronApi.googleAuth(refreshAuthUrl, getGoogleClientSecret(), stored.refresh_token)
        if (result?.accessToken) {
          const fresh: DriveToken = {
            access_token: result.accessToken,
            expires_at: Date.now() + 3600 * 1000,
            refresh_token: stored.refresh_token,
          }
          saveToken(fresh)
          return fresh
        }
      }
    } catch {
      // cai para o refresh web se o electron falhar
    }
  }
  // Fluxo WEB: renovacao silenciosa via GIS (sem popup, prompt vazio).
  // So mostra o gate de login se o usuario tiver REVOGADO o acesso.
  return webSilentRefresh()
}

// Garante que o script do Google Identity Services esteja carregado. Se nao
// estiver (ex.: o painel de armazenamento abriu antes do login), injeta o
// script uma unica vez e aguarda.
function ensureGisLoaded(): Promise<boolean> {
  if ((window as GsiWindow).google?.accounts?.oauth2) return Promise.resolve(true)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve(Boolean((window as GsiWindow).google?.accounts?.oauth2))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

// Renova o access_token no navegador via Google Identity Services sem abrir
// popup (prompt: ''). Falha silenciosamente se o usuario revogou o acesso.
function webSilentRefresh(): Promise<DriveToken | null> {
  const clientId = getGoogleClientId()
  if (!clientId) return Promise.resolve(null)
  return ensureGisLoaded().then((loaded) => {
    if (!loaded) return null
    const oauth2 = (window as GsiWindow).google?.accounts?.oauth2
    if (!oauth2) return null
    return new Promise((resolve) => {
      let done = false
      const finish = (token: DriveToken | null) => { if (!done) { done = true; resolve(token) } }
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        prompt: '',
        callback: (resp: Partial<{ access_token: string; expires_in: number; error: string }>) => {
          if (resp?.access_token) {
            const expires_in = resp.expires_in || 3600
            const fresh: DriveToken = { access_token: resp.access_token, expires_at: Date.now() + expires_in * 1000 }
            saveToken(fresh)
            finish(fresh)
          } else {
            finish(null)
          }
        },
      } as never)
      try {
        tokenClient.requestAccessToken()
        // GIS as vezes nao chama o callback em erros silenciosos; timeout de 12s
        window.setTimeout(() => finish(null), 12000)
      } catch {
        finish(null)
      }
    })
  })
}

// No localhost o Drive NAO e obrigatorio: libera o app sem login do Drive.
// No site oficial (producao) continua exigindo normalmente.
export function isLocalDriveBypass() {
  try {
    if (typeof window === 'undefined') return false
    const h = window.location.hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')
  } catch {
    return false
  }
}

export function isDriveConnected() {
  if (isLocalDriveBypass()) return true
  if (loadToken()) return true
  // Qualquer token armazenado (mesmo expirado) "conta como conectado": no web o
  // GIS renova silenciosamente; no Electron o refresh_token troca no main.
  // Sem isso, o app pediria login toda vez que o access_token expirar (~1h).
  return Boolean(loadStoredToken())
}

export function getDriveFolderId() {
  return localStorage.getItem(ROOT_KEY)
}

export interface DriveStorageInfo {
  limitBytes: number
  usedBytes: number
  freeBytes: number
}

// Consulta a quota do Google Drive do usuario conectado. Retorna null se o
// Drive nao estiver conectado/nao for possivel obter os dados.
export async function getDriveStorage(): Promise<DriveStorageInfo | null> {
  const token = await ensureFreshToken()
  if (!token) return null
  try {
    const data = await apiFetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', token.access_token)
    const limit = Number(data?.storageQuota?.limit) || 0
    const used = Number(data?.storageQuota?.usage) || 0
    if (!limit) return null
    return { limitBytes: limit, usedBytes: used, freeBytes: Math.max(0, limit - used) }
  } catch (err) {
    console.error('[Drive] getDriveStorage error:', err)
    return null
  }
}

async function apiFetch(url: string, token: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Drive API erro ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// Abre o popup de autorizacao do Drive (reusa o client_id do login Google).
// No app Electron usa o fluxo nativo (janela externa + troca de code no main),
// pois o popup do Google Identity Services nao funciona dentro do BrowserWindow.
export function authorizeDrive(): Promise<boolean> {
  const electronApi = (window as unknown as {
    electronAPI?: {
      isElectron?: boolean
      googleAuth?: (authUrl?: string, clientSecret?: string, refreshToken?: string) => Promise<{ accessToken?: string; refreshToken?: string; error?: string }>
    }
  }).electronAPI

  if (electronApi?.isElectron) {
    return (async () => {
      try {
        const clientId = getGoogleClientId()
        if (!clientId) return false
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: 'http://127.0.0.1:37115/',
          response_type: 'code',
          scope: DRIVE_SCOPE,
          prompt: 'select_account',
        }).toString()}`
        const result = await electronApi.googleAuth?.(authUrl, getGoogleClientSecret())
        if (result?.accessToken) {
          saveToken({
            access_token: result.accessToken,
            expires_at: Date.now() + 3600 * 1000,
            refresh_token: result.refreshToken,
          })
          return true
        }
        return false
      } catch {
        return false
      }
    })()
  }

  return new Promise((resolve) => {
    const clientId = getGoogleClientId()
    if (!clientId) {
      resolve(false)
      return
    }

    const run = () => {
      const g = (window as GsiWindow).google
      if (!g?.accounts?.oauth2) {
        resolve(false)
        return
      }
      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (resp: Partial<{ access_token: string; expires_in: number }>) => {
          if (resp?.access_token) {
            const expires_in = resp.expires_in || 3600
            saveToken({ access_token: resp.access_token, expires_at: Date.now() + expires_in * 1000 })
            resolve(true)
          } else {
            resolve(false)
          }
        },
      })
      tokenClient.requestAccessToken()
    }

    if ((window as GsiWindow).google?.accounts?.oauth2) {
      run()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.onload = run
      script.onerror = () => resolve(false)
      document.head.appendChild(script)
    }
  })
}

// Conecta de verdade: token + estrutura de pastas pronta. So retorna true se o
// Drive estiver utilizavel (root FRIENDS-SPACE + subpastas existindo).
export async function connectDrive(): Promise<boolean> {
  if (isLocalDriveBypass()) return true
  const existing = await ensureFreshToken()
  if (existing) return createFolderStructure()
  const ok = await authorizeDrive()
  if (!ok) return false
  return createFolderStructure()
}

export function disconnectDrive() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROOT_KEY)
  clearDriveError()
}

// Estrutura de servidores no Drive: FRIENDS-SPACE/Servidores/Meus Servidores.
// Os dados de cada servidor criado vao para uma subpasta propria em "Meus Servidores".
const SERVERS_FOLDER = 'Servidores'
const MY_SERVERS_FOLDER = 'Meus Servidores'
const MY_TRANSMISSIONS_FOLDER = 'Minhas Transmissoes'
const SERVER_TRANSMISSIONS_FOLDER = 'Transmissoes'

// Garante que "Servidores", "Meus Servidores" e "Minhas Transmissoes" existam
// na raiz FRIENDS-SPACE.
export async function ensureServerFolders(): Promise<{ serversFolderId: string | null; myServersFolderId: string | null; myTransmissionsFolderId: string | null }> {
  const token = loadToken() || (await ensureFreshToken())
  if (!token) return { serversFolderId: null, myServersFolderId: null, myTransmissionsFolderId: null }
  const root = getDriveFolderId()
  if (!root) return { serversFolderId: null, myServersFolderId: null, myTransmissionsFolderId: null }
  try {
    const serversFolderId = await findOrCreateFolder(root, SERVERS_FOLDER, token.access_token)
    const myTransmissionsFolderId = await findOrCreateFolder(root, MY_TRANSMISSIONS_FOLDER, token.access_token)
    const myServersFolderId = serversFolderId ? await findOrCreateFolder(serversFolderId, MY_SERVERS_FOLDER, token.access_token) : null
    return { serversFolderId, myServersFolderId, myTransmissionsFolderId }
  } catch {
    return { serversFolderId: null, myServersFolderId: null, myTransmissionsFolderId: null }
  }
}

// Pasta pessoal de transmissões do usuário logado (gravações/streams).
export async function ensureMyTransmissionsFolder(): Promise<string | null> {
  const { myTransmissionsFolderId } = await ensureServerFolders()
  return myTransmissionsFolderId
}

// Pasta de "Transmissoes" dentro da pasta do servidor em "Meus Servidores".
export async function ensureServerTransmissionsFolder(serverId: string, serverName: string): Promise<string | null> {
  const serverFolderId = await getServerDriveFolder(serverId, serverName)
  if (!serverFolderId) return null
  const token = loadToken() || (await ensureFreshToken())
  if (!token) return null
  return findOrCreateFolder(serverFolderId, SERVER_TRANSMISSIONS_FOLDER, token.access_token)
}

// Cria a pasta de um servidor dentro de "Meus Servidores" e devolve o ID.
// Se ja existir, apenas devolve o ID existente.
export async function createServerDriveFolder(serverId: string, serverName: string): Promise<string | null> {
  const { myServersFolderId } = await ensureServerFolders()
  if (!myServersFolderId) return null
  const token = loadToken() || (await ensureFreshToken())
  if (!token) return null
  const safeName = `${serverName.replace(/[\\/:*?"<>|]/g, '')}-${serverId.slice(0, 8)}`
  return findOrCreateFolder(myServersFolderId, safeName, token.access_token)
}

// Devolve a pasta raiz de um servidor em "Meus Servidores" (para upload de dados).
export async function getServerDriveFolder(serverId: string, serverName: string): Promise<string | null> {
  const { myServersFolderId } = await ensureServerFolders()
  if (!myServersFolderId) return null
  const token = loadToken() || (await ensureFreshToken())
  if (!token) return null
  const safeName = `${serverName.replace(/[\\/:*?"<>|]/g, '')}-${serverId.slice(0, 8)}`
  return findOrCreateFolder(myServersFolderId, safeName, token.access_token)
}

async function findOrCreateFolder(parentId: string | null, name: string, token: string): Promise<string | null> {
  const query = `%27${encodeURIComponent(parentId || 'root')}%27+in+parents+and+name%3D%27${encodeURIComponent(name)}%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse`
  const list = await apiFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, token)
  if (list?.files?.length > 0) return list.files[0].id as string
  const created = await apiFetch('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined }),
  })
  return (created?.id as string) || null
}

export async function createFolderStructure(): Promise<boolean> {
  if (isLocalDriveBypass()) { clearDriveError(); return true }
  const token = loadToken() || (await ensureFreshToken())
  if (!token) {
    lastDriveError = 'Drive nao conectado'
    return false
  }
  try {
    let rootId = getDriveFolderId()
    if (rootId) {
      const existing = await apiFetch(`https://www.googleapis.com/drive/v3/files/${rootId}?fields=id`, token.access_token).catch(() => null)
      if (existing?.id) rootId = existing.id
      else rootId = null
    }
    if (!rootId) {
      rootId = await findOrCreateFolder(null, ROOT_FOLDER_NAME, token.access_token)
    }
    if (!rootId) {
      lastDriveError = 'Nao foi possivel criar a pasta FRIENDS-SPACE'
      return false
    }
    localStorage.setItem(ROOT_KEY, rootId)
    const subfolders = await Promise.all(SUBFOLDERS.map((name) => findOrCreateFolder(rootId, name, token.access_token)))
    if (subfolders.some((id) => !id)) {
      lastDriveError = 'Nao foi possivel criar todas as pastas no Drive'
      return false
    }
    const { serversFolderId, myServersFolderId, myTransmissionsFolderId } = await ensureServerFolders()
    if (!serversFolderId || !myServersFolderId || !myTransmissionsFolderId) {
      lastDriveError = 'Nao foi possivel criar a estrutura de servidores no Drive'
      return false
    }
    clearDriveError()
    return true
  } catch {
    lastDriveError = 'Falha ao criar estrutura no Drive'
    return false
  }
}

// Upload para o Drive e retorna URL de visualizacao anonima (link tipo CDN).
// folder = subpasta. shareEmails: emails extras que tambem poderao ver
// (mantido por compatibilidade). O link em si nao exige login: qualquer pessoa
// com o link ve o arquivo, sem nenhum vinculo com a conta do uploader.
export async function uploadToDrive(file: Blob, name: string, mimeType: string, folder: string, shareEmails?: string[], parentName?: string): Promise<string | null> {
  const token = loadToken() || (await ensureFreshToken())
  if (!token) {
    // Localhost: sem Drive, usa blob local so pra testar (nao persiste entre reloads).
    if (isLocalDriveBypass()) {
      try { clearDriveError(); return URL.createObjectURL(file) } catch { return null }
    }
    lastDriveError = 'Drive nao conectado'
    return null
  }
  // Garante que a raiz FRIENDS-SPACE existe antes de buscar a subpasta.
  if (!getDriveFolderId()) {
    const structure = await createFolderStructure()
    if (!structure) return null
  }
  const root = getDriveFolderId()
  if (!root) return null
  const folderId = parentName
    ? await ensureNestedFolder([parentName, folder], token.access_token)
    : await findOrCreateFolder(root, folder, token.access_token)
  if (!folderId) {
    lastDriveError = 'Nao foi possivel acessar a pasta no Drive'
    return null
  }

  const metadata = `{ "name": ${JSON.stringify(name)}, "mimeType": ${JSON.stringify(mimeType)}, "parents": ["${folderId}"] }`
  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file', file, name)

  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}` },
    body: form,
  })
  if (!res.ok) {
    lastDriveError = `Falha no upload (${res.status})`
    return null
  }
  const data = await res.json()
  const fileId: string = data.id
  if (Array.isArray(shareEmails)) {
    const emails = [...new Set(shareEmails.filter((email): email is string => typeof email === 'string' && /@/.test(email)))]
    await Promise.all(emails.map(email =>
      apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, token.access_token, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      }).catch(() => null)
    ))
  }
  // Link anonimo (tipo CDN do Discord): qualquer pessoa com o link abre sem login.
  // Usa um token recarregado/revalidado para o passo de permissao — o token do
  // upload pode ter expirado entre o envio e o compartilhamento, deixando o
  // arquivo privado (banner/foto somem para os outros). Se nao der para
  // publicar, o upload falha (null) em vez de persistir uma URL quebrada.
  const shareOk = await sharePublicly(fileId)
  if (!shareOk) return null
  // video/audio precisam de streaming direto; imagem/gif usam o endpoint de
  // thumbnail anonimo (lh3.googleusercontent.com), que carrega de forma
  // confiavel em <img>/CSS sem login, sem redirects nem paginas de confirmacao.
  const isStream = /^(video|audio)\//.test(mimeType)
  clearDriveError()
  return isStream
    ? `https://drive.usercontent.google.com/download?id=${fileId}&export=view`
    : `https://lh3.googleusercontent.com/d/${fileId}=w2000`
}

// Mantém o token do Drive aquecido: renova ao voltar para a aba e a cada
// 20min. Sem isso o token expira (~1h) e o próximo envio "desconecta".
let keepWarmStarted = false
export function startDriveKeepWarm() {
  if (keepWarmStarted || typeof window === 'undefined') return
  keepWarmStarted = true
  const warm = () => { void ensureFreshToken().catch(() => { }) }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') warm() })
  window.setInterval(warm, 20 * 60 * 1000)
}

// Upload com progresso (XHR): o fetch não informa progresso de envio.
// Mesmo fluxo do uploadToDrive + verificação de que ficou público.
// Pastas de arquivo: enviados vão para "Arquivos enviados/<pasta>", recebidos
// (salvos ao baixar) para "Arquivos recebidos/<pasta>".
async function ensureNestedFolder(names: string[], accessToken: string): Promise<string | null> {
  const root = getDriveFolderId()
  if (!root) return null
  let parent = root
  for (const n of names) {
    const id = await findOrCreateFolder(parent, n, accessToken)
    if (!id) return null
    parent = id
  }
  return parent
}

export async function uploadToDriveWithProgress(
  file: Blob,
  name: string,
  mimeType: string,
  folder: string,
  shareEmails?: string[],
  onProgress?: (pct: number) => void,
  parentName?: string,
): Promise<string | null> {
  const token = loadToken() || (await ensureFreshToken())
  if (!token) {
    // Localhost: sem Drive, usa blob local so pra testar.
    if (isLocalDriveBypass()) {
      try { onProgress?.(100); clearDriveError(); return URL.createObjectURL(file) } catch { return null }
    }
    lastDriveError = 'Drive não conectado. Reconecte o Drive.'
    return null
  }
  if (!getDriveFolderId()) {
    const structure = await createFolderStructure()
    if (!structure) return null
  }
  const root = getDriveFolderId()
  if (!root) return null
  const folderId = parentName
    ? await ensureNestedFolder([parentName, folder], token.access_token)
    : await findOrCreateFolder(root, folder, token.access_token)
  if (!folderId) {
    lastDriveError = 'Não foi possível acessar a pasta no Drive'
    return null
  }
  const metadata = `{ "name": ${JSON.stringify(name)}, "mimeType": ${JSON.stringify(mimeType)}, "parents": ["${folderId}"] }`
  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file', file, name)
  let fileId: string
  try {
    fileId = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id')
      xhr.setRequestHeader('Authorization', `Bearer ${token.access_token}`)
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          try { onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100))) } catch { }
        }
      }
      xhr.onload = () => {
        if (xhr.status === 401 || xhr.status === 403) { reject(new Error('auth')); return }
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).id) } catch { reject(new Error('resposta')) }
        } else reject(new Error('status ' + xhr.status))
      }
      xhr.onerror = () => reject(new Error('rede'))
      xhr.send(form)
    })
  } catch (e) {
    lastDriveError = e instanceof Error && e.message === 'auth'
      ? 'Sessão do Drive expirou. Reconecte o Drive.'
      : 'Falha no upload. Verifique a conexão.'
    return null
  }
  if (!fileId) {
    lastDriveError = 'Falha no upload.'
    return null
  }
  if (Array.isArray(shareEmails)) {
    const emails = [...new Set(shareEmails.filter((email): email is string => typeof email === 'string' && /@/.test(email)))]
    await Promise.all(emails.map(email =>
      apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, token.access_token, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      }).catch(() => null)
    ))
  }
  const shareOk = await sharePublicly(fileId)
  if (!shareOk) {
    lastDriveError = lastDriveError || 'Não foi possível tornar o arquivo público'
    return null
  }
  const isStream = /^(video|audio)\//.test(mimeType)
  const finalUrl = isStream
    ? `https://drive.usercontent.google.com/download?id=${fileId}&export=view`
    : `https://lh3.googleusercontent.com/d/${fileId}=w2000`
  if (!isStream) {
    const checkPublic = async () => {
      try {
        const r = await fetch(finalUrl, { method: 'GET' })
        return r.ok
      } catch { return false }
    }
    let ok = await checkPublic()
    if (!ok) {
      await sharePublicly(fileId)
      ok = await checkPublic()
    }
    if (!ok) {
      lastDriveError = 'Arquivo não ficou público no Drive (erro 404 ao baixar)'
      return null
    }
  }
  try { onProgress?.(100) } catch { }
  clearDriveError()
  return finalUrl
}

// Converte qualquer URL de arquivo do Google Drive para o endpoint de
// thumbnail anonimo (lh3.googleusercontent.com). As URLs antigas
// (drive.google.com/uc?export=view e drive.usercontent.google.com/download)
// redirecionam para paginas de confirmacao/virus-scan e quebram a
// renderizacao de avatares/banners (a imagem simplesmente some). O endpoint
// lh3 serve a imagem direto, sem auth — funciona em <img>, CSS e video.
export function toImageUrl(url: string, width = 1600): string {
  if (!url) return url
  if (/^https:\/\/lh3\.googleusercontent\.com\/d\//.test(url)) return url
  if (/^https:\/\/drive\.google\.com\/thumbnail/.test(url)) return url
  const match = /[?&]id=([A-Za-z0-9_\-]{8,})/.exec(url)
  if (match && /drive\.google\.com|usercontent\.google\.com/.test(url)) {
    return `https://lh3.googleusercontent.com/d/${match[1]}=w${width}`
  }
  return url
}

// Upload de um trecho de gravacao de chamada/transmissao direto para a pasta
// pessoal "Minhas Transmissoes" do usuario logado. Cada participante grava a
// propria copia no proprio Drive — nenhum binario passa pelo Friends Space.
export async function uploadTransmissionChunk(blob: Blob, name: string, mimeType: string): Promise<{ url: string | null; fileId: string | null }> {
  const token = loadToken() || (await ensureFreshToken())
  if (!token) {
    if (isLocalDriveBypass()) {
      try { clearDriveError(); return { url: URL.createObjectURL(blob), fileId: 'local' } } catch { return { url: null, fileId: null } }
    }
    lastDriveError = 'Drive nao conectado'
    return { url: null, fileId: null }
  }
  const folderId = await ensureMyTransmissionsFolder()
  if (!folderId) {
    lastDriveError = lastDriveError || 'Nao foi possivel abrir Minhas Transmissoes'
    return { url: null, fileId: null }
  }
  try {
    const metadata = `{ "name": ${JSON.stringify(name)}, "mimeType": ${JSON.stringify(mimeType)}, "parents": ["${folderId}"] }`
    const form = new FormData()
    form.append('metadata', new Blob([metadata], { type: 'application/json' }))
    form.append('file', blob, name)
    const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}` },
      body: form,
    })
    if (!res.ok) {
      lastDriveError = `Falha no upload (${res.status})`
      return { url: null, fileId: null }
    }
    const data = await res.json()
    const fileId: string = data.id
    const shareOk = await sharePublicly(fileId)
    const isStream = /^(video|audio)\//.test(mimeType)
    clearDriveError()
    return {
      url: shareOk
        ? isStream
          ? `https://drive.usercontent.google.com/download?id=${fileId}&export=view`
          : `https://drive.google.com/uc?export=view&id=${fileId}`
        : null,
      fileId,
    }
  } catch {
    lastDriveError = lastDriveError || 'Falha no upload da gravacao'
    return { url: null, fileId: null }
  }
}

// Marca um arquivo do Drive como "qualquer pessoa com o link pode ver". Faz uma
// tentativa com o token atual e, se falhar, renova o token e tenta de novo.
async function sharePublicly(fileId: string): Promise<boolean> {
  const attempt = async (accessToken: string) => {
    try {
      await apiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      })
      return true
    } catch {
      return false
    }
  }
  const current = loadToken()
  if (current && await attempt(current.access_token)) return true
  const fresh = await ensureFreshToken()
  if (!fresh) return false
  if (fresh.access_token === current?.access_token) return false
  return attempt(fresh.access_token)
}

// Converte uma dataURL (avatar/banner do perfil) em arquivo no Drive do usuario
// e devolve a URL publica anonima. Se o Drive nao estiver conectado (token
// expirado — os tokens do Google duram ~1h), tenta reconectar uma vez antes de
// desistir. Em ultimo caso mantem a dataURL original (fallback).
export async function uploadProfileImage(dataUrl: string, kind: 'avatar' | 'banner', name?: string): Promise<string> {
  if (!/^data:image\//.test(dataUrl)) return dataUrl
  // Localhost: nao usa Drive, so comprime local pra testar rapido.
  if (isLocalDriveBypass()) {
    try { return await compressDataUrl(dataUrl, kind === 'avatar' ? 256 : 640) } catch { return dataUrl }
  }
  const extension = dataUrl.split(';')[0].split('/')[1] || 'png'
  const fileName = name || `${kind}-${Date.now()}.${extension}`
  try {
    if (!isDriveConnected()) {
      const reconnected = await connectDrive()
      if (!reconnected) {
        lastDriveError = lastDriveError || 'Conecte sua conta do Google Drive'
        return compressDataUrl(dataUrl, kind === 'avatar' ? 256 : 640)
      }
    }
    const flattened = await flattenImageAlpha(dataUrl)
    const blob = flattened
      ? await (await fetch(flattened)).blob()
      : await (await fetch(dataUrl)).blob()
    const url = await uploadToDrive(blob, fileName, blob.type, 'perfil')
    return url || compressDataUrl(dataUrl, kind === 'avatar' ? 256 : 640)
  } catch {
    lastDriveError = lastDriveError || 'Falha ao enviar para o Drive'
    return compressDataUrl(dataUrl, kind === 'avatar' ? 256 : 640)
  }
}

// Redimensiona e comprime uma dataURL de imagem para caber em um fallback
// persistido (Drive fora do ar / falha de permissao). GIFs animados sao
// preservados como estao. Garante que a imagem embutida fique pequena o
// bastante para nao estourar o limite do backend nem pesar no banco.
export function compressDataUrl(dataUrl: string, maxDim: number, quality = 0.78): Promise<string> {
  if (dataUrl.startsWith('data:image/gif')) return Promise.resolve(dataUrl)
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUrl); return }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// Remove o canal alfa de uma dataURL de imagem estatica (PNG com transparencia),
// preenchendo o fundo com cor solida — evita foto de perfil/banner "transparente"
// sobre o tema escuro. GIFs animados sao preservados (nao da para aplainar).
function flattenImageAlpha(dataUrl: string): Promise<string | null> {
  if (dataUrl.startsWith('data:image/gif')) return Promise.resolve(null)
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}
