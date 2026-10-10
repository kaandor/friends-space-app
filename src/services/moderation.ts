// Moderacao do Friends Space - espelho client-side do motor de regras do backend.
// Bloqueio imediato (sem round-trip) de termos, nomes de arquivos/pastas e contas
// suspensas/em avaliacao. A analise de conteudo por IA (NVIDIA NIM) acontece no
// backend quando a chave gratuita existe; aqui garantimos a primeira barreira.

const AGE_GATE_KEY = 'friends-space:age-gate'
const AGE_GATE_CPF_HASH_KEY = 'friends-space:age-gate-cpf-hash'
const AGE_GATE_VERIFIED_KEY = 'friends-space:age-gate-verified'
const AGE_GATE_VERIFIED_AT_KEY = 'friends-space:age-gate-verified-at'

export interface ModerationState {
  status: 'ok' | 'review' | 'banned'
  reason?: string
  since?: number
  decidedBy?: string
  auto?: boolean
}

export const BLOCKED_WORDS: string[] = [
  // pornografia / sites adultos
  'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'redtube', 'youporn', 'xhamster', 'spankbang', 'tube8',
  'fatal model', 'fatalmodel', 'fatal models', 'fatal fans', 'fatalfans',
  'acompanhante', 'acompanhantes', 'garota de programa', 'garotas de programa',
  'sexo explicito', 'conteudo sexual explicito', 'porno', 'pornografia', 'putaria', 'nudes', 'nude',
  // pedofilia / aliciamento
  'pedofil', 'porno infantil', 'nude infantil', 'abuso infantil', 'aliciamento de menor', 'aliciando menor', 'material ilegal de menores',
  // pirataria
  'filme pirata', 'serie pirata', 'download pirata', 'chave de ativacao', 'keygen', 'crack do',
  // crimes / hacking
  'hackear', 'invadir o sistema', 'ataque ddos', 'sequestro de', 'trafico de',
  // outros sites +18 conhecidos
  'redtube', 'youporn', 'xhamster', 'spankbang', 'tube8', 'xnxx', 'pornhub',
  'sexlog', 'sexlog.com', 'skokka', 'gp', 'gps', 'classificados eroticos',
  'cams', 'camgirl', 'camgirls', 'webcam sex', 'sex cam', 'live sex',
  'erotic', 'erotica', 'adult content', 'adult site', 'xxx', 'porn site',
  'escort', 'escorts', 'call girl', 'call girls', 'massagem erotica',
  'swing', 'menage', 'suruba', 'orgia', 'bukkake', 'gangbang',
  'hentai', 'doujinshi', 'rule34', 'e621', 'gelbooru', 'danbooru',
]

export const ALERT_WORDS: string[] = [
  'se matar', 'vai se matar', 'se mata', 'quero me matar', 'quero morrer', 'suicidio',
  'automutila', 'se cortar', 'corta os pulsos', 'cortar os pulsos', 'se enforcar',
  'tirar a propria vida', 'se mutilar', 'me mutilar', 'como cometer suicidio', 'se machucar de proposito',
]

