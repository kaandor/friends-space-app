// Biblioteca padrao do Friends-space: gifs (SVG animados) e figurinhas.
// Sao data URIs auto-contidos, entao funcionam offline e nao dependem de CDN.

export interface LibraryMediaItem {
  id: string
  name: string
  url: string
  kind: 'gif' | 'sticker'
}

const stickerSvg = (emoji: string, bg: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="52" fill="${bg}"/><text x="120" y="136" font-size="150" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const gifSvg = (emoji: string, bg: string, anim: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="44" fill="${bg}"/><text x="120" y="136" font-size="140" text-anchor="middle" dominant-baseline="central">${emoji}${anim}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const bounce = '<animateTransform attributeName="transform" type="translate" values="0 0; 0 -22; 0 0" keyTimes="0;0.5;1" dur="0.9s" repeatCount="indefinite"/>'
const float = '<animateTransform attributeName="transform" type="translate" values="0 0; 0 -14; 0 0" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite"/>'
const wiggle = '<animateTransform attributeName="transform" type="rotate" values="0 120 136; 9 120 136; -9 120 136; 0 120 136" dur="0.5s" repeatCount="indefinite"/>'
const spin = '<animateTransform attributeName="transform" type="rotate" values="0 120 136; 360 120 136" dur="2.4s" repeatCount="indefinite"/>'
const shake = '<animateTransform attributeName="transform" type="translate" values="0 0; -12 0; 12 0; -8 0; 8 0; 0 0" dur="0.5s" repeatCount="indefinite"/>'
const pulse = '<animate attributeName="font-size" values="140;160;140" dur="0.7s" repeatCount="indefinite"/>'
const flash = '<animate attributeName="opacity" values="1;0.35;1" dur="0.6s" repeatCount="indefinite"/>'

export const DEFAULT_STICKERS: LibraryMediaItem[] = [
  { id: 'st-happy', name: 'Feliz', url: stickerSvg('😀', '#ffd166'), kind: 'sticker' },
  { id: 'st-party', name: 'Festa', url: stickerSvg('🥳', '#a855f7'), kind: 'sticker' },
  { id: 'st-love', name: 'Amor', url: stickerSvg('❤️', '#ef476f'), kind: 'sticker' },
  { id: 'st-thumbsup', name: 'Curti', url: stickerSvg('👍', '#06d6a0'), kind: 'sticker' },
  { id: 'st-fire', name: 'Fogo', url: stickerSvg('🔥', '#ff7b00'), kind: 'sticker' },
  { id: 'st-hundred', name: 'Cem', url: stickerSvg('💯', '#118ab2'), kind: 'sticker' },
  { id: 'st-laugh', name: 'Risada', url: stickerSvg('😂', '#ffd166'), kind: 'sticker' },
  { id: 'st-handshake', name: 'Acordo', url: stickerSvg('🤝', '#06d6a0'), kind: 'sticker' },
  { id: 'st-purple', name: 'Roxo', url: stickerSvg('💜', '#a855f7'), kind: 'sticker' },
  { id: 'st-star', name: 'Estrela', url: stickerSvg('⭐', '#ffd166'), kind: 'sticker' },
  { id: 'st-rocket', name: 'Foguete', url: stickerSvg('🚀', '#a855f7'), kind: 'sticker' },
  { id: 'st-cake', name: 'Bolo', url: stickerSvg('🎂', '#f72585'), kind: 'sticker' },
  { id: 'st-gift', name: 'Presente', url: stickerSvg('🎁', '#118ab2'), kind: 'sticker' },
  { id: 'st-ok', name: 'Beleza', url: stickerSvg('👌', '#06d6a0'), kind: 'sticker' },
]

export const DEFAULT_GIFS: LibraryMediaItem[] = [
  { id: 'gif-laugh', name: 'Rindo', url: gifSvg('😂', '#ffd166', bounce), kind: 'gif' },
  { id: 'gif-party', name: 'Festa', url: gifSvg('🥳', '#a855f7', wiggle), kind: 'gif' },
  { id: 'gif-fire', name: 'Fogo', url: gifSvg('🔥', '#ff7b00', pulse), kind: 'gif' },
  { id: 'gif-love', name: 'Amor', url: gifSvg('❤️', '#ef476f', pulse), kind: 'gif' },
  { id: 'gif-skull', name: 'Morri', url: gifSvg('💀', '#118ab2', shake), kind: 'gif' },
  { id: 'gif-cry', name: 'Chorando', url: gifSvg('😭', '#ffd166', float), kind: 'gif' },
  { id: 'gif-rocket', name: 'Foguete', url: gifSvg('🚀', '#a855f7', bounce), kind: 'gif' },
  { id: 'gif-confetti', name: 'Confete', url: gifSvg('🎉', '#f72585', wiggle), kind: 'gif' },
  { id: 'gif-happy', name: 'Apaixonado', url: gifSvg('😍', '#ff7096', pulse), kind: 'gif' },
  { id: 'gif-mind', name: 'Explodiu', url: gifSvg('🤯', '#ffd166', shake), kind: 'gif' },
  { id: 'gif-hundred', name: 'Cem', url: gifSvg('💯', '#118ab2', spin), kind: 'gif' },
  { id: 'gif-clap', name: 'Palmas', url: gifSvg('👏', '#06d6a0', bounce), kind: 'gif' },
  { id: 'gif-lovehands', name: 'Coracao', url: gifSvg('🫶', '#f72585', pulse), kind: 'gif' },
  { id: 'gif-mindblown', name: 'Uau', url: gifSvg('🤩', '#a855f7', flash), kind: 'gif' },
]
