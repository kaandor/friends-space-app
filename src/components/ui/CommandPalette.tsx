import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Award, CalendarHeart, CircleHelp, Compass, Download, FileText, Focus, Hash,
  Inbox, LayoutGrid, MessageCircle, Moon, Search, Server as ServerIcon, Settings,
  UserRound, Volume2, X,
} from 'lucide-react'
import type { Channel, Server, User } from '../../types'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useFriendStore } from '../../stores/friendStore'
import { useLangStore } from '../../stores/langStore'
import { onPwaInstallAvailability, promptPwaInstall, pwaInstallAvailable } from '../../services/pwa'

type PaletteItem =
  | { kind: 'server'; id: string; label: string; detail: string; server: Server }
  | { kind: 'channel'; id: string; label: string; detail: string; server: Server; channel: Channel }
  | { kind: 'person'; id: string; label: string; detail: string; user: User }
  | { kind: 'action'; id: string; label: string; detail: string; icon: ReactNode; run: () => void }

interface ActionData {
  id: string
  labelKey: string
  detailKey: string
  icon: ReactNode
  run: () => void
}

const ACTIONS: ActionData[] = [
  { id: 'friends', labelKey: 'command.friends', detailKey: 'palette.friendsHint', icon: <MessageCircle size={15} />, run: () => fire('friends-space:show-friends') },
  { id: 'inbox', labelKey: 'command.inbox', detailKey: 'palette.inboxHint', icon: <Inbox size={15} />, run: () => fire('friends-space:open-inbox') },
  { id: 'discover', labelKey: 'command.discover', detailKey: 'palette.discoverHint', icon: <Compass size={15} />, run: () => fire('friends-space:open-discover') },
  { id: 'profile', labelKey: 'command.myProfile', detailKey: 'palette.profileHint', icon: <UserRound size={15} />, run: () => fire('friends-space:open-profile') },
  { id: 'recap', labelKey: 'command.recap', detailKey: 'palette.recapHint', icon: <LayoutGrid size={15} />, run: () => fire('friends-space:open-recap') },
  { id: 'achievements', labelKey: 'command.achievements', detailKey: 'palette.achievementsHint', icon: <Award size={15} />, run: () => fire('friends-space:open-achievements') },
  { id: 'changelog', labelKey: 'command.changelog', detailKey: 'palette.changelogHint', icon: <FileText size={15} />, run: () => fire('friends-space:open-changelog') },
  { id: 'transparency', labelKey: 'command.transparency', detailKey: 'palette.transparencyHint', icon: <CircleHelp size={15} />, run: () => fire('friends-space:open-transparency') },
  { id: 'focus', labelKey: 'command.focus', detailKey: 'palette.focusHint', icon: <Focus size={15} />, run: () => fire('friends-space:toggle-focus') },
  { id: 'theme', labelKey: 'command.toggleTheme', detailKey: 'palette.themeHint', icon: <Moon size={15} />, run: () => fire('friends-space:toggle-theme') },
  { id: 'settings', labelKey: 'command.settings', detailKey: 'palette.settingsHint', icon: <Settings size={15} />, run: () => useSettingsStore.getState().openSettings('perfil') },
  { id: 'help', labelKey: 'command.help', detailKey: 'palette.helpHint', icon: <CircleHelp size={15} />, run: () => fire('friends-space:open-help') },
  { id: 'download', labelKey: 'command.download', detailKey: 'palette.downloadHint', icon: <Download size={15} />, run: () => fire('friends-space:open-download') },
  { id: 'install', labelKey: 'command.installPwa', detailKey: 'palette.installPwaHint', icon: <Download size={15} />, run: () => { void promptPwaInstall() } },
]

const BIRTHDAY_ACTION: ActionData = {
  id: 'birthdays', labelKey: 'command.birthdays', detailKey: 'palette.birthdaysHint', icon: <CalendarHeart size={15} />, run: () => fire('friends-space:show-birthdays'),
}

