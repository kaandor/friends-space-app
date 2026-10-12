import type { ReactNode } from 'react'
import type { ServerEmoji } from '../types'
import { useServerStore } from '../stores/serverStore'
import { withTwemoji } from '../utils/twemoji'

const NAME_RE = /^[a-z0-9_]{1,32}$/
const TOKEN_RE = /:([a-z0-9_]{1,32}):/g

export function sanitizeEmojiName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
}

export function isValidEmojiName(name: string): boolean {
  return NAME_RE.test(name)
}

export function collectAllServerEmojis(): ServerEmoji[] {
  const seen = new Map<string, ServerEmoji>()
  for (const server of useServerStore.getState().servers) {
    for (const emoji of server.emojis || []) {
      const key = emoji.name ? `${emoji.kind || 'emoji'}:${emoji.name}` : emoji.id
      if (!seen.has(key)) seen.set(key, emoji)
    }
  }
  return [...seen.values()]
}

export function renderContentWithEmojis(content: string, emojis: ServerEmoji[] | undefined): ReactNode {
  if (!content) return content
  if (!emojis || emojis.length === 0) return withTwemoji(content, 20, 'tw-full')
  const map = new Map<string, string>()
  for (const emoji of emojis) {
    if (!map.has(emoji.name)) map.set(emoji.name, emoji.url)
  }
  const parts: ReactNode[] = []
  let lastIndex = 0
  let key = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null = null
  while ((match = TOKEN_RE.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(withTwemoji(content.slice(lastIndex, match.index), 20, `tw-${key}`))
    const url = map.get(match[1])
    if (url) {
      parts.push(
        <img key={`emoji-${key++}`} src={url} alt={match[0]} title={match[0]} className="fs-server-emoji" draggable={false} />
      )
    } else {
      parts.push(withTwemoji(match[0], 20, `tw-${key}`))
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) parts.push(withTwemoji(content.slice(lastIndex), 20, `tw-${key}`))
  // Sem custom emoji: ainda converte unicode -> Twemoji
  if (parts.length === 0) return withTwemoji(content, 20, 'tw-full')
  return parts.length === 0 ? content : parts
}
