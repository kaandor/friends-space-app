import { useEffect, useRef, useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { getGoogleClientId, getGoogleClientSecret, loadGoogleIdentityScript, parseAccessTokenFromHash, getGoogleProfileFromAccessToken, buildGoogleAuthUrl } from '../../services/googleAuth'
import { assetUrl } from '../../utils/assets'

export function GoogleLoginView() {
  const signInWithGoogle = useUserStore(state => state.signInWithGoogle)
    const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const clientId = getGoogleClientId()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [gsiReady, setGsiReady] = useState(false)
  const [showFallback, setShowFallback] = useState(false)
  const [diagBackend, setDiagBackend] = useState('...')
  const [staleApp, setStaleApp] = useState(false)
  const [loginStep, setLoginStep] = useState('')
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { pingBackend } = await import('../../services/backend')
        const ok = await pingBackend()
        if (alive) setDiagBackend(ok ? 'ok' : 'falha')
      } catch { if (alive) setDiagBackend('falha') }
    })()
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        const srv = await r.json()
        const mine = typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : ''
        if (alive && srv && srv.id && mine && srv.id !== mine) setStaleApp(true)
      } catch {}
    })()
    return () => { alive = false }
  }, [])
  const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)

  async function signInWithElectron() {
    try {
      setError('')
      setLoading(true)
      const api = (window as unknown as { electronAPI?: { googleAuth?: (authUrl: string, clientSecret?: string) => Promise<{ accessToken?: string; profile?: { googleId: string; email: string; name: string; photoUrl: string }; error?: string }> } }).electronAPI
      const authUrl = buildGoogleAuthUrl()
      const clientSecret = getGoogleClientSecret()
      const result = await api?.googleAuth?.(authUrl, clientSecret)
      if (!result || !result.accessToken) {
        throw new Error(result?.error ? 'Login interrompido: ' + result.error : 'Falha no login')
      }
      const profile = result.profile && result.profile.googleId
        ? result.profile
        : await getGoogleProfileFromAccessToken(result.accessToken)
      await signInWithGoogle(profile, undefined, result.accessToken)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (gsiReady) {
      setShowFallback(false)
      return
    }
    const timer = window.setTimeout(() => setShowFallback(true), 6000)
    return () => window.clearTimeout(timer)
  }, [gsiReady])

  useEffect(() => {
    let cancelled = false
    async function setup() {
      if (isElectron) {
        setShowFallback(true)
        return
      }
      try {
        const hashToken = parseAccessTokenFromHash()
        if (hashToken) {
          try {
            window.location.hash = ''
            setLoading(true)
            const profile = await getGoogleProfileFromAccessToken(hashToken)
            if (!cancelled) await signInWithGoogle(profile, undefined, hashToken)
            return
          } catch (authError) {
            if (!cancelled) setError(authError instanceof Error ? authError.message : 'Falha no login')
            setLoading(false)
            return
          }
        }

        if (!clientId) {
          throw new Error('VITE_GOOGLE_CLIENT_ID nao configurado')
        }
        await loadGoogleIdentityScript()
        if (cancelled || !window.google) return

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            try {
              setError('')
              setLoading(true)
              const payload = JSON.parse(atob(response.credential.split('.')[1]))
              const profile = {
                googleId: payload.sub,
                email: payload.email,
                name: payload.name,
                photoUrl: payload.picture || '',
              }
              setLoginStep('Enviando ao servidor...')
              await Promise.race([
                signInWithGoogle(profile, response.credential),
                new Promise((_, reject) => window.setTimeout(() => reject(new Error('Tempo esgotado (45s). Toque novamente.') as unknown as never), 45000)),
              ])
              setLoginStep('')
            } catch (authError) {
              setError(authError instanceof Error ? authError.message : 'Falha no login')
            } finally {
              setLoading(false)
              setLoginStep('')
            }
          },
        })

        if (buttonRef.current) {
          buttonRef.current.innerHTML = ''
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: 'filled_blue',
            size: 'large',
            width: 320,
            text: 'signin_with',
            shape: 'pill',
            logo_alignment: 'center',
          })
          if (!cancelled) setGsiReady(true)
        }
      } catch (loginError) {
        if (!cancelled) {
          setError(loginError instanceof Error ? loginError.message : 'Erro ao carregar Google')
          setGsiReady(false)
          setShowFallback(true)
        }
      }
    }

    setup()
    return () => { cancelled = true }
  }, [clientId, signInWithGoogle])

  useEffect(() => {
    const preventCtrlWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault()
    }
    const preventCtrlKeys = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) e.preventDefault()
    }
    const preventGesture = (e: Event) => { e.preventDefault() }
    window.addEventListener('wheel', preventCtrlWheel, { passive: false })
    window.addEventListener('keydown', preventCtrlKeys)
    document.addEventListener('gesturestart', preventGesture)
    document.addEventListener('gesturechange', preventGesture)
    return () => {
      window.removeEventListener('wheel', preventCtrlWheel)
      window.removeEventListener('keydown', preventCtrlKeys)
      document.removeEventListener('gesturestart', preventGesture)
      document.removeEventListener('gesturechange', preventGesture)
    }
  }, [])

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: '#000',
      touchAction: 'none',
    }}>
      <div style={{
        position: 'relative',
        width: 'calc(100vw / 1.35)',
        height: 'calc(100vh / 1.35)',
        zoom: 1.35,
        overflow: 'hidden',
      }}>
      <img
        src={assetUrl('login-wallpaper.jpg')}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: Math.random() * 2 + 0.5 + 'px',
            height: Math.random() * 2 + 0.5 + 'px',
            background: '#fff',
            borderRadius: '50%',
            opacity: 0.4,
            left: Math.random() * 100 + '%',
            top: Math.random() * 100 + '%',
            animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
            animationDelay: Math.random() * 2 + 's',
          }} />
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 2vw, 16px)' }}>
          <div style={{
            width: 'min(420px, calc((100vw - 32px) / 1.35))',
            padding: 'clamp(24px, 5vw, 48px) clamp(20px, 4vw, 40px)',
            borderRadius: 16,
            border: '2px solid #4ade80',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            textAlign: 'center',
            boxShadow: '0 0 60px rgba(74, 222, 128, 0.25), inset 0 0 40px rgba(74, 222, 128, 0.08)',
          }}>
            <div style={{ marginBottom: 'clamp(16px, 3vw, 32px)' }}>
              <img src={assetUrl('Logo.png')} alt="Friends Space Beta Logo" style={{
                width: 'clamp(84px, 14vw, 120px)',
                height: 'clamp(108px, 19vw, 156px)',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
                animation: 'float 3s ease-in-out infinite',
              }} />
            </div>

            <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Boas-vindas de <span style={{ color: '#4ade80' }}>volta!</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(13px, 2vw, 16px)', marginBottom: 'clamp(24px, 4vw, 40px)' }}>
              Estamos muito animados em te ver novamente!
            </p>

            {loading && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 16 }}>Entrando...</p>
            )}

            <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />

            {!gsiReady && !loading && !error && (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 12 }}>Carregando botao do Google...</p>
            )}

            {showFallback && !loading && (
              <a
                href={isElectron ? undefined : buildGoogleAuthUrl()}
                onClick={(e) => { if (isElectron) { e.preventDefault(); void signInWithElectron() } else { setError('') } }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                marginTop: 12, width: '100%', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto',
                padding: '11px 16px', borderRadius: 999, background: '#fff', color: '#333',
                fontSize: 14, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.5 29.4 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.3-.1-2.6-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 12.8 24 12.8c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.5 29.4 4.5 24 4.5 16.4 4.5 9.9 8.6 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.4-4.6 2.3-7.3 2.3-5 0-9.4-3.1-11.2-7.5l-6.5 5C9.7 39.2 16.3 43.5 24 43.5z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.7 37.2 43.5 32.5 43.5 24c0-1.3-.1-2.6-.4-3.9z"/>
              </svg>
              Continuar com o Google
            </a>
            )}

            {error && (
              <p style={{ marginTop: 20, color: '#f87171', fontSize: 13, lineHeight: 1.4 }}>{error}</p>
            )}
            <p style={{ marginTop: 14, color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 1.5 }}>
              backend: {diagBackend} · google: {typeof window !== 'undefined' && (window as any).google ? 'ok' : '...'} · {clientId ? clientId.slice(0, 12) + '…' : 'sem-id'}
            </p>
            {loading && loginStep && (
              <p style={{ marginTop: 8, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{loginStep}</p>
            )}
            {staleApp && (
              <p style={{ marginTop: 8, color: '#f0b429', fontSize: 13, fontWeight: 700 }}>Versão antiga! Recarregue com Ctrl+Shift+R</p>
            )}
          </div>
        </main>

        <footer style={{ padding: 'clamp(12px, 2vw, 24px) clamp(16px, 4vw, 32px)', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, flexShrink: 0 }}>
          &copy; 2026 Friends Space Beta. Todos os direitos reservados.
        </footer>
      </div>

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.8; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0); } }
          @keyframes twinkle { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.5; } }
        }
      `}</style>
      </div>
    </div>
  )
}
