import { useState } from 'react'
import type { Server } from '../../types'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useServerStore } from '../../stores/serverStore'

interface EventsModalProps {
  open: boolean
  onClose: () => void
  server: Server
  canManage: boolean
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function EventsModal({ open, onClose, server, canManage }: EventsModalProps) {
  const { addServerEvent, deleteServerEvent } = useServerStore()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const events = [...(server.events || [])].sort((a, b) => a.date - b.date)
  const upcoming = events.filter(e => e.date >= Date.now())
  const past = events.filter(e => e.date < Date.now())

  const resetForm = () => {
    setShowForm(false)
    setTitle('')
    setDescription('')
    setDate('')
    setLocation('')
    setError('')
  }

  const handleCreate = async () => {
    if (!title.trim() || !date || busy) return
    const ts = new Date(date).getTime()
    if (!Number.isFinite(ts)) { setError('Data invalida.'); return }
    setBusy(true)
    setError('')
    try {
      await addServerEvent(server.id, { title: title.trim(), description: description.trim(), date: ts, location: location.trim() })
      resetForm()
    } finally {
      setBusy(false)
    }
  }

  const minDate = new Date(Date.now() + 60000).toISOString().slice(0, 16)

  return (
    <Modal open={open} onClose={() => { onClose(); resetForm() }} title={`Eventos de ${server.name}`}>
      {canManage && !showForm && (
        <Button size="sm" onClick={() => setShowForm(true)} style={{ marginBottom: 12 }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Criar evento
        </Button>
      )}

      {canManage && showForm && (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input value={title} onChange={setTitle} placeholder="Titulo do evento *" />
          <Input value={description} onChange={setDescription} placeholder="Descricao (opcional)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="datetime-local"
              value={date}
              min={minDate}
              onChange={e => setDate(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }}
            />
            <Input value={location} onChange={setLocation} placeholder="Local (opcional)" style={{ flex: 1 }} />
          </div>
          {error && <p style={{ fontSize: 12, color: '#ed4245' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={() => void handleCreate()} disabled={busy || !title.trim() || !date}>
              {busy ? 'Criando...' : 'Criar evento'}
            </Button>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
          Nenhum evento ainda. {canManage ? 'Crie o primeiro para o servidor.' : ''}
        </p>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--text-secondary)', marginBottom: 8 }}>Proximos</h4>
          {upcoming.map(ev => (
            <EventCard key={ev.id} title={ev.title} description={ev.description} date={ev.date} location={ev.location} canManage={canManage} onDelete={() => void deleteServerEvent(server.id, ev.id)} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: 'var(--text-secondary)', marginBottom: 8 }}>Passados</h4>
          {past.map(ev => (
            <EventCard key={ev.id} title={ev.title} description={ev.description} date={ev.date} location={ev.location} canManage={canManage} onDelete={() => void deleteServerEvent(server.id, ev.id)} />
          ))}
        </div>
      )}
    </Modal>
  )
}

function EventCard({ title, description, date, location, canManage, onDelete }: {
  title: string
  description?: string
  date: number
  location?: string
  canManage: boolean
  onDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--accent)', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{new Date(date).getDate()}</span>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{new Date(date).toLocaleString([], { month: 'short' })}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(date)}{location ? ` · ${location}` : ''}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{description}</div>}
      </div>
      {canManage && (
        <button onClick={onDelete} title="Excluir evento" style={{ color: '#ed4245', padding: 4, flexShrink: 0, fontSize: 15 }}>
          <i className="fa-solid fa-trash" />
        </button>
      )}
    </div>
  )
}
