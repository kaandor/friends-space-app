import { useEffect, useRef, useState } from 'react'
import { BookOpen, Camera, CameraOff, Eraser, FileText, Hand, Maximize2, Mic, MicOff, MonitorUp, PenLine, PhoneOff, Presentation, ScreenShareOff, Users, Video } from 'lucide-react'
import { useCallStore, type MeetingStage, type WhiteboardStroke } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { Avatar } from '../ui/Avatar'
import { CameraOverlay } from './CameraOverlay'
import { parseYouTubeId } from './WatchPartyModal'

function StreamVideo({ stream, muted = false }: { stream: MediaStream | null; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (element.srcObject !== stream) element.srcObject = stream
    if (stream) void element.play().catch(() => { })
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
}

function MediaStage({ url }: { url: string }) {
  const youtube = parseYouTubeId(url)
  if (youtube) {
    return <iframe title="Vídeo da reunião" src={`https://www.youtube.com/embed/${youtube}?autoplay=1&rel=0`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen style={{ border: 0, width: '100%', height: '100%' }} />
  }
  if (/\.(mp4|webm|ogv)(\?|$)/i.test(url)) {
    return <video src={url} controls autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
  }
  return <iframe title="Conteúdo da reunião" src={url} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen style={{ border: 0, width: '100%', height: '100%', background: '#fff' }} />
}

function Whiteboard({ readOnly, strokes, color, size, onAdd, onClear, onColor }: {
  readOnly: boolean
  strokes: WhiteboardStroke[]
  color: string
  size: number
  onAdd: (stroke: WhiteboardStroke) => void
  onClear: () => void
  onColor: (color: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState<WhiteboardStroke | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = () => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ratio = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#f7f7f2'
    context.fillRect(0, 0, width, height)
    const all = drawing ? [...strokes, drawing] : strokes
    for (const stroke of all) {
      if (stroke.points.length < 2) continue
      context.strokeStyle = stroke.color
      context.lineWidth = Math.max(1, stroke.size * (width / 1000))
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * width
        const y = point.y * height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    }
  }

  useEffect(draw, [strokes, drawing])
  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  const pointsFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / Math.max(1, rect.width), y: (event.clientY - rect.top) / Math.max(1, rect.height) }
  }

  return (
    <div className="meet-whiteboard-wrap">
      <div ref={containerRef} className="meet-whiteboard">
        <canvas
          ref={canvasRef}
          onPointerDown={event => {
            if (readOnly) return
            event.currentTarget.setPointerCapture(event.pointerId)
            setDrawing({ color, size, points: [pointsFromEvent(event)] })
          }}
          onPointerMove={event => {
            if (readOnly || !drawing) return
            setDrawing(previous => previous ? { ...previous, points: [...previous.points, pointsFromEvent(event)] } : previous)
          }}
          onPointerUp={() => {
            if (readOnly) return
            if (drawing && drawing.points.length > 1) onAdd(drawing)
            setDrawing(null)
          }}
          onPointerCancel={() => setDrawing(null)}
        />
      </div>
      {!readOnly && (
        <div className="meet-whiteboard-tools">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}><PenLine size={13} /> Lousa</span>
          {['#111827', '#e11d48', '#2563eb', '#059669', '#d97706'].map(option => (
            <button key={option} onClick={() => onColor(option)} style={{ width: 20, height: 20, borderRadius: '50%', background: option, border: option === color ? '2px solid #fff' : '1px solid rgba(0,0,0,.25)', cursor: 'pointer' }} title={option} />
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{size}px</span>
          <button onClick={onClear} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 7, padding: '5px 9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
            <Eraser size={12} /> Limpar
          </button>
        </div>
      )}
    </div>
  )
}

export function MeetingRoom() {
  const meeting = useCallStore(s => s.meeting)
  const whiteboard = useCallStore(s => s.meetingWhiteboard)
  const participants = useCallStore(s => s.participants)
  const activeCall = useCallStore(s => s.activeCall)
  const localStream = useCallStore(s => s.localStream)
  const remoteStreams = useCallStore(s => s.remoteStreams)
  const remoteScreenStreams = useCallStore(s => s.remoteScreenStreams)
  const screenSharing = useCallStore(s => s.screenSharing)
  const screenStream = useCallStore(s => s.screenStream)
  const cameraOn = useCallStore(s => s.cameraOn)
  const muted = useCallStore(s => s.muted)
  const deafened = useCallStore(s => s.deafened)
  const hostUserId = useCallStore(s => s.hostUserId)
  const toggleMute = useCallStore(s => s.toggleMute)
  const toggleDeafen = useCallStore(s => s.toggleDeafen)
  const toggleCamera = useCallStore(s => s.toggleCamera)
  const toggleScreenShare = useCallStore(s => s.toggleScreenShare)
  const endCall = useCallStore(s => s.endCall)
  const stopMeeting = useCallStore(s => s.stopMeeting)
  const setMeetingPresenter = useCallStore(s => s.setMeetingPresenter)
  const setMeetingStage = useCallStore(s => s.setMeetingStage)
  const setMeetingDocument = useCallStore(s => s.setMeetingDocument)
  const setMeetingVideo = useCallStore(s => s.setMeetingVideo)
  const addStroke = useCallStore(s => s.addMeetingStroke)
  const clearWhiteboard = useCallStore(s => s.clearMeetingWhiteboard)
  const syncWhiteboard = useCallStore(s => s.syncMeetingWhiteboard)
  const requestWhiteboard = useCallStore(s => s.requestMeetingWhiteboard)
  const me = useUserStore(s => s.currentUser)
  const [documentUrl, setDocumentUrl] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [boardColor, setBoardColor] = useState('#111827')
  const boardSize = 4

  useEffect(() => {
    if (!meeting || !me) return
    if (meeting.presenterId === me.id) syncWhiteboard()
    else requestWhiteboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.presenterId])

  useEffect(() => {
    if (!activeCall || !meeting || !me) return
    const iAmHost = hostUserId === me.id || meeting.startedBy === me.id
    if (!iAmHost || meeting.presenterId === me.id) return
    if (participants.some(person => person.userId === meeting.presenterId)) return
    setMeetingPresenter(me.id, me.name)
  }, [activeCall, hostUserId, me, meeting, participants, setMeetingPresenter])

  if (!activeCall || !meeting || !me) return null
  const isPresenter = meeting.presenterId === me.id
  const isHost = hostUserId === me.id || meeting.startedBy === me.id
  const canManage = isPresenter || isHost
  const presenterScreen = meeting.presenterId === me.id ? screenStream : (remoteScreenStreams[meeting.presenterId] || null)
  const rawPresenterCamera = meeting.presenterId === me.id ? (cameraOn ? localStream : null) : (remoteStreams[meeting.presenterId] || null)
  let presenterHasVideo = false
  try { presenterHasVideo = Boolean(rawPresenterCamera && rawPresenterCamera.getVideoTracks().length > 0) } catch { presenterHasVideo = false }
  const presenterCamera = presenterHasVideo ? rawPresenterCamera : null
  const people = [
    { userId: me.id, userName: me.name, userPhoto: me.photoUrl, stream: cameraOn ? localStream : null },
    ...participants.filter(person => person.userId !== me.id).map(person => {
      const stream = remoteStreams[person.userId] || null
      let hasVideo = false
      try { hasVideo = Boolean(stream && stream.getVideoTracks().length > 0) } catch { hasVideo = false }
      return { ...person, stream: hasVideo ? stream : null }
    }),
  ]

  const stageLabel: Record<MeetingStage, string> = {
    screen: 'Tela',
    camera: 'Câmera',
    whiteboard: 'Lousa',
    document: 'Documento',
    video: 'Vídeo',
  }

  const chooseDocument = (file: File) => {
    if (file.size > 160_000) {
      window.dispatchEvent(new CustomEvent('friends-space:toast', { detail: 'Arquivo acima de 160 KB. Use um link (Drive, PDF online) para compartilhar.' }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setMeetingDocument(reader.result, file.name)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="meet-room" style={{ position: 'fixed', inset: 0, zIndex: 1580, background: 'linear-gradient(180deg, #080d16, #0b1220 60%, #060a12)', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <header className="meet-header">
        <span className="meet-badge"><Presentation size={14} /> MODO REUNIÃO</span>
        <div className="meet-title">
          <strong>{meeting.topic}</strong>
          <span>{meeting.presenterName || 'Apresentador'} conduz à sala de aula com uma tela</span>
        </div>
        <span className="meet-count"><Users size={13} /> {people.length}</span>
        {canManage && (
          <select
            className="meet-presenter-select"
            value={meeting.presenterId}
            onChange={event => {
              const id = event.target.value
              const person = people.find(item => item.userId === id)
              if (person) setMeetingPresenter(person.userId, person.userName)
            }}
            title="Trocar quem apresenta"
          >
            {people.map(person => <option key={person.userId} value={person.userId}>{person.userId === me.id ? 'Eu apresento' : `${person.userName} apresenta`}</option>)}
          </select>
        )}
        <button className="meet-close" onClick={() => { if (isHost) stopMeeting(); else endCall() }} title={isHost ? 'Encerrar reunião para todos' : 'Sair da reunião'}>
          <PhoneOff size={16} />
        </button>
      </header>

      <div className="meet-body">
        <main className="meet-stage">
          <div className="meet-stage-bar">
            <span><Hand size={13} /> {stageLabel[meeting.stage]}</span>
            {isPresenter && (
              <div className="meet-stage-tabs">
                <button className={meeting.stage === 'screen' ? 'active' : ''} onClick={() => setMeetingStage('screen')}><MonitorUp size={13} /> Tela</button>
                <button className={meeting.stage === 'camera' ? 'active' : ''} onClick={() => setMeetingStage('camera')}><Camera size={13} /> Câmera</button>
                <button className={meeting.stage === 'whiteboard' ? 'active' : ''} onClick={() => setMeetingStage('whiteboard')}><PenLine size={13} /> Lousa</button>
                <button className={meeting.stage === 'document' ? 'active' : ''} onClick={() => setMeetingStage('document')}><FileText size={13} /> Documento</button>
                <button className={meeting.stage === 'video' ? 'active' : ''} onClick={() => setMeetingStage('video')}><Video size={13} /> Vídeo</button>
              </div>
            )}
            {isPresenter && meeting.stage === 'screen' && (
              <button className={`meet-share ${screenSharing ? 'active' : ''}`} onClick={() => void toggleScreenShare()}>
                {screenSharing ? <ScreenShareOff size={13} /> : <Maximize2 size={13} />} {screenSharing ? 'Parar tela' : 'Compartilhar tela'}
              </button>
            )}
            {isPresenter && meeting.stage === 'camera' && (
              <button className={`meet-share ${cameraOn ? 'active' : ''}`} onClick={() => void toggleCamera()}>
                {cameraOn ? <CameraOff size={13} /> : <Camera size={13} />} {cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
              </button>
            )}
          </div>

          <div className="meet-stage-content">
            {meeting.stage === 'screen' && (
              presenterScreen
                ? <StreamVideo stream={presenterScreen} muted={meeting.presenterId === me.id} />
                : <div className="meet-empty"><MonitorUp size={34} /><strong>{isPresenter ? 'Compartilhe sua tela' : `${meeting.presenterName || 'O apresentador'} ainda não compartilhou a tela`}</strong><span>A reunião usa uma tela principal.</span></div>
            )}
            {meeting.stage === 'camera' && (
              presenterCamera
                ? <StreamVideo stream={presenterCamera} muted={meeting.presenterId === me.id} />
                : <div className="meet-empty"><Camera size={34} /><strong>{isPresenter ? 'Ligue sua câmera' : 'Câmera desligada'}</strong><span>Quem apresenta aparece no telão.</span></div>
            )}
            {meeting.stage === 'whiteboard' && (
              <Whiteboard readOnly={!isPresenter} strokes={whiteboard} color={boardColor} size={boardSize} onAdd={addStroke} onClear={clearWhiteboard} onColor={setBoardColor} />
            )}
            {meeting.stage === 'document' && (
              <div className="meet-document">
                {isPresenter && (
                  <div className="meet-doc-tools">
                    <label className="meet-file-btn"><FileText size={13} /> Anexar arquivo<input type="file" accept="image/*,.pdf,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) chooseDocument(file) }} /></label>
                    <input value={documentUrl} onChange={event => setDocumentUrl(event.target.value)} placeholder="ou cole um link de documento" />
                    <button onClick={() => { if (documentUrl.trim()) setMeetingDocument(documentUrl.trim(), 'Documento') }}>Abrir link</button>
                  </div>
                )}
                {meeting.documentUrl ? (
                  /^data:image\//.test(meeting.documentUrl) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(meeting.documentUrl)
                    ? <img src={meeting.documentUrl} alt={meeting.documentName || 'Documento'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} />
                    : <iframe title={meeting.documentName || 'Documento'} src={meeting.documentUrl} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
                ) : <div className="meet-empty"><BookOpen size={34} /><strong>Nenhum documento na tela</strong><span>{isPresenter ? 'Anexe uma imagem/PDF ou cole um link.' : 'Aguarde o apresentador abrir o documento.'}</span></div>}
              </div>
            )}
            {meeting.stage === 'video' && (
              <div className="meet-document">
                {isPresenter && (
                  <div className="meet-doc-tools">
                    <input value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="Link do YouTube ou vídeo .mp4" />
                    <button onClick={() => { if (videoUrl.trim()) setMeetingVideo(videoUrl.trim()) }}>Tocar para todos</button>
                  </div>
                )}
                {meeting.videoUrl ? <MediaStage url={meeting.videoUrl} /> : <div className="meet-empty"><Video size={34} /><strong>Nenhum vídeo na tela</strong><span>{isPresenter ? 'Cole um link para tocar na reunião.' : 'Aguarde o apresentador iniciar o vídeo.'}</span></div>}
              </div>
            )}
          </div>
        </main>

        <aside className="meet-people">
          <div className="meet-people-head"><Users size={13} /> Na reunião <span>{people.length}</span></div>
          <div className="meet-people-list">
            {people.map(person => (
              <div key={person.userId} className={`meet-person${person.userId === meeting.presenterId ? ' presenter' : ''}`}>
                <div className="meet-person-photo">
                  {person.stream ? <StreamVideo stream={person.stream} muted /> : <Avatar src={person.userPhoto} name={person.userName} size={34} />}
                </div>
                <div className="meet-person-copy">
                  <strong>{person.userId === me.id ? 'Você' : person.userName}</strong>
                  <span>{person.userId === meeting.presenterId ? 'Apresentando' : 'Assistindo'}</span>
                </div>
                {person.userId === meeting.presenterId ? <span className="meet-live-dot" /> : null}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="meet-controls">
        <button className={muted ? 'off' : ''} onClick={toggleMute}>{muted ? <MicOff size={19} /> : <Mic size={19} />}<span>{muted ? 'Ativar mic' : 'Mutar'}</span></button>
        <button className={deafened ? 'off' : ''} onClick={toggleDeafen}>{deafened ? <MicOff size={19} /> : <Mic size={19} />}<span>{deafened ? 'Som off' : 'Som'}</span></button>
        <button className={cameraOn ? 'active' : ''} onClick={() => void toggleCamera()}><Camera size={19} /><span>Câmera</span></button>
        <button className={screenSharing ? 'active' : ''} onClick={() => void toggleScreenShare()}><MonitorUp size={19} /><span>Tela</span></button>
        <button className="danger" onClick={() => { if (isHost) stopMeeting(); else endCall() }}><PhoneOff size={19} /><span>{isHost ? 'Encerrar' : 'Sair'}</span></button>
      </footer>
      <CameraOverlay />
    </div>
  )
}

