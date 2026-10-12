import { Fa } from '../../utils/fa'
import { APP_VERSION } from '../../config/version'
import { assetUrl } from '../../utils/assets'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

// Modal "Sobre" — descricao da plataforma, versao e links.
export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: 460, width: 'calc(100% - 32px)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, color: 'var(--text-primary)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <img src={assetUrl('Logo.png')} alt="Friends Space Beta" style={{ width: 58, height: 58, objectFit: 'contain' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Friends Space Beta</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{APP_VERSION}</span>
          </div>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
          O Friends Space Beta e uma plataforma de comunidades com chamadas de voz/video criptografadas ponta a ponta (WebRTC),
          servidores, mensagens diretas e integracao com o seu proprio Google Drive para guardar a midia.
        </p>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <div><Fa name="globe" size={14} style={{ width: 18 }} /> https://friends-space.pages.dev</div>
          <div><Fa name="lock" size={14} style={{ width: 18 }} /> Chamadas SRTP criptografadas</div>
          <div><Fa name="hard-drive" size={14} style={{ width: 18 }} /> Midia no seu Drive (FRIENDS-SPACE)</div>
        </div>
        <button onClick={onClose} style={{ marginTop: 20, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent, #5865f2)', color: '#fff', fontWeight: 700, fontSize: 14 }}>Fechar</button>
      </div>
    </div>
  )
}