export const BLOCKED_DOMAINS: string[] = [
  // sites pornograficos principais
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'onlyfans.com', 'redtube.com',
  'youporn.com', 'xhamster.com', 'spankbang.com', 'tube8.com',
  'porn.com', 'porntube.com', 'pornhd.com', 'pornktube.com',
  // fatal model / fatal fans
  'fatalmodel.com', 'fatalmodel.com.br', 'fatalfans.com', 'fatalfans.com.br',
  // acompanhantes / escort
  'skokka.com', 'skokka.com.br', 'gpguia.com', 'gpguia.com.br',
  'classificadoseroticos.com', 'classificadoseroticos.com.br',
  'sexlog.com', 'sexlog.com.br', 'sexlog.net',
  'fatalmoeda.com', 'fatalmoeda.com.br',
  'acompanhantes.com', 'acompanhantes.net', 'acompanhantes.com.br',
  'garotasdeprograma.com', 'garotasdeprograma.com.br',
  'gp', 'gps', 'gp1', 'gp2', 'gp3',
  // encurtadores suspeitos (usados para esconder links +18)
  'bit.ly', 'tinyurl.com', 't.co', 'shorturl.at', 'cutt.ly',
  'rb.gy', 'is.gd', 'v.gd', 'short.io', 'ln.run', 'urlz.fr',
  // telegram / whatsapp / discord (convites para grupos +18)
  'telegram.me', 't.me', 'discord.gg', 'discord.com/invite',
  'whatsapp.com', 'wa.me',
  // cams / webcam
  'chaturbate.com', 'bongacams.com', 'stripchat.com', 'cam4.com',
  'livejasmin.com', 'myfreecams.com', 'streamate.com', 'flirt4free.com',
  'camster.com', 'imlive.com', 'camsoda.com',
  // outros sites adultos
  'redtube.com', 'youporn.com', 'xhamster.com', 'spankbang.com', 'tube8.com',
  'xnxx.com', 'pornhub.com', 'porn.com', 'eporner.com', 'thumbzilla.com',
  'xhamsterlive.com', 'porntrex.com', 'fuq.com', 'hqporner.com',
  'beeg.com', 'tnaflix.com', 'drtuber.com', 'vporn.com', 'pornhd.com',
]

// ===== Filtros extras para menores (13-17 anos) =====
// Usuarios de 13 a 17 anos usam o Friends Space com consentimento dos pais e
// recebem uma camada adicional de censura alem das regras do publico +18.

export const MINOR_WORDS: string[] = [
  // bebidas alcoholicas
  'cerveja', 'cachaca', 'cachaça', 'vodka', 'whisky', 'uísque', 'tequila', 'gin', 'rum',
  'vinho', 'drinque', 'drink', 'alcool', 'álcool', 'bebida alcoolica', 'bebida alcoólica',
  'embriag', 'beber ate', 'ressaca', 'copo de cerveja', 'litrao', 'litrão', 'birita',
  // tabaco / vape
  'cigarro', 'cigarro eletronico', 'cigarro eletrônico', 'vape', 'pod descartavel', 'narguile', 'narguilé',
  'charuto', 'tabaco', 'fumar', 'fumante', 'nicotina',
  // drogas
  'maconha', 'cocaina', 'cocaína', 'crack', 'lolo', 'loló', 'rebite', 'droga', 'entorpecente',
  'ecstasy', 'lsd', 'mdma', 'mda', 'sintetico', 'sintético', 'lança perfume', 'lanca perfume',
  // armas
  'arma de fogo', 'revolver', 'revolver', 'pistola', 'submetralhadora', 'espingarda', 'escopeta',
  'municao', 'munição', 'arma branca', 'facada', 'faca de', 'estilete', 'soco ingles', 'soquete',
  // violencia explicita
  'matar', 'assassinar', 'tortura', 'esquartej', 'decapit', 'esfaquear', 'desmembrar',
  'sangue jorrando', 'morte explicita', 'gore', 'seqüestrar', 'sequestrar',
  // jogos de azar / apostas
  'bet', 'aposta', 'apostas', 'cassino', 'caça-niquel', 'caça-níquel', 'caça niquel',
  'jogo do tigrinho', 'tigrinho', 'blaze', 'pixbet', 'betnacional', 'esportes da sorte', 'sportingbet',
  // linguagem pesada
  'puta', 'vagabunda', 'buceta', 'caralho', 'fdp', 'vtnc', 'desgraca', 'desgraça', 'arrombado',
  'filho da puta', 'filha da puta', 'vai se foder', 'vai a merda', 'merda de', 'porra',
  'sexo', 'transar', 'trepar', 'foder', 'penis', 'pênis', 'vagina', 'masturba', 'orgasmo',
  'pinto', 'piroca', 'bucetinha', 'lingerie', 'nudez', 'sem roupa', 'pelada', 'pelado',
]

