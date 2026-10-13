import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { getApiBaseUrl } from '../../services/config'
import { CHANGELOG } from '../../config/changelog'

interface DownloadAppModalProps {
  open: boolean
  onClose: () => void
}

// Janela de download do app — só aparece no SITE (web), nunca no desktop.
// URLs vêm da última GitHub Release (endpoint checkUpdate); sem release,
// aponta para a página de releases. Segue o tema via var(--...).
export function DownloadAppModal({ open, onClose }: DownloadAppModalProps) {
  const [downloaded, setDownloaded] = useState<string | null>(null)
  const [links, setLinks] = useState<{ win: string; linux: string; mac: string; version: string; notes: string }>({ win: '', linux: '', mac: '', version: '', notes: '' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'checkUpdate', profileId: 'anonymous' }),
        })
        const json = await res.json().catch(() => null)
        const r = json && (json.result || json)
        if (!cancelled && r && (r.downloadUrl || r.releasePage)) {
          setLinks({
            win: r.downloadUrl || r.releasePage || '',
            linux: r.downloadUrlLinux || r.releasePage || '',
            mac: r.downloadUrlMac || r.releasePage || '',
            version: r.latestVersion || '',
            notes: typeof r.releaseNotes === 'string' ? r.releaseNotes.slice(0, 600) : '',
          })
        }
      } catch { /* silencioso — usa fallback da página de releases */ }
    }
    void load()
    return () => { cancelled = true }
  }, [open ])

  if (!open) return null

  const ghOwner = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GH_OWNER || ''
  const ghRepo = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GH_REPO || ''
  const releasesPage = ghOwner && ghRepo ? `https://github.com/${ghOwner}/${ghRepo}/releases/latest` : ''

  const handleDownload = (name: string, url: string) => {
    if (url) window.open(url, '_blank', 'noopener')
    setDownloaded(name)
    window.setTimeout(() => setDownloaded(null), 2400)
  }

  const platforms = [
    {
      name: 'Windows',
      description: links.version ? `Versão ${links.version} · Windows 10 ou superior` : 'Windows 10 ou superior',
      icon: 'windows',
      url: links.win || releasesPage,
    },
    {
      name: 'Linux',
      description: links.version ? `Versão ${links.version} · Ubuntu, Debian, Fedora e mais` : 'Ubuntu, Debian, Fedora e mais',
      icon: 'linux',
      url: links.linux || releasesPage,
    },
    {
      name: 'macOS',
      description: links.version ? `Versão ${links.version} · macOS 11 (Big Sur) ou superior` : 'macOS 11 (Big Sur) ou superior',
      icon: 'apple',
      url: links.mac || releasesPage,
    },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', padding: 16, overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(100%, 1000px)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          padding: 'clamp(28px, 4vw, 52px)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        }}
      >
        <button
          aria-label="Fechar janela"
          onClick={onClose}
          style={{ position: 'absolute', top: 22, right: 22, display: 'grid', placeItems: 'center', width: 42, height: 42, color: 'var(--text-muted)', background: 'transparent', border: 0, borderRadius: '50%', cursor: 'pointer' }}
          onMouseOver={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
        >
          <Fa name="xmark" size={30} style={{  fontWeight: 300 }} />
        </button>

        <header style={{ paddingBottom: 'clamp(26px, 3vw, 40px)' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(28px, 3vw, 42px)', fontWeight: 800, letterSpacing: '-0.03em' }}>Baixar app</h2>
          <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: 'clamp(16px, 1.6vw, 22px)' }}>Escolha a versão para o seu sistema.</p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'clamp(16px, 2vw, 26px)' }}>
          {platforms.map((p, i) => (
            <div
              key={p.name}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'clamp(24px, 2.6vw, 38px) clamp(18px, 2vw, 26px)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                background: 'var(--bg-secondary)',
                animation: `fsCardIn 520ms cubic-bezier(.23,1,.32,1) ${i * 70}ms both`,
              }}
              onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{ display: 'grid', placeItems: 'center', minHeight: 140, width: '100%' }}>
                <Fa name={p.icon} size={92} style={{ color: 'var(--text-primary)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '10px 0 6px', fontSize: 'clamp(22px, 2vw, 30px)', fontWeight: 700, letterSpacing: '-0.03em' }}>{p.name}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'clamp(14px, 1.3vw, 18px)' }}>{p.description}</p>
              </div>
              <button
                onClick={() => handleDownload(p.name, p.url)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', marginTop: 'auto', minHeight: 56, padding: '14px 18px',
                  color: '#fff', background: 'var(--accent, #5865f2)',
                  border: 'none', borderRadius: 13, cursor: 'pointer',
                  fontWeight: 700, fontSize: 'clamp(17px, 1.5vw, 22px)',
                  boxShadow: '0 5px 16px rgba(0,0,0,0.15)',
                }}
                onMouseOver={e => { e.currentTarget.style.filter = 'brightness(1.1)' }}
                onMouseOut={e => { e.currentTarget.style.filter = 'brightness(1)' }}
              >
                <Fa name="download" size={20} />
                <span>{downloaded === p.name ? 'Baixando…' : p.url ? 'Baixar' : 'Em breve'}</span>
              </button>
            </div>
          ))}
        </div>

        <footer style={{ marginTop: 'clamp(24px, 2.5vw, 34px)', paddingTop: 'clamp(20px, 2vw, 28px)', borderTop: '1px solid var(--border)' }}>
          {CHANGELOG.length > 0 && (
            <div style={{ marginBottom: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Fa name="rocket" size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontWeight: 800, fontSize: 15 }}>Novidades da versão {CHANGELOG[0].version}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>App desktop</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {CHANGELOG[0].app.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Site</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {CHANGELOG[0].site.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              </div>
              {links.notes && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{links.notes}</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-secondary)', fontSize: 'clamp(13px, 1.2vw, 17px)' }}>
            <div style={{ display: 'grid', flex: '0 0 auto', placeItems: 'center', width: 40, height: 40, color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '50%', background: 'var(--bg-secondary)' }}>
              <Fa name="circle-info" size={14} />
            </div>
            <p style={{ margin: 0, lineHeight: 1.45 }}>
              Precisa de ajuda? Consulte nossa <a href="#help" onClick={e => e.preventDefault()} style={{ color: 'var(--accent)' }}>Central de Ajuda</a> ou entre no nosso <a href="#community" onClick={e => e.preventDefault()} style={{ color: 'var(--accent)' }}>servidor no Friends Space.</a>
            </p>
          </div>
        </footer>
      </div>

      <style>{`@keyframes fsCardIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
