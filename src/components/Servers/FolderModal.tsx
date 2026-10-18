import { useEffect, useState } from 'react'
import { Fa } from '../../utils/fa'
import { toImageUrl } from '../../services/driveService'
import type { Server, ServerFolder } from '../../types'

interface FolderModalProps {
  open: boolean
  folder: ServerFolder | null
  servers: Server[]
  initialServerIds?: string[]
  onClose: () => void
  onSave: (name: string, serverIds: string[]) => void
}

export function FolderModal({ open, folder, servers, initialServerIds, onClose, onSave }: FolderModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setName(folder?.name || '')
      setSelected(folder ? [...(folder.serverIds || [])] : [...(initialServerIds || [])])
    }
  }, [open, folder, initialServerIds])

  if (!open) return null

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const save = () => {
    if (!name.trim()) return
    onSave(name.trim(), selected)
  }

  return (
    <div className="fs-folder-overlay" onClick={onClose}>
      <div className="fs-folder-modal" role="dialog" aria-modal="true" aria-label={folder ? 'Personalizar pasta' : 'Criar pasta'} onClick={e => e.stopPropagation()}>
        <header className="fs-folder-header">
          <span className="fs-folder-header-icon"><Fa name="folder" size={15} /></span>
          <div>
            <h2>{folder ? 'Personalizar pasta' : 'Criar pasta'}</h2>
            <p>{folder ? 'Renomeie e ajuste os servidores da pasta.' : 'Dê um nome e escolha os servidores que ficarao nela.'}</p>
          </div>
        </header>

        <div className="fs-folder-body">
          <label className="fs-folder-label" htmlFor="fs-folder-name">Nome da pasta</label>
          <input
            id="fs-folder-name"
            className="fs-folder-input"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            placeholder="Ex: Jogos, Escola, Familia..."
            autoFocus
          />

          <div className="fs-folder-label-row">
            <span className="fs-folder-label">Servidores</span>
            <span className="fs-folder-count">{selected.length} selecionado{selected.length === 1 ? '' : 's'}</span>
          </div>

          {servers.length === 0 ? (
            <p className="fs-folder-empty">Voce ainda nao esta em nenhum servidor.</p>
          ) : (
            <div className="fs-folder-list">
              {servers.map(server => {
                const checked = selected.includes(server.id)
                return (
                  <button
                    type="button"
                    key={server.id}
                    className={`fs-folder-server ${checked ? 'is-checked' : ''}`}
                    onClick={() => toggle(server.id)}
                    aria-pressed={checked}
                  >
                    {server.photoUrl ? (
                      <img src={toImageUrl(server.photoUrl)} alt="" />
                    ) : (
                      <span className="fs-folder-server-fallback">{server.name.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="fs-folder-server-name">{server.name}</span>
                    <span className="fs-folder-check">{checked ? <Fa name="check" size={11} /> : null}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <footer className="fs-folder-footer">
          <button className="fs-folder-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="fs-folder-btn primary" onClick={save} disabled={!name.trim()}>
            {folder ? 'Salvar' : 'Criar pasta'}
          </button>
        </footer>
      </div>
    </div>
  )
}
