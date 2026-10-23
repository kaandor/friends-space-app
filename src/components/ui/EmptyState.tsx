import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className="fs-empty-state" style={{ padding: compact ? '18px 12px' : '32px 20px' }}>
      {icon ? <div className="fs-empty-state-icon">{icon}</div> : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="fs-empty-state-action">{action}</div> : null}
    </div>
  )
}
