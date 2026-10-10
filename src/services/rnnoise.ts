// ---------------------------------------------------------------------------
// Audio limpo via RNNoise (terceirizado, Jitsi-proven) — recurso ASTRO.
// Cadeia: mic -> AudioWorklet(RNNoise wasm, blocos de 10ms) -> WebRTC.
// Tudo com fallback: qualquer falha retorna null e o chamador mantem o
// audio padrao. Default OFF; so ativa com toggle do usuario (Astro).
// DSP validado headless: vogal VAD 0.82/73% preservada, ruido VAD 0.10/4%.
// ---------------------------------------------------------------------------

const CLEAN_PREF_KEY = 'friends-space:clean-audio'
const READY_TIMEOUT_MS = 6000

// Codigo do processador, anexado ao glue Emscripten num Blob worklet.
// Roda SEM imports: recebe os bytes do wasm via porta e instancia cru.
const PROCESSOR_SRC = `
class FsRnnoise extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.draining = false;
    this.inBuf = new Float32Array(960);
    this.inLen = 0;
    this.outBuf = new Float32Array(1920);
    this.outLen = 0;
    this.M = null;
    this.st = 0;
    this.pin = 0;
    this.port.onmessage = (ev) => {
      const d = (ev && ev.data) || {};
      if (d.type === 'init' && d.wasmBytes) {
        try { this._init(d.wasmBytes); }
        catch (e) { try { this.port.postMessage({ type: 'error' }); } catch (_) {} }
      } else if (d.type === 'dispose') {
        try { this._dispose(); } catch (_) {}
      }
    };
  }
  _init(wasmBytes) {
    // Modelo treinado em 48k (tolerado 44.1k); outra taxa = passthrough.
    if (sampleRate !== 48000 && sampleRate !== 44100) {
      this.port.postMessage({ type: 'error' });
      return;
    }
    const factory = globalThis.__fsRnnoiseFactory;
    if (typeof factory !== 'function') {
      this.port.postMessage({ type: 'error' });
      return;
    }
    Promise.resolve(factory({
      instantiateWasm: (info, receive) => {
        WebAssembly.instantiate(wasmBytes, info).then(
          (r) => receive(r.instance),
          () => { try { this.port.postMessage({ type: 'error' }); } catch (_) {} }
        );
      },
    })).then((M) => {
      this.M = M;
      this.pin = M._malloc(480 * 4);
      if (!this.pin) throw new Error('malloc');
      this.st = M._rnnoise_create();
      if (!this.st) throw new Error('create');
      this.ready = true;
      this.port.postMessage({ type: 'ready' });
    }).catch(() => {
      try { this.port.postMessage({ type: 'error' }); } catch (_) {}
    });
  }
  _dispose() {
    try {
      if (this.M) {
        if (this.st) { try { this.M._rnnoise_destroy(this.st); } catch (_) {} }
        if (this.pin) { try { this.M._free(this.pin); } catch (_) {} }
      }
    } catch (_) {}
    this.ready = false;
    this.M = null;
    this.st = 0;
  }
  process(inputs, outputs) {
    const inp = inputs && inputs[0] && inputs[0][0];
    const out = outputs && outputs[0] && outputs[0][0];
    if (!out) return true;
    if (!inp || !this.ready || !this.M || !this.st) {
      // Passthrough seguro: sem DSP, audio original intacto.
      if (inp) out.set(inp.subarray(0, Math.min(inp.length, out.length)));
      else out.fill(0);
      return true;
    }
    const M = this.M;
    const H = () => M.HEAPF32;
    // Acumula.
    const room = this.inBuf.length - this.inLen;
    const n = Math.min(inp.length, room);
    this.inBuf.set(inp.subarray(0, n), this.inLen);
    this.inLen += n;
    // Denoisa frames completos (in-place, como o Jitsi faz).
    while (this.inLen >= 480) {
      const heapIdx = this.pin >> 2;
      const H32 = H();
      for (let i = 0; i < 480; i++) H32[heapIdx + i] = this.inBuf[i] * 32768;
      try { M._rnnoise_process_frame(this.st, this.pin, this.pin); }
      catch (_) { break; }
      const H32b = H();
      const oRoom = this.outBuf.length - this.outLen;
      if (oRoom >= 480) {
        const base = this.outLen;
        for (let i = 0; i < 480; i++) this.outBuf[base + i] = H32b[heapIdx + i] / 32768;
        this.outLen += 480;
      }
      this.inBuf.copyWithin(0, 480, this.inLen);
      this.inLen -= 480;
    }
    // Drena 128 amostras (compacta sempre: staging nunca lota). A drenagem
    // so comeca com reserva de 608 amostras: producao (blocos de 480) e
    // consumo (128/quanta) tem fase 3.75 e sem reserva ha gaps periodicos.
    // Depois de iniciada, a reserva (~4.75 quanta) absorve a fase para
    // sempre. Latencia total ~21ms, inaudivel.
    const want = out.length;
    if (!this.draining && this.outLen >= 608) this.draining = true;
    if (this.draining && this.outLen >= want) {
      out.set(this.outBuf.subarray(0, want));
      this.outBuf.copyWithin(0, want, this.outLen);
      this.outLen -= want;
    } else {
      out.fill(0);
    }
    return true;
  }
}
registerProcessor('fs-rnnoise', FsRnnoise);
`

