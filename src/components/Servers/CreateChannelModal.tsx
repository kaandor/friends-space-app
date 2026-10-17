import { Fa } from '../../utils/fa'
import { useEffect, useState } from 'react'
import type { ServerCategory } from '../../types'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'

interface CreateChannelModalProps {
  open: boolean
  initialType?: 'text' | 'voice'
  initialCategoryId?: string
  categories: ServerCategory[]
  onClose: () => void
  onCreate: (name: string, type: 'text' | 'voice', categoryId?: string) => Promise<void> | void
}

function slugPreview(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40) || 'nome-do-canal'
}

export function CreateChannelModal({ open, initialType = 'text', initialCategoryId = '', categories, onClose, onCreate }: CreateChannelModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'voice'>(initialType)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName('')
      setType(initialType)
      setCategoryId(initialCategoryId)
      setError('')
      setBusy(false)
    }
  }, [open, initialType, initialCategoryId])

  if (!open) return null

  const categoryName = categories.find(c => c.id === categoryId)?.name
  const valid = name.trim().length >= 1 && name.trim().length <= 40

  const handleCreate = async () => {
    if (!valid || busy) return
    const finalName = type === 'text' ? slugPreview(name) : name.trim().slice(0, 40)
    if (!finalName) { setError('Dê um nome para o canal.'); return }
    setBusy(true)
    setError('')
    try {
      await onCreate(finalName, type, categoryId || undefined)
      onClose()
    } catch {
      setError('Não foi possível criar o canal. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const card = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 12,
    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--bg-tertiary))' : 'var(--bg-tertiary)',
    cursor: 'pointer',
    textAlign: 'left',
  })

  return (
    <Modal open={open} onClose={onClose} title="Criar canal">
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>
        {categoryName
          ? <>Novo canal dentro de <strong style={{ color: 'var(--text-primary)' }}>{categoryName}</strong></>
          : 'Novo canal no servidor. Escolha o tipo e onde ele vai ficar.'}
      </p>

      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Tipo de canal
      </p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={() => setType('text')} style={card(type === 'text')}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Fa name="hashtag" size={16} style={{  color: type === 'text' ? 'var(--text-primary)' : 'var(--text-muted)' }} />
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Texto</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Converse por mensagens</span>
          </span>
          {type === 'text' && <Fa name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--text-primary)' }} />}
        </button>
        <button type="button" onClick={() => setType('voice')} style={card(type === 'voice')}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Fa name="volume-high" size={16} style={{  color: type === 'voice' ? 'var(--text-primary)' : 'var(--text-muted)' }} />
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Voz</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Converse por áudio</span>
          </span>
          {type === 'voice' && <Fa name="check" size={14} style={{ marginLeft: 'auto', color: 'var(--text-primary)' }} />}
        </button>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Nome do canal
      </p>
      <Input
        value={name}
        onChange={setName}
        placeholder={type === 'text' ? 'Ex: novidades, clips, ajuda' : 'Ex: Resenha, Partida 1'}
        maxLength={40}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
      />
      {type === 'text' && name.trim() && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Vai ficar assim: <code style={{ color: 'var(--text-primary)' }}># {slugPreview(name)}</code>
        </p>
      )}

      {categories.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-secondary)', margin: '14px 0 8px' }}>
            Categoria
          </p>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }}
          >
            <option value="">Sem categoria (lista principal)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}

      {error && <p style={{ fontSize: 12, color: '#ed4245', margin: '10px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void handleCreate()} disabled={!valid || busy}>
          {busy ? 'Criando...' : 'Criar canal'}
        </Button>
      </div>
    </Modal>
  )
}

interface CreateCategoryModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void> | void
}

export function CreateCategoryModal({ open, onClose, onCreate }: CreateCategoryModalProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setName(''); setError(''); setBusy(false) }
  }, [open ])

  if (!open) return null
  const valid = name.trim().length >= 1 && name.trim().length <= 40

  const handleCreate = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await onCreate(name.trim())
      onClose()
    } catch {
      setError('Não foi possível criar a categoria. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Criar categoria">
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>
        Categorias agrupam canais. Ex: <strong style={{ color: 'var(--text-primary)' }}>Comunidade, Jogos, Estudos</strong>
      </p>
      <Input
        value={name}
        onChange={setName}
        placeholder="Nome da categoria"
        maxLength={40}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
      />
      {error && <p style={{ fontSize: 12, color: '#ed4245', margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void handleCreate()} disabled={!valid || busy}>
          {busy ? 'Criando...' : 'Criar categoria'}
        </Button>
      </div>
    </Modal>
  )
}

interface RenameCategoryModalProps {
  open: boolean
  currentName: string
  onClose: () => void
  onRename: (name: string) => Promise<void> | void
}
export function RenameCategoryModal({ open, currentName, onClose, onRename }: RenameCategoryModalProps) {
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(currentName); setBusy(false) }
  }, [open, currentName])

  if (!open) return null
  const valid = name.trim().length >= 1 && name.trim().length <= 40

  const handleSave = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onRename(name.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Renomear categoria">
      <Input
        value={name}
        onChange={setName}
        placeholder="Nome da categoria"
        maxLength={40}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void handleSave()} disabled={!valid || busy}>
          {busy ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </Modal>
  )
}

interface RenameChannelModalProps {
  open: boolean
  currentName: string
  channelType: 'text' | 'voice'
  onClose: () => void
  onRename: (name: string) => Promise<void> | void
}

export function RenameChannelModal({ open, currentName, channelType, onClose, onRename }: RenameChannelModalProps) {
  const [name, setName] = useState(currentName)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setName(currentName); setBusy(false) }
  }, [open, currentName])

  if (!open) return null
  const valid = name.trim().length >= 1 && name.trim().length <= 40

  const handleSave = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onRename(name.trim())
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Renomear canal de ${channelType === 'text' ? 'texto' : 'voz'}`}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Fa name={channelType === 'text' ? 'hashtag' : 'volume-high'} size={13} style={{ color: 'var(--text-primary)' }} />
        {channelType === 'text' ? 'O nome fica em minúsculo com - no lugar de espaço.' : 'Dê o nome que você quiser.'}
      </p>
      <Input
        value={name}
        onChange={setName}
        placeholder={channelType === 'text' ? 'Ex: novidades' : 'Ex: Resenha'}
        maxLength={40}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') void handleSave() }}
      />
      {channelType === 'text' && name.trim() && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0' }}>
          Vai ficar assim: <code style={{ color: 'var(--text-primary)' }}># {slugPreview(name)}</code>
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void handleSave()} disabled={!valid || busy}>
          {busy ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </Modal>
  )
}
