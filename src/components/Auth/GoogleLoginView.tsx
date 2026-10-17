import { useEffect, useMemo, useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { getGoogleClientId, getGoogleClientSecret, loadGoogleIdentityScript, parseAccessTokenFromHash, getGoogleProfileFromAccessToken, buildGoogleAuthUrl } from '../../services/googleAuth'
import { loadKnownAccounts, removeKnownAccount, type KnownAccount } from '../../services/knownAccounts'
import { assetUrl } from '../../utils/assets'

type GsiOauth2 = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    prompt?: string
    login_hint?: string
    callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void
    error_callback?: (err: { type?: string }) => void
  }) => { requestAccessToken: () => void }
}

const AVATAR_COLORS = ['#5865f2', '#3b82f6', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#23a55a', '#ef4444']

function avatarColor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function AccountAvatar({ account }: { account: KnownAccount }) {
  const [failed, setFailed] = useState(false)
  const initial = (account.name || account.email || '?').trim().charAt(0).toUpperCase() || '?'
  if (account.photoUrl && !failed) {
    return (
      <img
        src={account.photoUrl}
        alt=""
        onError={() => setFailed(true)}
        style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: avatarColor(account.googleId || account.email),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: 16,
    }}>{initial}</div>
  )
}

export function GoogleLoginView() {
  const signInWithGoogle = useUserStore(state => state.signInWithGoogle)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginStep, setLoginStep] = useState('')
  const [staleApp, setStaleApp] = useState(false)
  const [accounts, setAccounts] = useState<KnownAccount[]>([])
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const clientId = getGoogleClientId()
  const isElectron = typeof window !== 'undefined' && Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron)

  const stars = useMemo(() => Array.from({ length: 60 }).map(() => ({
    size: Math.random() * 2 + 0.5,
    left: Math.random() * 100,
    top: Math.random() * 100,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
  })), [])

  useEffect(() => {
    setAccounts(loadKnownAccounts())
    // Pre-carrega o script do Google: o popup precisa abrir DENTRO do clique
    // (sem await no meio, senao o navegador bloqueia).
    if (!isElectron) {
      loadGoogleIdentityScript().catch(() => { })
    }
  }, [isElectron])

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

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

  // Retorno do fluxo de redirecionamento (#access_token=...) — usado quando o
  // script do Google nao carrega.
  useEffect(() => {
    let cancelled = false
    const hashToken = parseAccessTokenFromHash()
    if (!hashToken) return
    void (async () => {
      try {
        window.location.hash = ''
        setLoading(true)
        const profile = await getGoogleProfileFromAccessToken(hashToken)
        if (cancelled) return
        await signInWithGoogle(profile, undefined, hashToken)
        setAccounts(loadKnownAccounts())
      } catch (authError) {
        if (!cancelled) {
          setError(authError instanceof Error ? authError.message : 'Falha no login')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [signInWithGoogle])

  async function finishSignIn(accessToken: string) {
    const profile = await getGoogleProfileFromAccessToken(accessToken)
    await Promise.race([
      signInWithGoogle(profile, undefined, accessToken),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('Tempo esgotado (45s). Tente novamente.')), 45000)),
    ])
    setAccounts(loadKnownAccounts())
  }

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
      setAccounts(loadKnownAccounts())
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  function startGoogleLogin(loginHint?: string) {
    setError('')
    if (isElectron) {
      void signInWithElectron()
      return
    }
    const run = () => {
      const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: GsiOauth2 } } }).google?.accounts?.oauth2
      if (!oauth2) {
        // Ultimo recurso: redireciona para o fluxo classico do Google.
        window.location.href = buildGoogleAuthUrl()
        return
      }
      setLoading(true)
      setLoginStep('')
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        prompt: 'select_account',
        login_hint: loginHint,
        callback: (resp) => {
          void (async () => {
            try {
              if (!resp?.access_token) {
                throw new Error(resp?.error === 'popup_closed' ? 'Login cancelado' : 'Falha no login')
              }
              setLoginStep('Enviando ao servidor...')
              await finishSignIn(resp.access_token)
            } catch (authError) {
              setError(authError instanceof Error ? authError.message : 'Falha no login')
            } finally {
              setLoading(false)
              setLoginStep('')
            }
          })()
        },
        error_callback: (err) => {
          setLoading(false)
          if (err?.type !== 'popup_closed') {
            setError('Nao foi possivel abrir o login do Google. Tente novamente.')
          }
        },
      })
      try {
        tokenClient.requestAccessToken()
      } catch {
        setLoading(false)
        setError('Falha ao abrir o login do Google')
      }
    }
    if ((window as unknown as { google?: { accounts?: { oauth2?: GsiOauth2 } } }).google?.accounts?.oauth2) {
      run()
      return
    }
    setLoading(true)
    loadGoogleIdentityScript()
      .then(() => run())
      .catch(() => { window.location.href = buildGoogleAuthUrl() })
  }

  function handleRemoveAccount(googleId: string) {
    removeKnownAccount(googleId)
    setAccounts(loadKnownAccounts())
    setMenuOpen(null)
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      background: '#000',
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
        {stars.map((star, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: star.size + 'px',
            height: star.size + 'px',
            background: '#fff',
            borderRadius: '50%',
            opacity: 0.4,
            left: star.left + '%',
            top: star.top + '%',
            animation: `twinkle ${star.duration}s ease-in-out infinite`,
            animationDelay: star.delay + 's',
          }} />
        ))}
      </div>

      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 'clamp(16px, 2.5vw, 40px)',
        paddingBottom: 'clamp(40px, 13vh, 150px)',
        pointerEvents: 'none',
      }}>
        <main style={{
          width: 'min(520px, 100%)',
          pointerEvents: 'auto',
          borderRadius: 16,
          border: '1px solid rgba(130,175,255,0.22)',
          background: 'linear-gradient(180deg, rgba(12,28,70,0.60), rgba(6,14,40,0.70))',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.45), inset 0 0 60px rgba(60,110,255,0.05)',
          padding: 'clamp(18px, 2.2vw, 26px)',
        }}>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: 0.2 }}>
            Escolha uma conta
          </h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(196,214,255,0.62)', fontSize: 12.5 }}>
            Selecione uma conta para entrar ou adicione uma nova.
          </p>

          {accounts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {accounts.map(account => (
                <div key={account.googleId} className="fs-login-row" style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 10, borderRadius: 10, marginBottom: 4,
                }}>
                  <AccountAvatar account={account} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: '#fff', fontSize: 14, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{account.name}</div>
                    <div style={{ marginTop: 1, color: 'rgba(170,196,255,0.60)', fontSize: 12 }}>Entre novamente.</div>
                  </div>
                  <button
                    className="fs-login-entrar"
                    onClick={() => startGoogleLogin(account.email)}
                    disabled={loading}
                    style={{
                      background: 'rgba(90,140,255,0.16)',
                      border: '1px solid rgba(140,180,255,0.35)',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '8px 22px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: loading ? 'default' : 'pointer',
                      opacity: loading ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >Entrar</button>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      className="fs-login-dots"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(prev => prev === account.googleId ? null : account.googleId)
                      }}
                      style={{
                        background: 'transparent', border: 'none',
                        color: 'rgba(200,215,255,0.75)',
                        fontSize: 17, lineHeight: 1, letterSpacing: 1,
                        padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                      }}
                    >···</button>
                    {menuOpen === account.googleId && (
                      <div style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                        background: 'rgba(10,20,50,0.96)',
                        border: '1px solid rgba(130,175,255,0.25)',
                        borderRadius: 8, padding: 4, minWidth: 140, zIndex: 30,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                      }}>
                        <button
                          className="fs-login-menu-item"
                          onClick={(e) => { e.stopPropagation(); handleRemoveAccount(account.googleId) }}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            background: 'transparent', border: 'none',
                            color: '#ff9e9e', fontSize: 12.5, fontWeight: 600,
                            padding: '8px 12px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >Remover conta</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {accounts.length < 3 && (
            <div style={{
              marginTop: accounts.length > 0 ? 10 : 16,
              paddingTop: accounts.length > 0 ? 6 : 0,
              borderTop: accounts.length > 0 ? '1px solid rgba(130,175,255,0.12)' : 'none',
            }}>
              <button
                className="fs-login-add"
                onClick={() => startGoogleLogin()}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', background: 'transparent', border: 'none',
                  color: 'rgba(150,190,255,0.95)', fontSize: 13, fontWeight: 600,
                  padding: '10px', borderRadius: 10,
                  cursor: loading ? 'default' : 'pointer',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 300 }}>+</span>
                Adicionar uma conta
              </button>
            </div>
          )}

          {loading && (
            <p style={{ margin: '10px 0 0', color: 'rgba(196,214,255,0.7)', fontSize: 12.5, textAlign: 'center' }}>
              {loginStep || 'Entrando...'}
            </p>
          )}
          {error && (
            <p style={{ margin: '10px 0 0', color: '#f87171', fontSize: 12.5, lineHeight: 1.4, textAlign: 'center' }}>{error}</p>
          )}
          {staleApp && (
            <p style={{ margin: '8px 0 0', color: '#f0b429', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
              Versão antiga! Recarregue com Ctrl+Shift+R
            </p>
          )}
        </main>
      </div>

      <style>{`
        .fs-login-row:hover { background: rgba(120,160,255,0.08); }
        .fs-login-entrar:hover:not(:disabled) { background: rgba(90,140,255,0.30) !important; }
        .fs-login-dots:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .fs-login-add:hover:not(:disabled) { color: #fff; }
        .fs-login-menu-item:hover { background: rgba(255,255,255,0.08); }
        @keyframes twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.8; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes twinkle { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.5; } }
        }
      `}</style>
    </div>
  )
}
