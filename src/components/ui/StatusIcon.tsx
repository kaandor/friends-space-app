export function StatusIcon({ status, online, size = 14 }: {
  status?: string
  online?: boolean
  size?: number
}) {
  const key = status || 'online'
  const base = { width: size, height: size, flexShrink: 0 } as const

  if (key === 'naoperturbe' || key === 'nao-perturbe' || key === 'dnd') {
    return (
      <svg viewBox="0 0 24 24" style={base}>
        <title>Nao perturbe</title>
        <circle cx="12" cy="12" r="10" fill="#f23f43" />
        <line x1="7.5" y1="12" x2="16.5" y2="12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )
  }

  if (key === 'ausente' || key === 'away' || key === 'idle') {
    return (
      <svg viewBox="0 0 24 24" style={base}>
        <title>Ausente</title>
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" fill="#faa81a" />
        <circle cx="8.5" cy="9" r="1.2" fill="#fff" />
      </svg>
    )
  }

  if (key === 'invisivel' || key === 'invisible' || key === 'offline') {
    return (
      <svg viewBox="0 0 24 24" style={base}>
        <title>Invisivel</title>
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="#80848e" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx="12" cy="12" r="2" fill="#80848e" />
      </svg>
    )
  }

  if (!online) {
    return (
      <svg viewBox="0 0 24 24" style={base}>
        <title>Offline</title>
        <circle cx="12" cy="12" r="9" fill="#80848e" />
        <circle cx="12" cy="12" r="3" fill="#232428" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" style={base}>
      <title>Online</title>
      <circle cx="12" cy="12" r="10" fill="#23a55a" />
      <ellipse cx="12" cy="12" rx="6" ry="10" fill="none" stroke="#1f8b4d" strokeWidth="1.6" strokeDasharray="2 2" opacity="0.9" transform="rotate(-24 12 12)" />
      <path d="M12 8.2l1.1 2.2 2.4.35-1.75 1.7.4 2.4-2.15-1.15-2.15 1.15.4-2.4-1.75-1.7 2.4-.35z" fill="#fff" />
    </svg>
  )
}