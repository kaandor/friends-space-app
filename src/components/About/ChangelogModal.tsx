import { X } from 'lucide-react'
import { CHANGELOG } from '../../config/changelog'
import { APP_VERSION } from '../../config/version'
import { useLangStore } from '../../stores/langStore'

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const t = useLangStore(s => s.t)
  return (
    <div className="fs-modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onMouseDown={onClose}>
      <div className="fs-modal-in" onMouseDown={event => event.stopPropagation()} style={{ width: 'min(620px, 100%)', maxHeight: 'min(720px, calc(100vh - 40px))', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 800 }}>{t('changelog.title')}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginTop: 2 }}>{t('changelog.current')} {APP_VERSION}</div>
          </div>
          <button onClick={onClose} title={t('modal.close')} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px 20px' }}>
          {CHANGELOG.map(entry => (
            <article key={entry.version} style={{ padding: '0 0 16px', marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>v{entry.version}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>{entry.date}</span>
              </div>
              {entry.site.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('changelog.site')}</div>
                  <ul style={{ margin: '5px 0 0 16px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.65 }}>
                    {entry.site.map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                </div>
              )}
              {entry.app.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('changelog.app')}</div>
                  <ul style={{ margin: '5px 0 0 16px', color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.65 }}>
                    {entry.app.map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
