import React from 'react'

interface InputProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  type?: string
  disabled?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  maxLength?: number
  autoFocus?: boolean
}

export function Input({ value, onChange, placeholder, style, type = 'text', disabled, onKeyDown, maxLength, autoFocus }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      autoFocus={autoFocus}
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        color: 'var(--text-primary)',
        fontSize: 14,
        transition: 'border-color 0.15s',
        ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
        ...style,
      }}
      onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
      onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
    />
  )
}
