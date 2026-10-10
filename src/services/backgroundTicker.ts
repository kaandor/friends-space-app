let worker: Worker | null = null
let fallbackTimer: number | null = null
const listeners = new Set<() => void>()

function fire() {
  for (const cb of listeners) {
    try { cb() } catch { }
  }
}

function ensureWorker() {
  if (worker || typeof Worker === 'undefined') return
  const code = 'setInterval(function(){postMessage("tick")}, 15000)'
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
  try {
    worker = new Worker(url)
    worker.onmessage = () => fire()
  } catch {
    worker = null
  }
  if (worker || fallbackTimer !== null) return
  fallbackTimer = window.setInterval(() => fire(), 15000)
}

export function onBackgroundTick(cb: () => void): () => void {
  ensureWorker()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function stopBackgroundTicker() {
  if (worker) {
    worker.terminate()
    worker = null
  }
  if (fallbackTimer !== null) {
    window.clearInterval(fallbackTimer)
    fallbackTimer = null
  }
  listeners.clear()
}
