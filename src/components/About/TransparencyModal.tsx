import { ExternalLink, ShieldCheck, X } from 'lucide-react'
import { APP_VERSION } from '../../config/version'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'
import { Button } from '../ui/Button'

function fire(name: string) {
  try { window.dispatchEvent(new Event(name)) } catch { }
}

export function TransparencyModal({ onClose }: { onClose: () => void }) {
  const users = useUserStore(s => s.users)
  const servers = useServerStore(s => s.servers)
  const messages = useServerStore(s => s.messages)
  const t = useLangStore(s => s.t)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={onClose}>
      <div className="fs-modal-in" onMouseDown={event => event.stopPropagation()} style={{ width: 'min(580px, 100%)', maxHeight: 'min(720px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}><ShieldCheck size={17} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>{t('transparency.title')}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{t('transparency.subtitle')}</div>
          </div>
          <button onClick={onClose} title={t('modal.close')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px 20px' }}>
          <div className="fs-transparency-hero">
            <strong>{t('transparency.heroTitle')}</strong>
            <p>{t('transparency.heroBody')}</p>
          </div>

          <div className="fs-insight-grid">
            <div className="fs-insight-card"><span>{t('transparency.version')}</span><strong style={{ fontSize: 15 }}>{APP_VERSION}</strong></div>
            <div className="fs-insight-card"><span>{t('transparency.people')}</span><strong>{users.length}</strong></div>
            <div className="fs-insight-card"><span>{t('transparency.servers')}</span><strong>{servers.length}</strong></div>
            <div className="fs-insight-card"><span>{t('transparency.messages')}</span><strong>{messages.length}</strong></div>
          </div>

          <h3 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '16px 0 6px' }}>{t('transparency.doTitle')}</h3>
          <ul style={{ margin: '0 0 0 17px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.65 }}>
            <li>{t('transparency.do1')}</li>
            <li>{t('transparency.do2')}</li>
            <li>{t('transparency.do3')}</li>
            <li>{t('transparency.do4')}</li>
          </ul>

          <h3 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '16px 0 6px' }}>{t('transparency.dontTitle')}</h3>
          <ul style={{ margin: '0 0 0 17px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.65 }}>
            <li>{t('transparency.dont1')}</li>
            <li>{t('transparency.dont2')}</li>
            <li>{t('transparency.dont3')}</li>
          </ul>

          <h3 style={{ color: 'var(--text-primary)', fontSize: 13, margin: '16px 0 6px' }}>{t('transparency.controlTitle')}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={() => { onClose(); fire('friends-space:open-privacy') }}><ExternalLink size={13} /> {t('transparency.privacy')}</Button>
            <Button size="sm" variant="secondary" onClick={() => { onClose(); fire('friends-space:open-help') }}><ExternalLink size={13} /> {t('transparency.help')}</Button>
          </div>
          <p style={{ marginTop: 14, color: 'var(--text-dim)', fontSize: 10.5, lineHeight: 1.5 }}>{t('transparency.footnote')}</p>
        </div>
      </div>
    </div>
  )
}
