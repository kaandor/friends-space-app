import { createElement, useState } from 'react'
import twemoji from '@twemoji/api'
import emojiRegex from 'emoji-regex'
import type { ReactNode } from 'react'

// Twemoji (estilo X/Twitter): mesmo desenho em Windows, Linux, Android e iOS.
// Imagens via CDN jsdelivr; se falhar, o alt mostra o unicode original.
const TW_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72'

export function twemojiUrl(char: string): string {
  try {
    // O seletor de variação (U+FE0F) não faz parte do nome do arquivo no CDN:
    // "❤\uFE0F" (2764+FE0F) tem que virar 2764.png, senão dá 404 e o ícone quebra.
    const base = char.replace(/[\uFE0E\uFE0F]/g, '')
    return `${TW_BASE}/${twemoji.convert.toCodePoint(base)}.png`
  } catch {
    return ''
  }
}

export function Tw({ char, size = 20 }: { char: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const url = twemojiUrl(char)
  // Se o CDN falhar/offline, renderiza o unicode nativo — nunca fica em branco.
  if (!url || failed) {
    return createElement('span', {
      style: { fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size },
    }, char)
  }
  return createElement('img', {
    src: url,
    alt: char,
    draggable: false,
    className: 'fs-twemoji',
    style: { width: size, height: size },
    onError: () => setFailed(true),
  })
}

export type TwPart = { t: 'text'; v: string } | { t: 'emoji'; v: string }

export function splitTwemoji(text: string): TwPart[] {
  if (!text) return []
  const re = emojiRegex() as RegExp
  const parts: TwPart[] = []
  let last = 0
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) })
    parts.push({ t: 'emoji', v: m[0] })
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) })
  return parts
}

// Converte string em nós React com Twemoji; preserva nós não-string.
export function withTwemoji(node: ReactNode, size = 20, keyPrefix = 'tw'): ReactNode {
  if (typeof node !== 'string') return node
  const parts = splitTwemoji(node)
  if (!parts.some((p) => p.t === 'emoji')) return node
  return parts.map((p, i) =>
    p.t === 'text' ? p.v : <Tw key={`${keyPrefix}-${i}`} char={p.v} size={size} />,
  )
}
