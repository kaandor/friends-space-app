import { useUserStore } from '../stores/userStore'
import { getDb } from '../db'
import { getActiveProfileId } from './profile'

// Mensagem de Status automatica no app desktop (estilo Discord): detecta o
// programa/jogo em foco no PC e atualiza a atividade + a mensagem de status do
// usuario ("Jogando Minecraft", "No Spotify", ...). So roda no Electron.

interface ElectronApi {
  isElectron?: boolean
  getActiveApp?: () => Promise<{ name: string; title?: string } | null>
}

interface ActiveApp {
  name: string
  title?: string
}

const POLL_INTERVAL_MS = 15000
const KNOWN_APPS: Record<string, string> = {
  minecraft: 'Minecraft',
  java: 'Minecraft',
  'javaw.exe': 'Minecraft',
  minecraftbedrock: 'Minecraft',
  roblox: 'Roblox',
  robloxplayerbeta: 'Roblox',
  fortnite: 'Fortnite',
  'fortniteclient-win64-shipping': 'Fortnite',
  'cod': 'Call of Duty',
  'valorant': 'Valorant',
  'valorant-win64-shipping': 'Valorant',
  league: 'League of Legends',
  'leagueoflegends.exe': 'League of Legends',
  'valorant.exe': 'Valorant',
  csgo: 'Counter-Strike 2',
  'cs2': 'Counter-Strike 2',
  gtav: 'GTA V',
  gta5: 'GTA V',
  grandtheftautov: 'GTA V',
  'eldenring': 'Elden Ring',
  'starfield': 'Starfield',
  'cyberpunk2077': 'Cyberpunk 2077',
  gimp: 'GIMP',
  inkscape: 'Inkscape',
  vscode: 'VS Code',
  code: 'VS Code',
  'spotify': 'Spotify',
  'spotify.exe': 'Spotify',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  iexplore: 'Internet Explorer',
  opera: 'Opera',
  brave: 'Brave',
  netflix: 'Netflix',
  youtube: 'YouTube',
  photoshop: 'Photoshop',
  premiere: 'Premiere',
  afterfx: 'After Effects',
  illustrator: 'Illustrator',
  blender: 'Blender',
  unity: 'Unity',
  unreal: 'Unreal Engine',
  godot: 'Godot',
  obs64: 'OBS Studio',
  obs: 'OBS Studio',
  steam: 'Steam',
  epicgameslauncher: 'Epic Games',
  'epicgames': 'Epic Games',
  'origin': 'Origin',
  'galaxyclient': 'GOG Galaxy',
  'dota2': 'Dota 2',
  'dota': 'Dota 2',
  'fallguys': 'Fall Guys',
  'rocketleague': 'Rocket League',
  'r6': 'Rainbow Six Siege',
  'rainbowsix': 'Rainbow Six Siege',
  'pubg': 'PUBG',
  'amongus': 'Among Us',
  'tetr.io': 'Tetr.io',
  'osu!': 'osu!',
  'osu': 'osu!',
  excel: 'Excel',
  winword: 'Word',
  powerpnt: 'PowerPoint',
  onenote: 'OneNote',
  teams: 'Teams',
  outlook: 'Outlook',
  notion: 'Notion',
  figma: 'Figma',
  'slack': 'Slack',
}

function friendlyName(app: ActiveApp): { name: string; detail: string } {
  const raw = (app.name || '').toLowerCase()
  const known = KNOWN_APPS[raw] || KNOWN_APPS[app.name]
  const name = known || app.name || 'Um aplicativo'
  const title = (app.title || '').trim()
  let detail = ''
  if (title && !title.toLowerCase().includes(name.toLowerCase()) && title.length < 60) {
    detail = title
  }
  return { name, detail }
}

let lastApp: string | null = null
let running = false

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function logUsage(app: string, seconds: number) {
  try {
    const db = getDb(getActiveProfileId())
    const day = dayKey()
    const cutoff = dayKey(new Date(Date.now() - 7 * 86400 * 1000))
    await db.appUsage.where('day').below(cutoff).delete()
    const existing = await db.appUsage.where('[app+day]').equals([app, day]).first()
    if (existing?.id) await db.appUsage.update(existing.id, { seconds: (existing.seconds || 0) + seconds })
    else await db.appUsage.add({ app, day, seconds })
  } catch { }
}

export async function getTopApps(limit = 5): Promise<Array<{ app: string; seconds: number }>> {
  try {
    const db = getDb(getActiveProfileId())
    const cutoff = dayKey(new Date(Date.now() - 7 * 86400 * 1000))
    const rows = await db.appUsage.where('day').aboveOrEqual(cutoff).toArray()
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.app, (map.get(r.app) || 0) + (r.seconds || 0))
    return [...map.entries()].map(([app, seconds]) => ({ app, seconds })).sort((a, b) => b.seconds - a.seconds).slice(0, Math.max(1, limit))
  } catch { return [] }
}

export function formatUsage(seconds: number): string {
  const h = seconds / 3600
  if (h >= 10) return `${Math.round(h)}h`
  if (h >= 1) return `${h.toFixed(1).replace('.', ',').replace(',0', '')}h`
  const m = Math.round(seconds / 60)
  return `${Math.max(1, m)}min`
}

function getApi(): ElectronApi | null {
  const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI
  return api?.isElectron && typeof api.getActiveApp === 'function' ? api : null
}

async function pollOnce() {  const api = getApi()
  if (!api) return false
  const me = useUserStore.getState().currentUser
  if (!me) return true
  const settings = (me.settings || {}) as Record<string, unknown>
  if (settings.autoStatus === false) return true
  const app = await api.getActiveApp!()
  if (!app || !app.name) {
    if (lastApp !== null) {
      lastApp = null
      const prev = useUserStore.getState().currentUser
      if (prev && (prev.activityName || (prev.settings && (prev.settings as Record<string, unknown>).statusMessage))) {
        const nextSettings = { ...(prev.settings || {}), statusMessage: '' }
        void useUserStore.getState().updateUser({ activityName: '', activityDetails: '', activityStartedAt: 0, settings: nextSettings })
      }
    }
    return true
  }
  const { name, detail } = friendlyName(app)
  void logUsage(name, POLL_INTERVAL_MS / 1000)
  const key = `${name}|${detail}`
  if (key === lastApp) return true
  lastApp = key
  const statusMessage = `Jogando ${name}${detail ? ` — ${detail}` : ''}`
  const prev = useUserStore.getState().currentUser
  if (!prev) return true
  const nextSettings = { ...(prev.settings || {}), statusMessage }
  void useUserStore.getState().updateUser({
    activityName: name,
    activityDetails: detail,
    activityStartedAt: Date.now(),
    settings: nextSettings,
  })
  return true
}

export function startAutoActivity() {
  if (running) return
  const api = getApi()
  if (!api) return
  running = true
  void pollOnce()
  const timer = window.setInterval(() => { void pollOnce() }, POLL_INTERVAL_MS)
  const stop = () => window.clearInterval(timer)
  window.addEventListener('beforeunload', stop)
}
