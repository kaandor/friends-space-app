// Deteccao de midia em links: fotos, videos e gifs.
// Usado para renderizar como midia embutida no chat quando alguem manda um link.

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?.*)?$/i
const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i
const GIF_EXT = /\.gif(\?.*)?$/i

export type MediaKind = 'image' | 'video' | 'gif' | 'sticker' | 'audio' | 'none'

export interface EmbedInfo {
  type: 'youtube' | 'youtube-shorts' | 'tiktok' | 'vimeo' | 'twitch' | 'spotify' | 'soundcloud' | 'x' | 'generic'
  url: string
  source: string
  title?: string
}

const YT_VIDEO_ID = /(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,20})/
const YT_SHORTS = /youtube\.com\/shorts\/([\w-]{6,20})/
const TIKTOK_URL = /(?:tiktok\.com\/)(@?[\w.-]+)\/video\/(\d+)/i
const VIMEO_URL = /vimeo\.com\/(\d+)/
const TWITCH_URL = /(?:twitch\.tv\/)([\w-]+)/
const SPOTIFY_TRACK = /open\.spotify\.com\/track\/([\w-]+)/
const SPOTIFY_ALBUM = /open\.spotify\.com\/album\/([\w-]+)/
const SPOTIFY_PLAYLIST = /open\.spotify\.com\/playlist\/([\w-]+)/
const SOUNDCLOUD_URL = /soundcloud\.com\/([\w.-]+\/[\w.-]+)/
const X_URL = /(?:x\.com|twitter\.com)\/([\w_]+)\/status\/(\d+)/i

export function extractEmbedUrl(text: string): EmbedInfo | null {
  const tokens = text.trim().split(/\s+/)
  for (const token of tokens) {
    const clean = token.replace(/[),.!?;]+$/, '')
    if (!/^https?:\/\//i.test(clean)) continue

    const ytShorts = clean.match(YT_SHORTS)
    if (ytShorts) return { type: 'youtube-shorts', url: `https://www.youtube.com/embed/${ytShorts[1]}?autoplay=0`, source: clean }

    const yt = clean.match(YT_VIDEO_ID)
    if (yt) return { type: 'youtube', url: `https://www.youtube.com/embed/${yt[1]}?autoplay=0`, source: clean }

    const tiktok = clean.match(TIKTOK_URL)
    if (tiktok) return { type: 'tiktok', url: `https://www.tiktok.com/embed/v2/${tiktok[2]}`, source: clean }

    const vimeo = clean.match(VIMEO_URL)
    if (vimeo) return { type: 'vimeo', url: `https://player.vimeo.com/video/${vimeo[1]}`, source: clean }

    const twitch = clean.match(TWITCH_URL)
    if (twitch) return { type: 'twitch', url: `https://player.twitch.tv/?channel=${twitch[1]}&parent=${typeof window !== 'undefined' ? window.location.hostname : 'friends-space.pages.dev'}`, source: clean }

    const spotifyTrack = clean.match(SPOTIFY_TRACK)
    if (spotifyTrack) return { type: 'spotify', url: `https://open.spotify.com/embed/track/${spotifyTrack[1]}`, source: clean }

    const spotifyAlbum = clean.match(SPOTIFY_ALBUM)
    if (spotifyAlbum) return { type: 'spotify', url: `https://open.spotify.com/embed/album/${spotifyAlbum[1]}`, source: clean }

    const spotifyPlaylist = clean.match(SPOTIFY_PLAYLIST)
    if (spotifyPlaylist) return { type: 'spotify', url: `https://open.spotify.com/embed/playlist/${spotifyPlaylist[1]}`, source: clean }

    const soundcloud = clean.match(SOUNDCLOUD_URL)
    if (soundcloud) return { type: 'soundcloud', url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}`, source: clean }

    const x = clean.match(X_URL)
    if (x) return { type: 'x', url: `https://platform.twitter.com/embed/Tweet.html?id=${x[2]}`, source: clean }
  }
  return null
}

export function detectMediaKind(url: string): MediaKind {
  const clean = url.split('#')[0]
  if (IMAGE_EXT.test(clean)) return GIF_EXT.test(clean) ? 'gif' : 'image'
  if (VIDEO_EXT.test(clean)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|flac|opus)(\?.*)?$/i.test(clean)) return 'audio'
  return 'none'
}

export function isLikelyMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && detectMediaKind(url) !== 'none'
}

// Extrai o primeiro link de midia (imagem/video/gif/audio) do texto, se houver.
export function extractMediaUrl(text: string): string | null {
  const tokens = text.trim().split(/\s+/)
  for (const token of tokens) {
    if (isLikelyMediaUrl(token)) return token
  }
  return null
}

// Monta nome de arquivo segura para o Drive.
export function buildFileName(kind: 'fotos' | 'videos' | 'gifs', original?: string): string {
  const ext = original?.split('.').pop()?.toLowerCase() || (kind === 'videos' ? 'mp4' : 'png')
  const stamp = Date.now()
  return `fs-${kind}-${stamp}.${ext}`
}

// Subpasta do Drive conforme o tipo de midia.
export function driveFolderFor(kind: MediaKind): 'fotos' | 'videos' | 'gifs' {
  if (kind === 'video') return 'videos'
  if (kind === 'gif') return 'gifs'
  return 'fotos'
}
