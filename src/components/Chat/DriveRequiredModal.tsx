import { useState } from 'react'
import { assetUrl } from '../../utils/assets'
import { connectDrive } from '../../services/driveService'
import { DiretrizesModal } from './DiretrizesModal'

interface DriveRequiredModalProps {
  open: boolean
  onClose: () => void
  onConnected: () => void
  file?: File | null
  required?: boolean
  variant?: 'media' | 'server' | 'perfil'
}

const GREEN = '#4ade80'
const CARD = 'var(--bg-tertiary)'
const BORDER = 'var(--border)'

function InfoCard({ icon, text }: { icon: string; text: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12 }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <i className={`fa-solid ${icon}`} style={{ color: GREEN, fontSize: 16 }} />
      </div>
      <p style={{ color: '#d1d5db', fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{text}</p>
    </div>
  )
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#d1d5db', fontSize: 13.5 }}>
      <i className={`fa-solid ${icon}`} style={{ color: GREEN, fontSize: 16, width: 20, textAlign: 'center' }} />
      <span>{text}</span>
    </div>
  )
}

export function DriveRequiredModal({ open, onClose, onConnected, file, required = false, variant = 'media' }: DriveRequiredModalProps) {
  const [busy, setBusy] = useState(false)
  const [aceito, setAceito] = useState(false)
  const [showDiretrizes, setShowDiretrizes] = useState(false)

  const handleConnect = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await connectDrive()
      if (ok) {
        onConnected()
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}
      onClick={required ? undefined : onClose}
    >
      <div
        style={{ position: 'relative', background: 'var(--bg-tertiary)', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        {!required && (
          <button onClick={onClose} aria-label="Fechar" style={{ position: 'absolute', top: 16, right: 16, color: '#9ca3af', zIndex: 10, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        )}

        <div style={{ display: 'flex', gap: 24, padding: '28px 28px 20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 160 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(74,222,128,0.10)', filter: 'blur(24px)' }} />
              <img src={assetUrl('drive-illustration.png')} alt="Google Drive" style={{ position: 'relative', width: '100%', maxWidth: 220, objectFit: 'contain' }} />
            </div>
          </div>

          <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: '#1e2e1e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={variant === 'server' ? 'fa-solid fa-server' : variant === 'perfil' ? 'fa-solid fa-user-pen' : 'fa-solid fa-bolt'} style={{ color: GREEN, fontSize: 20 }} />
              </div>
              <h1 style={{ color: 'var(--text-primary)', fontSize: 24, fontWeight: 700, margin: 0 }}>
                {variant === 'server' ? 'Servidor criado!' : variant === 'perfil' ? 'Editar perfil' : 'Enviar mídia'}
              </h1>
            </div>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              {variant === 'server' ? (
                <>Toda a mídia do seu servidor — fotos, vídeos, GIFs e arquivos enviados nos canais — será armazenada na pasta <b style={{ color: GREEN }}>Friends Space</b> do seu <b style={{ color: GREEN }}>Google Drive.</b></>
              ) : variant === 'perfil' ? (
                <>Sua <b style={{ color: GREEN }}>foto de perfil</b> e <b style={{ color: GREEN }}>banner</b> ficam armazenados na pasta <b style={{ color: GREEN }}>Friends Space</b> do seu <b style={{ color: GREEN }}>Google Drive</b> e carregam por link.</>
              ) : (
                <>Para enviar {file?.type.includes('video') ? 'vídeos e arquivos' : 'fotos, GIFs e arquivos'}, conecte sua conta do <b style={{ color: GREEN }}>Google Drive.</b></>
              )}
            </p>
            <InfoCard icon="fa-circle-info" text={
              variant === 'server' ? (
                <>O <b style={{ color: GREEN }}>Space Ultra Transfer</b> é a única solução viável para o Friends Space nesta fase <b>beta</b>: a comunidade <b>MHK</b> não tem orçamento para manter um banco de dados de mídias, então cada usuário guarda seu conteúdo no próprio Google Drive.</>
              ) : (
                <>As mídias enviadas serão armazenadas na pasta <b>Friends Space</b> do seu Google Drive. O Friends Space <b>não armazena arquivos em seus próprios servidores nem possui um banco de dados dedicado para mídias.</b></>
              )
            } />
            <InfoCard icon="fa-circle-info" text={<>As mídias enviadas serão armazenadas na pasta <b>Friends Space</b> do seu Google Drive. O Friends Space <b>não armazena arquivos em seus próprios servidores nem possui um banco de dados dedicado para mídias.</b></>} />
            <InfoCard icon="fa-bolt" text={
              variant === 'server' ? (
                <>O <b>Space Ultra Transfer</b>, nosso sistema de transferência, envia tudo diretamente para o seu Google Drive — <b>sem depender de um banco de dados próprio</b>, que a comunidade MHK não tem como bancar nesta fase beta.</>
              ) : (
                <>Utilizamos o <b>Space Ultra Transfer</b>, nosso sistema de transferência otimizado, que envia seus arquivos diretamente para o seu Google Drive com rapidez e segurança.</>
              )
            } />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #222', margin: '0 28px' }} />

        <div style={{ display: 'flex', gap: 24, padding: '20px 28px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center', minWidth: 160 }}>
            <Feature icon="fa-cloud-arrow-up" text="Envie arquivos maiores" />
            <Feature icon="fa-folder-open" text="Compartilhe mais conteúdo" />
            <Feature icon="fa-bolt" text="Transferências mais rápidas" />
          </div>
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <i className="fa-solid fa-star" style={{ color: GREEN, fontSize: 16 }} />
              <h2 style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18, margin: 0 }}>Sobre os planos ASTRO</h2>
            </div>
            <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
              Os planos ASTRO <b style={{ color: GREEN, textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>não aumentam o armazenamento</b> do seu Google Drive.
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5, margin: '0 0 12px' }}>
              Eles aumentam apenas os limites do sistema de transferência do Friends Space, permitindo enviar arquivos maiores, compartilhar mais conteúdo e aproveitar velocidades superiores durante o envio.
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              O espaço utilizado continuará sendo o disponível na sua própria conta do Google Drive.
            </p>
          </div>
        </div>

        <div style={{ margin: '0 28px 20px' }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <i className="fa-solid fa-shield-halved" style={{ color: GREEN, fontSize: 20, flexShrink: 0 }} />
            <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.5, margin: 0, flex: 1, minWidth: 0 }}>
              Ao conectar sua conta, será criada automaticamente uma pasta chamada <b style={{ color: GREEN }}>Friends Space</b> no seu Google Drive para organizar todas as mídias enviadas.
            </p>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={assetUrl('friends-space-icon.png')} alt="Friends Space" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              <i className="fa-solid fa-arrow-right-long" style={{ color: '#444', fontSize: 14 }} />
              <img src={assetUrl('gdrive.png')} alt="Google Drive" style={{ width: 34, height: 34, objectFit: 'contain' }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '0 28px' }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={aceito}
              onChange={e => setAceito(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: GREEN, flexShrink: 0 }}
            />
            <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
              Li e aceito as <b style={{ color: GREEN }}>Diretrizes e Obrigações do Friends Space</b>.
            </span>
          </label>
          <button
            onClick={() => setShowDiretrizes(true)}
            style={{ background: 'none', border: 'none', padding: 0, marginBottom: 14, color: '#9ca3af', fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Ver diretrizes e obrigações do Friends Space
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={onClose}
              style={{ flex: 1, padding: '14px 0', background: '#1f1f1f', border: `1px solid #333`, color: 'var(--text-primary)', fontWeight: 600, borderRadius: 12, cursor: 'pointer', fontSize: 14 }}
            >
              Agora não
            </button>
            <button
              onClick={handleConnect}
              disabled={busy || !aceito}
              style={{ flex: 1, padding: '14px 0', background: busy ? '#22c55e' : GREEN, border: 'none', color: '#000', fontWeight: 700, borderRadius: 12, cursor: busy || !aceito ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: aceito ? 1 : 0.45 }}
            >
              <img src={assetUrl('gdrive.png')} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              {busy ? 'Conectando...' : 'Conectar Google Drive'}
            </button>
          </div>
        </div>
      </div>
      {showDiretrizes && <DiretrizesModal open onClose={() => setShowDiretrizes(false)} />}
    </div>
  )
}
