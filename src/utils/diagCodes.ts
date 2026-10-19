import { requestBackend } from '../services/backend'

// Catalogo de codigos de diagnostico — Fase 3 "um print basta".
// Todo erro visivel carrega um codigo no proprio texto do toast, entao
// qualquer print ja contem a causa. Compativel com o listener atual
// (detail continua string).
export const DIAG_CODES = {
  'SIG-MLINE-01': 'Oferta incompativel entre versoes \u2014 pe\u00e7a Ctrl+F5 e entrar de novo',
  'SIG-SCTP-02': 'Canal de dados travado \u2014 recriando conex\u00e3o',
  'ICE-TIMEOUT-03': 'Conex\u00e3o demorou \u2014 tentando rota alternativa (TURN)',
  'TURN-NOROUTE-04': 'Sem rota de rede \u2014 teste outra rede/Wi-Fi',
  'FEED-EMPTY-05': 'Sem posts ainda \u2014 explore servidores',
  'JOIN-DENIED-06': 'Entrada negada nesta call/servidor',
  'MEDIA-PLAY-07': 'Toque na tela para liberar o \u00e1udio',
  'SIGNAL-BACKEND-08': 'Servidor de sinal inst\u00e1vel \u2014 tentando de novo',
  'APP-UPDATE-09': 'Nova vers\u00e3o dispon\u00edvel \u2014 atualize o app',
  'SHARE-FAILED-10': 'Falha ao compartilhar \u2014 pare e compartilhe de novo',
} as const

export type DiagCode = keyof typeof DIAG_CODES

export interface DiagEntry {
  code: DiagCode
  where: string
  ts: number
}

const recent: DiagEntry[] = []

export function lastDiagCodes(): DiagEntry[] {
  return [...recent].reverse()
}

// Emite toast com codigo + auto-reporta ao painel Admin (nao bloqueia).
export function diag(code: DiagCode, detail?: string, where = 'client') {
  const text = detail ? `${detail} (${code})` : `${DIAG_CODES[code]} (${code})`
  recent.push({ code, where, ts: Date.now() })
  if (recent.length > 20) recent.shift()
  try {
    window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: text }))
  } catch { }
  try {
    void requestBackend('reportClientError', { where, code, message: text.slice(0, 500) }).catch(() => { })
  } catch { }
}
