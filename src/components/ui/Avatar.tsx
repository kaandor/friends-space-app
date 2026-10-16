import { toImageUrl } from '../../services/driveService'

interface AvatarProps {
  src?: string
  name: string
  size?: number
  onClick?: () => void
}

const colors = [
  '#29A3FF', '#0B7FD4', '#ff4444', '#ffaa00',
  '#4488ff', '#aa44ff', '#ff44aa', '#44ffcc',
]

export function Avatar({ src, name, size = 40, onClick }: AvatarProps) {
  const letter = name.charAt(0).toUpperCase()
  const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  const resolved = src ? toImageUrl(src, size * 4) : ''

  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: resolved ? `url(${resolved}) center/cover` : colors[colorIndex],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#000',
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {!src && letter}
    </div>
  )
}
