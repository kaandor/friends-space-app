import { Check, ChevronRight, Rocket } from 'lucide-react'
import type { Server } from '../../types'

interface ChecklistItem {
  label: string
  hint: string
  done: boolean
  section: string
}

export function ServerChecklist({ server, onNavigate }: { server: Server; onNavigate: (section: string) => void }) {
  const channels = server.channels || []
  const items: ChecklistItem[] = [
    { label: 'Adicione um ícone', hint: 'Dê uma cara ao seu servidor.', done: Boolean(server.photoUrl), section: 'config' },
    { label: 'Escolha um banner', hint: 'Uma capa deixa o perfil mais bonito.', done: Boolean(server.bannerUrl), section: 'config' },
    { label: 'Escreva uma descrição', hint: 'Explique o propósito da comunidade.', done: Boolean(server.description?.trim()), section: 'config' },
    { label: 'Crie 2 canais de texto', hint: 'Um para conversa e outro para avisos.', done: channels.filter(channel => channel.type === 'text').length >= 2, section: 'canais' },
    { label: 'Crie um canal de voz', hint: 'Para calls e momentos ao vivo.', done: channels.some(channel => channel.type === 'voice'), section: 'canais' },
    { label: 'Configure os cargos', hint: 'Organize permissões da equipe.', done: (server.roles || []).length >= 2, section: 'cargos' },
    { label: 'Crie um evento', hint: 'Reúna a galera em um horário.', done: (server.events || []).length > 0, section: 'eventos' },
    { label: 'Ative o boas-vindas', hint: 'Receba novos membros com carinho.', done: Boolean(server.settings?.toggles?.welcome), section: 'visao_comunidade' },
  ]
  const done = items.filter(item => item.done).length

  return (
    <section className="ssw-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--accent)' }}><Rocket size={16} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 800 }}>Checklist do servidor</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{done} de {items.length} passos concluídos</div>
        </div>
        <strong style={{ color: 'var(--accent)', fontSize: 13 }}>{Math.round((done / items.length) * 100)}%</strong>
      </div>
      <div className="fs-achievement-progress" style={{ marginBottom: 10 }}><span style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></div>
      <div className="fs-checklist">
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            className={`fs-checklist-row${item.done ? ' is-done' : ''}`}
            onClick={() => onNavigate(item.section)}
            style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
          >
            <span className="fs-checklist-mark">{item.done ? <Check size={12} /> : '·'}</span>
            <span className="fs-checklist-copy">
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </span>
            <ChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
          </button>
        ))}
      </div>
    </section>
  )
}