export interface CleanAudioHandle {
  stream: MediaStream
  // Stream original (mic cru) que alimenta o grafo. Mantida viva enquanto o
  // filtro roda; usada para restaurar o audio ao desligar no meio da call.
  source: MediaStream
  dispose: (keepSource?: boolean) => void
}

let glueTextCache: string | null = null
let wasmBytesCache: ArrayBuffer | null = null
let activeHandle: CleanAudioHandle | null = null

function assetAbs(path: string): string {
  try {
    return new URL(path, document.baseURI).toString()
  } catch {
    return '/' + path.replace(/^\//, '')
  }
}

export function isCleanAudioSupported(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (typeof AudioWorkletNode === 'undefined') return false
    if (typeof WebAssembly !== 'object') return false
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    return true
  } catch {
    return false
  }
}

export function isCleanAudioEnabledPref(): boolean {
  try {
    return localStorage.getItem(CLEAN_PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function setCleanAudioEnabledPref(on: boolean): void {
  try {
    localStorage.setItem(CLEAN_PREF_KEY, on ? '1' : '0')
  } catch { }
}

export function isCleanAudioActive(): boolean {
  return activeHandle !== null
}

export function getCleanAudioSource(): MediaStream | null {
  try {
    return activeHandle?.source || null
  } catch {
    return null
  }
}

export function disposeCleanAudio(keepSource = false): void {
  const h = activeHandle
  activeHandle = null
  if (!h) return
  try {
    h.dispose(keepSource)
  } catch { }
}

async function loadAssets(): Promise<{ glue: string; wasm: ArrayBuffer } | null> {
  try {
    if (!glueTextCache || !wasmBytesCache) {
      // No EXE empacotado, fetch(file://) é bloqueado: pede os bytes ao main
      // via IPC (lê do asar). Na web, fetch normal.
      let viaIpc: { glue: string; wasm: ArrayBuffer } | null = null
      try {
        const api = (window as unknown as { electronAPI?: { isElectron?: boolean; loadRnnoiseAssets?: () => Promise<{ glue?: unknown; wasmBase64?: unknown } | null> } }).electronAPI
        if (api?.isElectron && typeof api.loadRnnoiseAssets === 'function') {
          const res = await api.loadRnnoiseAssets()
          const glue = typeof res?.glue === 'string' ? res.glue : ''
          const b64 = typeof res?.wasmBase64 === 'string' ? res.wasmBase64 : ''
          if (glue && b64) {
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            viaIpc = { glue, wasm: bytes.buffer }
          }
        }
      } catch { /* cai no fetch abaixo */ }
      if (viaIpc) {
        glueTextCache = viaIpc.glue
        wasmBytesCache = viaIpc.wasm
      } else {
        const [glueRes, wasmRes] = await Promise.all([
          fetch(assetAbs('rnnoise/rnnoise.js'), { cache: 'force-cache' }),
          fetch(assetAbs('rnnoise/rnnoise.wasm'), { cache: 'force-cache' }),
        ])
        if (!glueRes.ok || !wasmRes.ok) return null
        glueTextCache = await glueRes.text()
        wasmBytesCache = await wasmRes.arrayBuffer()
      }
    }
    return { glue: glueTextCache, wasm: wasmBytesCache.slice(0) }
  } catch {
    return null
  }
}

function waitReady(node: AudioWorkletNode): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const timer = window.setTimeout(() => {
      if (!done) { done = true; resolve(false) }
    }, READY_TIMEOUT_MS)
    node.port.onmessage = (ev) => {
      const t = (ev?.data as { type?: string } | undefined)?.type
      if ((t === 'ready' || t === 'error') && !done) {
        done = true
        window.clearTimeout(timer)
        resolve(t === 'ready')
      }
    }
  })
}

