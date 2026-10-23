import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Maximize2, Minimize2, X } from 'lucide-react'
import { useCallStore } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { Avatar } from '../ui/Avatar'
import { MediaPartyPlayer } from './WatchPartyBar'

export function MediaPartyOverlay() {
  const watchParty = useCallStore(s => s.watchParty)
  const participants = useCallStore(s => s.participants)
  const stopWatchParty = useCallStore(s => s.stopWatchParty)
  const me = useUserStore(s => s.currentUser)
  const [hidden, setHidden] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const roomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (watchParty?.mode === 'cinema') setHidden(false)
  }, [watchParty?.startAt, watchParty?.mode])

  if (!watchParty || watchParty.mode !== 'cinema' || hidden) return null
  const isLeader = Boolean(me && watchParty.byUserId === me.id)
  const people = participants.length ? participants : (me ? [{ userId: me.id, userName: me.name, userPhoto: me.photoUrl, muted: false, deafened: false }] : [])

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) { void document.exitFullscreen(); setFullscreen(false); return }
      void roomRef.current?.requestFullscreen().then(() => setFullscreen(true)).catch(() => { })
    } catch { }
  }

  return (
    <div ref={roomRef} className="cinema-room" style={{ position: 'fixed', inset: 0, zIndex: 1550, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 50% 24%, #1b2742 0%, #090d18 58%, #03050a 100%)', color: '#fff' }}>
      <div className="cinema-curtain cinema-curtain-left" aria-hidden />
      <div className="cinema-curtain cinema-curtain-right" aria-hidden />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'linear-gradient(180deg, rgba(3,5,10,.8), transparent)' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(246,196,83,.14)', color: '#f6c453' }}><Clapperboard size={18} /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.14em', color: 'rgba(255,255,255,.48)' }}>SALA DE CINEMA · FRIENDS SPACE</div>
          <div style={{ fontSize: 16, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{watchParty.title}</div>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>com {watchParty.byName || 'a call'} · {people.length} pinguins</div>
        <button onClick={toggleFullscreen} title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button onClick={() => setHidden(true)} title="Ocultar cinema (continua para a call)" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} />
        </button>
        {isLeader && (
          <button onClick={stopWatchParty} style={{ border: 'none', borderRadius: 9, background: '#f04747', color: '#fff', padding: '8px 13px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Encerrar</button>
        )}
      </div>
      <div style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 34px 6px' }}>
        <div className="cinema-screen-frame" style={{ width: 'min(1180px, 94vw)', height: 'min(66vh, 680px)', borderRadius: 10, padding: 7, background: 'linear-gradient(180deg, #d6b46a, #6e5427)', boxShadow: '0 30px 90px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.1)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 5, overflow: 'hidden', background: '#000', position: 'relative' }}>
            <MediaPartyPlayer party={watchParty} big />
          </div>
        </div>
        <div className="cinema-floor" style={{ width: 'min(1200px, 96vw)', display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 16, opacity: 0.9 }}>
          {people.slice(0, 14).map(person => (
            <div key={person.userId} title={person.userName} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, padding: 2, background: 'linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.04))', border: '1px solid rgba(255,255,255,.1)' }}>
                <Avatar src={person.userPhoto} name={person.userName} size={42} />
              </div>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.userName}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="cinema-seats" aria-hidden>
        {Array.from({ length: 18 }).map((_, index) => <span key={index} />)}
      </div>
    </div>
  )
}
