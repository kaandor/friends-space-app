import { requestBackend } from './backend'

export interface InstantSound {
  id: string
  name: string
  audioUrl: string
  pageUrl: string
}

const MAX_ACTIVE = 6
const activeAudios = new Set<HTMLAudioElement>()

export function isMyInstantsAudioUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    if (url.hostname !== 'www.myinstants.com' && url.hostname !== 'myinstants.com') return false
    return /^\/media\/sounds\/[^"'<>\\]+\.mp3$/i.test(url.pathname)
  } catch {
    return false
  }
}

function stopAudio(audio: HTMLAudioElement) {
  try {
    audio.pause()
    audio.src = ''
    audio.load()
  } catch { }
  activeAudios.delete(audio)
}

export async function playInstantAudio(url: string): Promise<boolean> {
  if (!isMyInstantsAudioUrl(url)) return false
  try {
    while (activeAudios.size >= MAX_ACTIVE) {
      const oldest = activeAudios.values().next().value
      if (!oldest) break
      stopAudio(oldest)
    }
    const audio = new Audio(url)
    audio.preload = 'auto'
    audio.volume = 0.9
    activeAudios.add(audio)
    const cleanup = () => stopAudio(audio)
    audio.addEventListener('ended', cleanup, { once: true })
    audio.addEventListener('error', cleanup, { once: true })
    await audio.play()
    return true
  } catch {
    return false
  }
}

export async function searchInstantSounds(query: string): Promise<InstantSound[]> {
  const result = await requestBackend<{ sounds?: InstantSound[] }>('searchMyInstants', { query })
  const sounds = Array.isArray(result?.sounds) ? result.sounds : []
  return sounds
    .filter((sound): sound is InstantSound => Boolean(
      sound
      && typeof sound.id === 'string'
      && typeof sound.name === 'string'
      && typeof sound.audioUrl === 'string'
      && isMyInstantsAudioUrl(sound.audioUrl),
    ))
    .map(sound => ({
      id: sound.id.slice(0, 120),
      name: sound.name.slice(0, 90),
      audioUrl: sound.audioUrl,
      pageUrl: /^https:\/\/(www\.)?myinstants\.com\//i.test(sound.pageUrl || '') ? sound.pageUrl : 'https://www.myinstants.com/pt/index/br/',
    }))
}
