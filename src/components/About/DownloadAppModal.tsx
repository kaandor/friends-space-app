import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import { getApiBaseUrl } from '../../services/config'
import { CHANGELOG } from '../../config/changelog'
import { assetUrl } from '../../utils/assets'

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
  }, [open])

  if (!open) return null

  const ghOwner = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GH_OWNER || ''
  const ghRepo = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GH_REPO || ''
  const releasesPage = ghOwner && ghRepo ? `https://github.com/${ghOwner}/${ghRepo}/releases/latest` : ''

  const handleDownload = (name: string, url: string) => {
    if (url) window.open(url, '_blank', 'noopener')
    setDownloaded(name)
    window.setTimeout(() => setDownloaded(null), 2400)
  }

  const openHelp = () => {
    onClose()
    try { window.dispatchEvent(new Event('friends-space:open-help')) } catch { }
  }
  const openDiscover = () => {
    onClose()
    try { window.dispatchEvent(new Event('friends-space:open-discover')) } catch { }
  }

  const platforms = [
    {
      name: 'Windows',
      description: links.version ? `Versão ${links.version} · Windows 10 ou superior` : 'Windows 10 ou superior',
      icon: 'windows',
      url: links.win || releasesPage,
      accent: '#29A3FF',
    },
    {
      name: 'Linux',
      description: links.version ? `Versão ${links.version} · Ubuntu, Debian, Fedora e mais` : 'Ubuntu, Debian, Fedora e mais',
      icon: 'linux',
      url: links.linux || releasesPage,
      accent: '#f6c344',
    },
    {
      name: 'macOS',
      description: links.version ? `Versão ${links.version} · macOS 11 (Big Sur) ou superior` : 'macOS 11 (Big Sur) ou superior',
      icon: 'apple',
      url: links.mac || releasesPage,
      accent: '#c9d1d9',
    },
  ]

  return (
    <div className="fs-dl-overlay" onClick={onClose}>
      <div className="fs-dl-modal" role="dialog" aria-modal="true" aria-label="Baixar app" onClick={e => e.stopPropagation()}>
        <button className="fs-dl-close" onClick={onClose} aria-label="Fechar janela">
          <Fa name="xmark" size={16} />
        </button>

        <header className="fs-dl-header">
          <span className="fs-dl-logo"><img src={assetUrl('penguin-logo.png')} alt="Friends Space" /></span>
          <div className="fs-dl-header-copy">
            <h2>Baixar app</h2>
            <p>Leve o Friends Space pro desktop: voz, tela, câmera e controle remoto.</p>
          </div>
          {links.version && <span className="fs-dl-version">v{links.version}</span>}
        </header>

        <div className="fs-dl-grid">
          {platforms.map((p, i) => (
            <div className="fs-dl-card" key={p.name} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="fs-dl-card-icon" style={{ color: p.accent }}>{p.icon === 'linux' ? <img src={assetUrl('penguin-tux.svg')} style={{ height: 30, width: 'auto', objectFit: 'contain', display: 'block' }} alt="Linux" /> : <Fa name={p.icon} size={30} />}</span>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <button
                className="fs-dl-btn"
                disabled={!p.url}
                onClick={() => handleDownload(p.name, p.url)}
              >
                <Fa name="download" size={13} />
                {downloaded === p.name ? 'Baixando…' : p.url ? 'Baixar' : 'Em breve'}
              </button>
            </div>
          ))}
        </div>

        {CHANGELOG.length > 0 && (
          <section className="fs-dl-changelog">
            <div className="fs-dl-changelog-head">
              <Fa name="rocket" size={13} />
              <span>Novidades da versão {CHANGELOG[0].version}</span>
            </div>
            <div className="fs-dl-changelog-cols">
              <div>
                <span className="fs-dl-col-title">App desktop</span>
                <ul>
                  {CHANGELOG[0].app.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
              <div>
                <span className="fs-dl-col-title">Site</span>
                <ul>
                  {CHANGELOG[0].site.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
            {links.notes && <p className="fs-dl-notes">{links.notes}</p>}
          </section>
        )}

        <footer className="fs-dl-footer">
          <span className="fs-dl-footer-icon"><Fa name="circle-info" size={13} /></span>
          <p>
            Precisa de ajuda? <button onClick={openHelp}>Abrir a Central de Ajuda</button> ou conheça{' '}
            <button onClick={openDiscover}>a comunidade no Descubra</button>.
          </p>
        </footer>
      </div>
    </div>
  )
}
