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
    sm: { height: 30, minHeight: 30, padding: '0 12px', fontSize: 12, borderRadius: 8 },
    md: { height: 36, minHeight: 36, padding: '0 16px', fontSize: 14, borderRadius: 8 },
    lg: { height: 44, minHeight: 44, padding: '0 20px', fontSize: 15, borderRadius: 10 },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontWeight: 600,
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        border: 'none',
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
