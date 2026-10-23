const SOUNDBOARD_VOLUME_KEY = 'friends-space:soundboard-volume'
export const DEFAULT_SOUNDBOARD_VOLUME = 100

export function clampSoundboardVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUNDBOARD_VOLUME
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function getSoundboardVolume(): number {
  try {
    const stored = localStorage.getItem(SOUNDBOARD_VOLUME_KEY)
    if (stored === null) return DEFAULT_SOUNDBOARD_VOLUME
    return clampSoundboardVolume(Number(stored))
  } catch {
    return DEFAULT_SOUNDBOARD_VOLUME
  }
}

export function setSoundboardVolume(value: number): number {
  const next = clampSoundboardVolume(value)
  try {
    localStorage.setItem(SOUNDBOARD_VOLUME_KEY, String(next))
  } catch { }
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('friends-space:soundboard-volume', { detail: next }))
    } catch { }
  }
  return next
}

export function soundboardVolumeFraction(): number {
  return getSoundboardVolume() / 100
}