export const MINOR_DOMAINS: string[] = [
  // apostas / cassino
  'bet365.com', 'betfair.com', 'stake.com', 'betnacional.com', 'blaze.com', 'pixbet.com',
  'esportesdasorte.com', 'sportingbet.com', 'betano.com', 'novibet.com', 'betmotion.com',
  'lottery.com', 'megasena.com.br', 'loterias.com.br', 'caixa.gov.br', 'roleta', 'cassino',
  'jogodotigrinho.com', 'tigrinho.com', 'fortune tiger', 'fortune-tiger',
  // tabaco / vape
  'vapeshop.com', 'vapelife.com.br', 'vapor.com.br', 'cigarro.com', 'tabacaria.com',
  // alcool (venda/consumo)
  'cervejaria.com', 'ambev.com.br', 'heineken.com.br', 'skol.com.br', 'brahma.com.br',
  'adelia.com.br', 'bebidas.com', 'drinks.com',
]

// Chaves de armazenamento do perfil de idade (gate +18 declarado pelo usuario)
const AGE_GROUP_KEY = 'friends-space:age-group'
const PARENTAL_CONSENT_KEY = 'friends-space:parental-consent'

export type AgeGroup = 'adult' | 'minor' | ''

export function getAgeGroup(): AgeGroup {
  try {
    return (localStorage.getItem(AGE_GROUP_KEY) as AgeGroup) || ''
  } catch {
    return ''
  }
}

export function setAgeGroup(group: AgeGroup) {
  try {
    if (group) localStorage.setItem(AGE_GROUP_KEY, group)
    else localStorage.removeItem(AGE_GROUP_KEY)
  } catch {
  }
}

export function isMinor(): boolean {
  return getAgeGroup() === 'minor'
}

export function getParentalConsent(): boolean {
  try {
    return localStorage.getItem(PARENTAL_CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setParentalConsent(consented: boolean) {
  try {
    if (consented) localStorage.setItem(PARENTAL_CONSENT_KEY, '1')
    else localStorage.removeItem(PARENTAL_CONSENT_KEY)
  } catch {
  }
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
}

export interface ScanResult {
  blocked: boolean
  word: string | null
  alert: boolean
}

export function scanText(value: unknown): ScanResult {
  const text = normalizeText(value)
  const minor = isMinor()
  const word = BLOCKED_WORDS.find(w => text.includes(w))
    || (minor ? MINOR_WORDS.find(w => text.includes(w)) : null) || null
  const alertWord = ALERT_WORDS.find(w => text.includes(w)) || null
  return { blocked: Boolean(word), word, alert: Boolean(alertWord) }
}

export function scanName(value: unknown): { blocked: boolean; word: string | null } {
  const text = normalizeText(value)
  const minor = isMinor()
  const word = BLOCKED_WORDS.find(w => text.includes(w))
    || (minor ? MINOR_WORDS.find(w => text.includes(w)) : null) || null
  return { blocked: Boolean(word), word }
}

export function scanLinks(value: unknown): { blocked: boolean; url: string | null; domain: string | null } {
  const text = String(value || '')
  const minor = isMinor()
  const urlRegex = /https?:\/\/[^\s]+/gi
  const urls = text.match(urlRegex) || []
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '')
      for (const bad of BLOCKED_DOMAINS) {
        if (host === bad || host.endsWith('.' + bad)) {
          return { blocked: true, url: u, domain: bad }
        }
      }
      if (minor) {
        for (const bad of MINOR_DOMAINS) {
          if (host === bad || host.endsWith('.' + bad)) {
            return { blocked: true, url: u, domain: bad }
          }
        }
      }
    } catch { }
  }
  return { blocked: false, url: null, domain: null }
}

