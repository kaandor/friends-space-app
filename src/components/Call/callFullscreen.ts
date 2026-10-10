import { useCallback, useEffect, useState } from 'react'

interface ElectronBridge {
  isElectron?: boolean
  windowControl?: (action: string) => void
}

function bridge(): ElectronBridge | null {
  try {
    const api = (window as unknown as { electronAPI?: ElectronBridge }).electronAPI
    return api && api.isElectron ? api : null
  } catch {
    return null
  }
}

export function isElectronDevice(): boolean {
  return bridge() !== null
}

export function enterElectronFs(key: string): boolean {
  const api = bridge()
  if (!api) return false
  try {
    api.windowControl?.('fullscreen')
  } catch { }
  try {
    document.body.dataset.fsWindow = '1'
    document.querySelectorAll('.fs-electron-fs').forEach((el) => el.classList.remove('fs-electron-fs'))
    const el = document.getElementById(`call-fs-${key}`) || document.getElementById('call-fs-vc-screen')
    if (el) el.classList.add('fs-electron-fs')
  } catch { }
  return true
}

export function exitElectronFs(): void {
  const api = bridge()
  try {
    api?.windowControl?.('windowed')
  } catch { }
  try {
    delete document.body.dataset.fsWindow
    document.querySelectorAll('.fs-electron-fs').forEach((el) => el.classList.remove('fs-electron-fs'))
  } catch { }
}

export function isElectronFs(): boolean {
  try {
    return document.body.dataset.fsWindow === '1'
  } catch {
    return false
  }
}

export type CallFullscreenMode = 'normal' | 'remote'

// Logica de tela cheia compartilhada (antes duplicada em CallView e
// VoiceChannelView): estado, toggle por chave de elemento, listener de
// fullscreenchange e saida via ESC no Electron.
function toast(msg: string) {
  try {
    window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: msg }))
  } catch { }
}

function findFsElement(key: string): HTMLElement | null {
  try {
    return document.getElementById(`call-fs-${key}`)
  } catch {
    return null
  }
}

// Fullscreen de UM tile específico pelo id do DOM (ex.: tile do mosaico).
// Usado pelo menu de botão direito: a tela DAQUELA pessoa ocupa a tela toda,
// não o mosaico inteiro. Funciona por id, então escala para N pessoas.
// Retorna true se conseguiu abrir (o chamador guarda o estado p/ minimizar).
export function fullscreenTileById(domId: string): boolean {
  try {
    const el = document.getElementById(domId)
    if (!el) {
      toast('Não foi possível abrir a tela cheia')
      return false
    }
    if (document.fullscreenElement && document.fullscreenElement !== el) {
      try { void document.exitFullscreen().catch(() => { }) } catch { }
    }
    if (isElectronDevice()) {
      if (isElectronFs()) exitElectronFs()
      document.body.dataset.fsWindow = '1'
      document.querySelectorAll('.fs-electron-fs').forEach((n) => n.classList.remove('fs-electron-fs'))
      el.classList.add('fs-electron-fs')
      try {
        const api = (window as unknown as { electronAPI?: { windowControl?: (a: string) => void } }).electronAPI
        api?.windowControl?.('fullscreen')
      } catch { }
      return true
    }
    if (el.requestFullscreen) {
      el.requestFullscreen().then(
        () => { },
        () => toast('O navegador bloqueou a tela cheia'),
      )
      return true
    }
    toast('Não foi possível abrir a tela cheia')
    return false
  } catch {
    toast('Não foi possível abrir a tela cheia')
    return false
  }
}
export function useCallFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenMode, setFullscreenMode] = useState<CallFullscreenMode>('normal')

  const exitCallFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => { })
    } catch { }
    if (isElectronDevice()) exitElectronFs()
    setIsFullscreen(false)
    setFullscreenMode('normal')
  }, [])

  const toggleCallFullscreen = useCallback(async (key: string, mode: CallFullscreenMode = 'normal') => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
        setFullscreenMode('normal')
        return
      }
      if (isElectronDevice()) {
        if (isElectronFs()) {
          exitElectronFs()
          setIsFullscreen(false)
          setFullscreenMode('normal')
          return
        }
        // Chave pode ser de um tile que não existe mais (ex.: menu clicado
        // fora do mosaico): tenta a chave pedida e cai no palco principal.
        const target = findFsElement(key) ? key : 'vc-screen'
        if (enterElectronFs(target)) {
          setIsFullscreen(true)
          setFullscreenMode(mode)
        } else {
          toast('Não foi possível abrir a tela cheia')
        }
        return
      }
      // Navegador: elemento da chave, com fallback para o palco principal.
      // ANTES, chave inexistente falhava em silêncio (catch vazio) e o botão
      // parecia "não funcionar".
      let el = findFsElement(key)
      if (!el) el = findFsElement('vc-screen')
      if (el && el.requestFullscreen) {
        try {
          await el.requestFullscreen()
          setIsFullscreen(true)
          setFullscreenMode(mode)
        } catch {
          toast('O navegador bloqueou a tela cheia')
        }
      } else {
        toast('Não foi possível abrir a tela cheia')
      }
    } catch {
      toast('Não foi possível abrir a tela cheia')
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement
      setIsFullscreen(isNowFullscreen)
      if (!isNowFullscreen) setFullscreenMode('normal')
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isElectronDevice() && (isFullscreen || isElectronFs())) {
        e.preventDefault()
        exitElectronFs()
        setIsFullscreen(false)
        setFullscreenMode('normal')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  return { isFullscreen, fullscreenMode, setFullscreenMode, toggleCallFullscreen, exitCallFullscreen }
}
