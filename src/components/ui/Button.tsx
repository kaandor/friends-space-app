import React from 'react'

interface ButtonProps {
  onClick?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  style?: React.CSSProperties
  disabled?: boolean
}

export function Button({ onClick, children, variant = 'primary', size = 'md', style, disabled }: ButtonProps) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--accent)', color: '#000' },
    secondary: { background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
    danger: { background: 'var(--danger)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
  }
  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '8px 16px', fontSize: 14 },
    lg: { padding: '10px 20px', fontSize: 16 },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 'var(--radius-sm)',
        fontWeight: 600,
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        ...styles[variant],
        ...sizes[size],
        ...style,
      }}
      onMouseEnter={e => {
        if (variant === 'primary') (e.target as HTMLElement).style.opacity = '0.9'
      }}
      onMouseLeave={e => {
        if (variant === 'primary') (e.target as HTMLElement).style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}
