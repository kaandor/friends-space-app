import { useState } from 'react'

const GREEN = '#4ade80'
const CARD = 'var(--bg-tertiary)'
const BORDER = 'var(--border)'

interface DiretrizesModalProps {
  open: boolean
  onClose: () => void
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', gap: 12 }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <i className={`fa-solid ${icon}`} style={{ color: GREEN, fontSize: 16 }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: '0 0 8px 0' }}>{title}</h3>
        <div style={{ color: '#d1d5db', fontSize: 13.5, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#d1d5db', fontSize: 13.5, lineHeight: 1.5 }}>
      <i className="fa-solid fa-circle-check" style={{ color: GREEN, fontSize: 12, marginTop: 3, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  )
}

export function DiretrizesModal({ open, onClose }: DiretrizesModalProps) {
  const [tab, setTab] = useState<'sistema' | 'diretrizes' | 'obrigacoes'>('sistema')

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: 'var(--bg-tertiary)', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Fechar" style={{ position: 'absolute', top: 16, right: 16, color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, zIndex: 10 }}>
          <i className="fa-solid fa-xmark" />
        </button>

        <div style={{ padding: '24px 28px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, background: '#1e2e1e', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="fa-solid fa-scale-balanced" style={{ color: GREEN, fontSize: 18 }} />
            </div>
            <h1 style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, margin: 0 }}>Diretrizes e Obrigações</h1>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 13.5, margin: '8px 0 0', lineHeight: 1.5 }}>
            O Friends Space roda sobre o <b style={{ color: GREEN }}>seu próprio Google Drive</b>. Antes de conectar, leia como o sistema funciona, as diretrizes que protegem a comunidade e as obrigações que o Friends Space assume com você.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '0 28px 14px' }}>
          {([
            { key: 'sistema', label: 'Como funciona' },
            { key: 'diretrizes', label: 'Diretrizes do FS' },
            { key: 'obrigacoes', label: 'Obrigações do FS' },
          ] as const).map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid transparent', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: tab === item.key ? GREEN : '#1f1f1f', color: tab === item.key ? '#000' : '#9ca3af',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tab === 'sistema' && (
            <>
              <Section icon="fa-cloud-arrow-up" title="Suas mídias vivem no SEU Drive">
                O Friends Space <b>não possui banco de dados próprio para mídia</b>. Tudo o que você envia — fotos, vídeos, GIFs, ícones e banners de perfil e de servidor — é armazenado na pasta <b style={{ color: GREEN }}>FRIENDS-SPACE</b> do seu Google Drive.
              </Section>
              <Section icon="fa-shield-halved" title="Permissão sempre pedida e escopo mínimo">
                O Friends Space <b>sempre pede sua autorização</b> antes de acessar o Google Drive e usa o menor escopo possível (<code style={{ color: GREEN }}>drive.file</code>): apenas criar e gerenciar os arquivos e pastas criados pelo próprio Friends Space. <b>Nunca</b> pede acesso total, nem acesso à sua conta Google.
              </Section>
              <Section icon="fa-link" title="Links anônimos (tipo CDN)">
                As mídias carregam por link anônimo: qualquer pessoa com o link abre o arquivo <b>sem login</b> e <b>sem ver nada da sua conta</b> do Drive.
              </Section>
            </>
          )}

          {tab === 'diretrizes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Rule>É proibido enviar ou compartilhar pelo Friends Space qualquer conteúdo <b>ilegal, obsceno, violento, discriminatório ou de assédio</b>, ou que viole direitos de terceiros (direitos autorais, imagem e privacidade).</Rule>
              <Rule>É proibido distribuir <b>malware, phishing, spam</b> ou qualquer conteúdo malicioso pelo sistema.</Rule>
              <Rule>É proibido <b>explorar falhas</b>, sobrecarregar o sistema ou automatizar envios em massa (bots) fora do uso normal do serviço.</Rule>
              <Rule>Você é <b>responsável pelo conteúdo</b> que envia do seu Drive através do Friends Space. Servidores com conteúdo impróprio podem ser removidos e usuários podem ser banidos.</Rule>
              <Rule>Não tente <b>burilar limites de envio, planos ou medidas de segurança</b> do sistema.</Rule>
              <Rule>Mantenha sua conta Google protegida. O Friends Space <b>nunca pede senha</b> e não consegue recuperar contas comprometidas.</Rule>
              <Rule>Denuncie conteúdo impróprio aos administradores para manter a comunidade saudável.</Rule>
            </div>
          )}

          {tab === 'obrigacoes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Rule>O Friends Space <b>não armazena cópias</b> das suas mídias em servidores próprios — os arquivos permanecem na sua conta do Google Drive.</Rule>
              <Rule>O Friends Space <b>não lê, vende, aluga ou compartilha</b> o conteúdo do seu Drive. O acesso é usado apenas para operar o serviço (upload/download na pasta FRIENDS-SPACE).</Rule>
              <Rule>O Friends Space <b>sempre pede autorização</b> antes de acessar seu Drive e usa o escopo mínimo necessário.</Rule>
              <Rule><b>Seus arquivos são seus:</b> você pode apagar a pasta FRIENDS-SPACE do seu Drive e desconectar o Friends Space a qualquer momento. Ao desconectar, o FS deixa de acessar seu Drive.</Rule>
              <Rule>Os planos ASTRO <b>aumentam limites de transferência e velocidade</b> — nunca aumentam nem cobram pelo seu armazenamento.</Rule>
              <Rule>O Friends Space <b>não expõe sua identidade</b> nos links anônimos de mídia.</Rule>
              <Rule>O Friends Space se compromete a ser <b>transparente</b> sobre o que faz com seu Drive e a informar qualquer mudança nestas diretrizes.</Rule>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #222', marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '14px 0', background: GREEN, border: 'none', color: '#000', fontWeight: 700, borderRadius: 12, cursor: 'pointer', fontSize: 14 }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
