// PrivacySettings — janela de privacidade (visual portado de
// "friends-space-privacidade") com os campos REAIS do app:
// solicitações de amizade, perfil público, insígnias, data de entrada
// e notificações. Salva via updateUser (settings) do usuário logado.
import { useState } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  Eye,
  Gamepad2,
  Image,
  LockKeyhole,
  Mail,
  Shield,
  UserRound,
  UsersRound,
} from 'lucide-react'
import './privacysettings.css'

type FriendReqPerm = 'todos' | 'amigosdeamigos' | 'ninguem'

const FRIEND_REQ_OPTIONS: { id: FriendReqPerm; title: string; description: string }[] = [
  { id: 'todos', title: 'Todos', description: 'Qualquer pessoa pode enviar solicitações de amizade para você.' },
  { id: 'amigosdeamigos', title: 'Amigos de Amigos', description: 'Apenas amigos em comum podem enviar solicitações.' },
  { id: 'ninguem', title: 'Ninguém', description: 'Ninguém pode enviar solicitações de amizade para você.' },
]

type PrivacyToggleKey =
  | 'allowDM'
  | 'publicProfile'
  | 'showBadges'
  | 'showJoinDate'
  | 'notifFriendAlerts'
  | 'notifDm'
  | 'notifServerMessages'
  | 'notifServerEvents'
  | 'notifCallAlerts'
  | 'notifCallInvites'
  | 'notifAstro'

type ToggleItem = {
  key: PrivacyToggleKey
  icon: typeof UserRound
  title: string
  description: string
}

const PROFILE_TOGGLES: ToggleItem[] = [
  { key: 'allowDM', icon: Mail, title: 'Permitir mensagens diretas', description: 'Permite que outros usuários iniciem conversas com você.' },
  { key: 'publicProfile', icon: Eye, title: 'Perfil público', description: 'Qualquer pessoa pode ver seu perfil público.' },
  { key: 'showBadges', icon: UsersRound, title: 'Mostrar insígnias', description: 'Exibe suas insígnias no seu perfil.' },
  { key: 'showJoinDate', icon: CalendarDays, title: 'Mostrar data de entrada', description: 'Mostra quando você entrou no Friends Space.' },
]

const NOTIFICATION_TOGGLES: ToggleItem[] = [
  { key: 'notifFriendAlerts', icon: UserRound, title: 'Avisos de amigos (online, status)', description: 'Receba avisos quando amigos ficarem online ou mudarem de status.' },
  { key: 'notifDm', icon: Mail, title: 'Mensagens diretas', description: 'Notificações de novas mensagens diretas.' },
  { key: 'notifServerMessages', icon: Bell, title: 'Mensagens em servidores', description: 'Notificações de mensagens nos servidores.' },
  { key: 'notifServerEvents', icon: Bell, title: 'Eventos de servidores', description: 'Notificações de eventos dos servidores.' },
  { key: 'notifCallAlerts', icon: Gamepad2, title: 'Atividade em calls (entrou/saiu, tela)', description: 'Avisos de atividade em chamadas de voz/vídeo.' },
  { key: 'notifCallInvites', icon: Bell, title: 'Convites para calls', description: 'Notificações de convites para chamadas.' },
  { key: 'notifAstro', icon: Image, title: 'Novidades do ASTRO', description: 'Atualizações e novidades do plano ASTRO.' },
]

interface PrivacySettingsProps {
  userSettings: Record<string, string | boolean | undefined>
  onSaveAll: (patch: Record<string, string | boolean>) => void
}