// Envolve a stream: audio passa pelo RNNoise, video segue intacto.
// Retorna null em qualquer falha (chamador mantem o original).
export async function enableCleanAudio(source: MediaStream): Promise<CleanAudioHandle | null> {
  disposeCleanAudio()
  try {
    if (!isCleanAudioSupported()) return null
    const audioTrack = source.getAudioTracks()[0]
    if (!audioTrack) return null
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    try {
      if (ctx.sampleRate !== 48000 && ctx.sampleRate !== 44100) {
        void ctx.close().catch(() => { })
        return null
      }
      const assets = await loadAssets()
      if (!assets) {
        void ctx.close().catch(() => { })
        return null
      }
      // Glue ESM -> classico: troca o export por global (worklet nao aceita ESM).
      const stripped = assets.glue.replace(/^export default\s+(\w+);?\s*$/m, 'globalThis.__fsRnnoiseFactory=$1;')
      if (stripped === assets.glue) {
        void ctx.close().catch(() => { })
        return null
      }
      const blob = new Blob([stripped, PROCESSOR_SRC], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      try {
        await ctx.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      const node = new AudioWorkletNode(ctx, 'fs-rnnoise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      const readyP = waitReady(node)
      node.port.postMessage({ type: 'init', wasmBytes: assets.wasm }, [assets.wasm])
      const ready = await readyP
      if (!ready) {
        try { node.disconnect() } catch { }
        void ctx.close().catch(() => { })
        return null
      }
      const srcNode = ctx.createMediaStreamSource(source)
      const dest = ctx.createMediaStreamDestination()
      srcNode.connect(node)
      node.connect(dest)
      const cleanTrack = dest.stream.getAudioTracks()[0]
      if (!cleanTrack) {
        try { node.disconnect() } catch { }
        try { srcNode.disconnect() } catch { }
        void ctx.close().catch(() => { })
        return null
      }
      const combined = new MediaStream([cleanTrack, ...source.getVideoTracks()])
      const handle: CleanAudioHandle = {
        stream: combined,
        source,
        dispose: (keepSource = false) => {
          try { node.port.postMessage({ type: 'dispose' }) } catch { }
          try { node.disconnect() } catch { }
          try { srcNode.disconnect() } catch { }
          try { cleanTrack.stop() } catch { }
          // A fonte (mic cru) so e parada quando ninguem mais precisa dela
          // (fim da call / troca de mic). Ao desligar o filtro no meio da
          // call ela continua viva para reassumir.
          if (!keepSource) {
            try { source.getAudioTracks().forEach(t => { try { t.stop() } catch { } }) } catch { }
          }
          void ctx.close().catch(() => { })
        },
      }
      activeHandle = handle
      return handle
    } catch {
      void ctx.close().catch(() => { })
      return null
    }
  } catch {
    return null
  }
}
