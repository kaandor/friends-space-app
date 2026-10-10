import { APP_VERSION } from '../../config/version'
import { assetUrl } from '../../utils/assets'

interface WelcomeModalProps {
  open: boolean
  platform: 'site' | 'desktop'
  onClose: () => void
  onHelp?: () => void
}

// Tela de boas-vindas — aparece UMA vez para o usuario (first-run).
// Exibe: logo, versao, aviso de primeira versao, e botoes Ajuda + Entendi.
export function WelcomeModal({ open, platform, onClose, onHelp }: WelcomeModalProps) {
  if (!open) return null
  const isDesktop = platform === 'desktop'
  const title = isDesktop ? 'Friends Space Desktop' : 'Friends Space'
  const headline = isDesktop
    ? 'Bem-vindo a primeira versao do app desktop do Friends Space!'
    : 'Bem-vindo a primeira versao do Friends Space!'
  const body = [
    isDesktop
      ? 'Esta e a primeira versao do Friends Space para desktop, e a primeira versao do app em geral.'
      : 'Esta e a primeira versao do site do Friends Space.',
    'Bugs sao normais nesse inicio.',
    'Nao recomendamos assinar o ASTRO agora — ele ainda esta em desenvolvimento e ainda nao configuramos tudo.',
    'Recursos de modificacao de servidores, cargos, bots, etc. ainda estao bem crus.',
    'O projeto usa planos gratuitos de banco de dados, TURN e hospedagem, entao nao conseguimos configurar tudo nem implementar todos os recursos por enquanto.',
  ]
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: 480, width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, color: 'var(--text-primary)', boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <img src={assetUrl('Logo.png')} alt="Friends Space" style={{ width: 64, height: 64, objectFit: 'contain' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{title}</h2>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>v{APP_VERSION} · primeira versao</span>
          </div>
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5, margin: '0 0 10px', color: 'var(--text-primary)' }}>{headline}</p>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {body.map((line, i) => (
            <p key={i} style={{ margin: 0 }}>• {line}</p>
          ))}
          <p style={{ margin: '4px 0 0' }}>
            Relate problemas no botao <b>Ajuda</b> abaixo — seu relato ajuda a melhorar a experiencia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {onHelp && (
            <button
              onClick={() => { onClose(); onHelp() }}
              style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}
            >
              <i className="fa-solid fa-circle-question" style={{ marginRight: 8 }} /> Ajuda
            </button>
          )}
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--accent, #5865f2)', color: '#fff', fontWeight: 700, fontSize: 14 }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}