function fire(name: string) {
  try { window.dispatchEvent(new Event(name)) } catch { }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function channelIcon(channel: Channel) {
  return channel.type === 'voice' ? <Volume2 size={15} /> : <Hash size={15} />
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const servers = useServerStore(s => s.servers)
  const currentServer = useServerStore(s => s.currentServer)
  const users = useUserStore(s => s.users)
  const currentUser = useUserStore(s => s.currentUser)
  const friends = useFriendStore(s => s.friendUsers)
  const t = useLangStore(s => s.t)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pwaAvailable, setPwaAvailable] = useState(pwaInstallAvailable)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => onPwaInstallAvailability(setPwaAvailable), [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  const closeAndRun = (run: () => void) => {
    onClose()
    window.setTimeout(run, 0)
  }

  const items = useMemo<PaletteItem[]>(() => {
    const people = (friends.length > 0 ? friends : users)
      .filter((user): user is User => Boolean(user))
      .filter(user => user.id !== currentUser?.id)
    const actionItems: PaletteItem[] = [...ACTIONS, BIRTHDAY_ACTION]
      .filter(action => action.id !== 'install' || pwaAvailable)
      .map(action => ({ kind: 'action' as const, id: action.id, label: t(action.labelKey), detail: t(action.detailKey), icon: action.icon, run: action.run }))

    const channelItems: PaletteItem[] = servers.flatMap(server =>
      (server.channels || []).map(channel => ({
        kind: 'channel' as const,
        id: `${server.id}:${channel.id}`,
        label: channel.name,
        detail: `${server.name} · ${channel.type === 'voice' ? t('palette.voice') : t('palette.text')}`,
        server,
        channel,
      })),
    )

    const birthdayItems: PaletteItem[] = people
      .filter(user => typeof user.birthday === 'string' && user.birthday.length >= 5)
      .slice(0, 6)
      .map(user => ({
        kind: 'person' as const,
        id: `birthday:${user.id}`,
        label: user.name,
        detail: `${t('palette.birthdayLabel')} · ${user.birthday}`,
        user,
      }))

    const raw: PaletteItem[] = [
      ...actionItems,
      { kind: 'server', id: 'friends-home', label: t('command.home'), detail: t('palette.homeHint'), server: currentServer || servers[0] || ({} as Server) },
      ...servers.map(server => ({ kind: 'server' as const, id: server.id, label: server.name, detail: `${(server.members || []).length} ${t('palette.members')}`, server })),
      ...channelItems,
      ...people.slice(0, 40).map(user => ({ kind: 'person' as const, id: user.id, label: user.name, detail: `@${user.friendCode || 'usuario'}`, user })),
      ...birthdayItems,
    ]

    const q = normalize(query.trim())
    const filtered = q
      ? raw.filter(item => normalize(`${item.label} ${item.detail}`).includes(q))
      : raw
    const seen = new Set<string>()
    return filtered.filter(item => {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 60)
  }, [query, servers, users, friends, currentUser?.id, currentServer, t, pwaAvailable])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(value + 1, items.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(value - 1, 0)) }
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[active]
        if (item) runItem(item)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, active, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function runItem(item: PaletteItem) {
    if (item.kind === 'server') {
      if (item.id === 'friends-home') {
        closeAndRun(() => { useServerStore.setState({ currentServer: null, currentChannel: null }); useFriendStore.getState().setCurrentDMUser(null); fire('friends-space:show-friends') })
        return
      }
      closeAndRun(() => {
        useServerStore.setState({ currentServer: item.server, currentChannel: null })
        fire('friends-space:show-friends')
      })
      return
    }
    if (item.kind === 'channel') {
      closeAndRun(() => useServerStore.setState({ currentServer: item.server, currentChannel: item.channel }))
      return
    }
    if (item.kind === 'person') {
      closeAndRun(() => {
        useServerStore.setState({ currentServer: null, currentChannel: null })
        useFriendStore.getState().setCurrentDMUser(item.user)
        fire('friends-space:show-friends')
      })
      return
    }
    closeAndRun(item.run)
  }

  if (!open) return null

  return (
    <div className="fs-cmd-backdrop" onMouseDown={onClose}>
      <div className="fs-cmd" role="dialog" aria-modal="true" aria-label={t('palette.command')} onMouseDown={event => event.stopPropagation()}>
        <div className="fs-cmd-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('palette.search')}
          />
          <button type="button" onClick={onClose} title={t('modal.close')}><X size={17} /></button>
        </div>
        <div className="fs-cmd-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="fs-cmd-empty">{t('palette.noResults')} “{query}”.</div>
          ) : items.map((item, index) => (
            <button
              type="button"
              key={`${item.kind}:${item.id}`}
              data-index={index}
              className={`fs-cmd-item${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => runItem(item)}
            >
              <span className="fs-cmd-icon">
                {item.kind === 'action' ? item.icon
                  : item.kind === 'channel' ? channelIcon(item.channel)
                    : item.kind === 'person' ? <UserRound size={15} />
                      : <ServerIcon size={15} />}
              </span>
              <span className="fs-cmd-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className="fs-cmd-kind">{item.kind === 'action' ? t('palette.command') : item.kind === 'person' ? t('palette.person') : item.kind === 'channel' ? t('palette.channel') : t('palette.server')}</span>
            </button>
          ))}
        </div>
        <div className="fs-cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('palette.navigate')}</span>
          <span><kbd>Enter</kbd> {t('palette.open')}</span>
          <span><kbd>Esc</kbd> {t('palette.close')}</span>
          <button type="button" onClick={() => fire('friends-space:open-transparency')}>{t('command.transparency')}</button>
        </div>
      </div>
    </div>
  )
}
