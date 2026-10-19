// Moderacao do Friends Space - espelho client-side do motor de regras do backend.
// Bloqueio imediato (sem round-trip) de termos e nomes de arquivos/pastas.
// A analise de conteudo por IA (NVIDIA NIM) acontece no backend quando a chave
// gratuita existe; aqui garantimos a primeira barreira.

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

// Chave de armazenamento da faixa de idade (gate +18 declarado pelo usuario)
const AGE_GROUP_KEY = 'friends-space:age-group'

export type AgeGroup = 'adult' | 'minor' | ''

export function getAgeGroup(): AgeGroup {
  try {
    return (localStorage.getItem(AGE_GROUP_KEY) as AgeGroup) || ''
  } catch {
    return ''
  }
}

export function isMinor(): boolean {
  return getAgeGroup() === 'minor'
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