export function blockedMessage(word: string | null): string {
  const minor = isMinor()
  return minor
    ? `Conteudo bloqueado para menores de 18 anos (Friends Space 13-17). Motivo: ${word || 'termo bloqueado'}`
    : `Conteudo bloqueado pelo Friends Space por violar as regras da comunidade e a lei brasileira. Motivo: ${word || 'termo bloqueado'}`
}

export function blockedNameMessage(word: string | null): string {
  const minor = isMinor()
  return minor
    ? `Nome bloqueado para menores de 18 anos. Renomeie e tente novamente. Motivo: ${word || 'termo bloqueado'}`
    : `Nome bloqueado pelo Friends Space. Renomeie e tente novamente. Motivo: ${word || 'termo bloqueado'}`
}

export function moderationOf(settings: Record<string, unknown> | undefined | null): ModerationState {
  const mod = settings?.moderation
  if (mod && typeof mod === 'object') return mod as ModerationState
  return { status: 'ok' }
}

// ===== Gate +18 (confirmacao por biometria) =====

async function sha256Hex(input: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

async function randomDeviceId(): Promise<string> {
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return (await sha256Hex('fs18-device:' + id)) || id
}

export interface AgeGateResult {
  ok: boolean
  error?: string
  cpfHash?: string
}

export interface GuardianData {
  cpf: string
  rg: string
}

export interface ChildData {
  cpf: string
  rg: string
}

const GUARDIAN_KEY = 'friends-space:guardian'
const CHILD_KEY = 'friends-space:child'

export function saveGuardianData(data: GuardianData) {
  try {
    localStorage.setItem(GUARDIAN_KEY, JSON.stringify(data))
  } catch {
  }
}

export function getGuardianData(): GuardianData | null {
  try {
    const raw = localStorage.getItem(GUARDIAN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GuardianData
    if (!parsed || !parsed.cpf || !parsed.rg) return null
    return parsed
  } catch {
    return null
  }
}

export function saveChildData(data: ChildData) {
  try {
    localStorage.setItem(CHILD_KEY, JSON.stringify(data))
  } catch {
  }
}

export function getChildData(): ChildData | null {
  try {
    const raw = localStorage.getItem(CHILD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChildData
    if (!parsed || !parsed.cpf || !parsed.rg) return null
    return parsed
  } catch {
    return null
  }
}

export async function acceptAgeGate(): Promise<AgeGateResult> {
  const cpfHash = await randomDeviceId()
  try {
    localStorage.setItem(AGE_GATE_KEY, '1')
    localStorage.setItem(AGE_GATE_CPF_HASH_KEY, cpfHash)
    localStorage.setItem(AGE_GATE_VERIFIED_KEY, '1')
    localStorage.setItem(AGE_GATE_VERIFIED_AT_KEY, String(Date.now()))
  } catch {
  }
  return { ok: true, cpfHash }
}

export function isAgeGatePassed(): boolean {
  try {
    return localStorage.getItem(AGE_GATE_KEY) === '1'
  } catch {
    return false
  }
}

export function getAgeGateDeviceId(): string {
  try {
    return localStorage.getItem(AGE_GATE_CPF_HASH_KEY) || ''
  } catch {
    return ''
  }
}

export function getAgeGateVerifiedAt(): number {
  try {
    return Number(localStorage.getItem(AGE_GATE_VERIFIED_AT_KEY) || 0)
  } catch {
    return 0
  }
}

export function resetAgeGate() {
  try {
    localStorage.removeItem(AGE_GATE_KEY)
    localStorage.removeItem(AGE_GATE_CPF_HASH_KEY)
    localStorage.removeItem(AGE_GATE_VERIFIED_KEY)
    localStorage.removeItem(AGE_GATE_VERIFIED_AT_KEY)
    localStorage.removeItem(AGE_GROUP_KEY)
    localStorage.removeItem(PARENTAL_CONSENT_KEY)
    localStorage.removeItem(GUARDIAN_KEY)
    localStorage.removeItem(CHILD_KEY)
  } catch {
  }
}
