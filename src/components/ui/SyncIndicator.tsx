export type SyncState = 'idle' | 'saving' | 'synced' | 'error'

const STYLE: Record<SyncState, { color: string; pulse?: boolean }> = {
  idle: { color: 'var(--text-muted)' },
  saving: { color: '#f0b232', pulse: true },
  synced: { color: '#23a55a' },
  error: { color: '#f23f43' },
}

const LABEL: Record<SyncState, string> = {
  idle: 'Aguardando',
  saving: 'Sincronizando...',
  synced: 'Sincronizado',
  error: 'Falha ao sincronizar',
}

interface SyncIndicatorProps {
  state: SyncState
  label?: string
}

export function SyncIndicator({ state, label }: SyncIndicatorProps) {
  const s = STYLE[state]
  return (
    <span
      title={label || LABEL[state]}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      <span
        style={{
          width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0,
          animation: s.pulse ? 'pulse 1s infinite' : undefined,
          boxShadow: s.pulse ? `0 0 8px ${s.color}` : undefined,
        }}
      />
      {label && <span>{label}</span>}
    </span>
  )
}