export function PrivacySettings({ userSettings, onSaveAll }: PrivacySettingsProps) {
  const strSetting = (key: string, fallback: string) => (typeof userSettings[key] === 'string' ? (userSettings[key] as string) : fallback)
  const boolSetting = (key: string, fallback: boolean) => (typeof userSettings[key] === 'boolean' ? (userSettings[key] as boolean) : fallback)

  const [friendReqPerm, setFriendReqPerm] = useState<FriendReqPerm>(strSetting('friendRequestPerm', 'todos') as FriendReqPerm)
  const [toggles, setToggles] = useState<Record<PrivacyToggleKey, boolean>>({
    allowDM: boolSetting('allowDM', true),
    publicProfile: boolSetting('publicProfile', true),
    showBadges: boolSetting('showBadges', true),
    showJoinDate: boolSetting('showJoinDate', true),
    notifFriendAlerts: boolSetting('notifFriendAlerts', true),
    notifDm: boolSetting('notifDm', true),
    notifServerMessages: boolSetting('notifServerMessages', true),
    notifServerEvents: boolSetting('notifServerEvents', true),
    notifCallAlerts: boolSetting('notifCallAlerts', true),
    notifCallInvites: boolSetting('notifCallInvites', true),
    notifAstro: boolSetting('notifAstro', true),
  })
  const [saved, setSaved] = useState(false)

  function selectFriendReq(next: FriendReqPerm) {
    setFriendReqPerm(next)
    setSaved(false)
  }

  function togglePrivacy(key: PrivacyToggleKey) {
    setToggles((current) => ({ ...current, [key]: !current[key] }))
    setSaved(false)
  }

  function saveChanges() {
    onSaveAll({ friendRequestPerm: friendReqPerm, ...toggles })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2600)
  }

  return (
    <div className="fs-privacy">
      <header className="fs-privacy-heading">
        <div className="fs-privacy-heading-icon" aria-hidden="true">
          <Shield size={24} strokeWidth={2.2} />
        </div>
        <div>
          <h1>Privacidade</h1>
          <p>Gerencie suas preferências de privacidade e controle o que é compartilhado.</p>
        </div>
      </header>

      <section className="fs-privacy-card" aria-labelledby="fs-privacy-friendreq-title">
        <div className="fs-privacy-section-heading">
          <div className="fs-privacy-section-icon" aria-hidden="true"><UsersRound size={17} /></div>
          <div>
            <h2 id="fs-privacy-friendreq-title">Solicitações de amizade</h2>
            <p>Escolha quem pode enviar solicitações de amizade para você.</p>
          </div>
        </div>
        <div className="fs-privacy-radio-list" role="radiogroup" aria-label="Solicitações de amizade">
          {FRIEND_REQ_OPTIONS.map((option) => {
            const active = friendReqPerm === option.id
            return (
              <button
                className={`fs-privacy-radio${active ? ' is-selected' : ''}`}
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => selectFriendReq(option.id)}
              >
                <span className={`fs-privacy-radio-control${active ? ' is-selected' : ''}`} aria-hidden="true">
                  {active && <span />}
                </span>
                <span className="fs-privacy-option-copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="fs-privacy-card" aria-labelledby="fs-privacy-profile-title">
        <div className="fs-privacy-section-heading">
          <div className="fs-privacy-section-icon" aria-hidden="true"><Eye size={17} /></div>
          <div>
            <h2 id="fs-privacy-profile-title">Informações do perfil</h2>
            <p>Controle a visibilidade das suas informações.</p>
          </div>
        </div>
        <div className="fs-privacy-toggle-list">
          {PROFILE_TOGGLES.map((item) => (
            <PrivacyToggle key={item.key} item={item} enabled={toggles[item.key]} onToggle={togglePrivacy} />
          ))}
        </div>
      </section>

      <section className="fs-privacy-card" aria-labelledby="fs-privacy-notifications-title">
        <div className="fs-privacy-section-heading">
          <div className="fs-privacy-section-icon" aria-hidden="true"><Bell size={17} /></div>
          <div>
            <h2 id="fs-privacy-notifications-title">Notificações</h2>
            <p>Escolha quais notificações você quer receber.</p>
          </div>
        </div>
        <div className="fs-privacy-toggle-list">
          {NOTIFICATION_TOGGLES.map((item) => (
            <PrivacyToggle key={item.key} item={item} enabled={toggles[item.key]} onToggle={togglePrivacy} />
          ))}
        </div>
      </section>

      <footer className="fs-privacy-actions">
        <div className={`fs-privacy-save-status${saved ? ' is-visible' : ''}`} aria-live="polite">
          <Check size={14} /> Alterações salvas
        </div>
        <button className="fs-privacy-save-button" type="button" onClick={saveChanges}>
          <LockKeyhole size={15} />
          {saved ? 'Salvo' : 'Salvar Alterações'}
        </button>
      </footer>
    </div>
  )
}

function PrivacyToggle({ item, enabled, onToggle }: { item: ToggleItem; enabled: boolean; onToggle: (key: PrivacyToggleKey) => void }) {
  const Icon = item.icon
  return (
    <div className="fs-privacy-toggle-row">
      <div className="fs-privacy-row-icon" aria-hidden="true"><Icon size={16} /></div>
      <div className="fs-privacy-row-copy">
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </div>
      <button
        className={`fs-privacy-switch${enabled ? ' is-on' : ''}`}
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${item.title}: ${enabled ? 'ativado' : 'desativado'}`}
        onClick={() => onToggle(item.key)}
      >
        <span />
      </button>
    </div>
  )
}
