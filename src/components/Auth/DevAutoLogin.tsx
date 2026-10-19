import { useEffect, useState } from 'react'
import { useUserStore } from '../../stores/userStore'
import { GoogleLoginView } from './GoogleLoginView'

// Ponte de desenvolvimento: no localhost o login Google e pulado.
// Entra direto com uma conta local criada pelo proprio backend (signInWithName),
// para conseguir testar o app de verdade (amigos, call, etc.) sem passar pelo OAuth.
// Nome da conta: ?dev=Nome na URL  >  localStorage "friends-space:dev-name"  >  "Dev Local".
const DEV_NAME_KEY = 'friends-space:dev-name'
const DEV_KEY = String((import.meta.env.VITE_DEV_LOGIN_KEY as string | undefined) || '').trim()

function resolveDevName(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('dev')
    if (fromUrl && fromUrl.trim()) return fromUrl.trim().slice(0, 24)
    const stored = window.localStorage.getItem(DEV_NAME_KEY)
    if (stored && stored.trim()) return stored.trim().slice(0, 24)
  } catch { }
  return 'Dev Local'
}

export function DevAutoLogin() {
  const signInWithName = useUserStore(state => state.signInWithName)
  const currentUser = useUserStore(state => state.currentUser)
  const [error, setError] = useState('')
  const [showGoogle, setShowGoogle] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [devName] = useState(resolveDevName)

  useEffect(() => {
    if (currentUser || showGoogle || !DEV_KEY) return
    setError('')
    void signInWithName(devName, DEV_KEY).catch((e) => {
      setError(e instanceof Error ? e.message : 'Falha ao entrar localmente')
    })
  }, [signInWithName, devName, currentUser, showGoogle, attempt])

  if (currentUser) return null
  if (!DEV_KEY || showGoogle) return <GoogleLoginView />

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: '#0b0f14', color: '#e7ecee', fontFamily: 'Inter, sans-serif',
      padding: 24, textAlign: 'center',
    }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        Localhost: pulando o login Google
      </p>
      <p style={{ margin: 0, fontSize: 13, color: '#9fb0bb' }}>
        Entrando como <b>{devName}</b>...
      </p>
      {error && (
        <>
          <p style={{ margin: 0, fontSize: 12.5, color: '#f87171', maxWidth: 440, lineHeight: 1.5 }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setAttempt(a => a + 1)}
              style={{ background: '#23a55a', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Tentar de novo
            </button>
            <button
              onClick={() => setShowGoogle(true)}
              style={{ background: 'transparent', color: '#9fb0bb', border: '1px solid #2a3640', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Entrar com Google
            </button>
          </div>
        </>
      )}
    </div>
  )
}
