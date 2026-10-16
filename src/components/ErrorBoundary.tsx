import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

// Impede que qualquer erro de renderizacao durante uma chamada derrube o app
// inteiro (tela preta/branca). Mostra uma tela de recuperacao com reload em vez
// de deixar o app morto.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error('[ErrorBoundary]', error, info.componentStack)
    } catch { }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-primary, #1e1e1e)', color: 'var(--text-primary, #f2f3f5)',
          flexDirection: 'column', gap: 14, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Algo deu errado</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #b5bac1)', maxWidth: 420, wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--accent, #29A3FF)', color: '#000', fontWeight: 800, fontSize: 14,
            }}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
