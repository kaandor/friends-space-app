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
        <circle cx="12" cy="12" r="8.5" fill="#2b2d31" stroke="#80848e" strokeWidth="2.25" strokeDasharray="3.5 3" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2.25" fill="#80848e" />
      </svg>
    )
  }

  if (!online) {
    return (
      <svg viewBox="0 0 24 24" style={base}>
        <title>Offline</title>
        <circle cx="12" cy="12" r="9.5" fill="#80848e" />
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="#6d6f78" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3.25" fill="#232428" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" style={base}>
      <title>Online</title>
      <circle cx="12" cy="12" r="10" fill="#23a55a" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#1a7a43" strokeWidth="1.5" />
      <path d="M12 7.6l1.25 2.55 2.8.4-2.02 1.97.48 2.78L12 13.98l-2.51 1.32.48-2.78-2.02-1.97 2.8-.4z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}