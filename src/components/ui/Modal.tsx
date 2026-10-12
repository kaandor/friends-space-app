import { Fa } from '../../utils/fa'
import React from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: 24, minWidth: 360, maxWidth: 480,
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
            <Fa name="xmark" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
