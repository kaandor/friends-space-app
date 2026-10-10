import { useRef, useState } from 'react'
import type { ServerEmoji } from '../../types'
import { uploadToDrive, isDriveConnected, toImageUrl } from '../../services/driveService'
import { assertUploadLimit } from '../../utils/astro'
import { sanitizeEmojiName } from '../../services/serverEmojis'
import { DEFAULT_GIFS, DEFAULT_STICKERS } from '../../services/mediaLibrary'
import { klipyEnabled } from '../../services/klipy'
import { KlipyPicker } from './KlipyPicker'
import { useServerStore } from '../../stores/serverStore'
import { useUserStore } from '../../stores/userStore'
import { useLangStore } from '../../stores/langStore'

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Sorrisos', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😴','🤤','😪','😵','🤠','🤡','👻','💀','👽','🤖'] },
  { label: 'Gestos', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👏','🙌','🤝','🙏','💪','🫶','👊','✊','🤛','🤜','💅','🤳','🦾','🦿'] },
  { label: 'Coracoes', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️','🗨️'] },
  { label: 'Animais', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔'] },
  { label: 'Comida', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'] },
  { label: 'Atividades', emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰'] },
  { label: 'Viagem', emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🪝','⛽','🚧','🚦','🚥','🚏','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋','⛩️'] },
  { label: 'Objetos', emojis: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'] },
  { label: 'Simbolos', emojis: ['❤️','💯','🔞','🚫','❌','⭕','💢','♨️','💤','🚭','🚳','🚱','🔞','📵','🔞','😵','⚠️','🚸','🔱','⛔','✅','❎','💮','‼️','⁉️','❓','❔','❕','❗','〰️','💱','💲','⚕️','♻️','⚜️','🔱','📛','🔰','⭕','🛑','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','👁️','🗨️'] },
]

interface EmojiPickerProps {
  onPick: (text: string) => void
  onPickMedia?: (url: string, name: string, kind: 'gif' | 'sticker') => void
  serverId?: string | null
  manageable?: boolean
  allEmojis?: ServerEmoji[]
  hasAstro?: boolean
}

const kindBadge: Record<string, string> = {
  gif: 'GIF',
  sticker: 'STK',
}

export function EmojiPicker({ onPick, onPickMedia, serverId, manageable = false, allEmojis = [], hasAstro = false }: EmojiPickerProps) {
  const [group, setGroup] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [addKind, setAddKind] = useState<'emoji' | 'gif' | 'sticker'>('emoji')
  const fileRef = useRef<HTMLInputElement>(null)
  const { addServerEmoji, deleteServerEmoji } = useServerStore()
  const { t } = useLangStore()

  const all = allEmojis || []
  const inServer = serverId ? all.filter(e => e.serverId === serverId) : []
  const crossServer = serverId ? all.filter(e => e.serverId !== serverId) : all
  const usable = hasAstro ? [...inServer, ...crossServer] : inServer
  const customVisible = usable.length > 0 || (manageable && !!serverId)
  const customOffset = customVisible ? 1 : 0
  const gifTabIndex = customOffset + EMOJI_GROUPS.length
  const stickerTabIndex = gifTabIndex + 1

  const isCustom = customVisible && group === 0
  const isGifTab = group === gifTabIndex
  const isStickerTab = group === stickerTabIndex
  const active = !isCustom && !isGifTab && !isStickerTab ? EMOJI_GROUPS[group - customOffset] : null

  const usableEmojis = usable.filter(e => !e.kind || e.kind === 'emoji')
  const usableGifs = usable.filter(e => e.kind === 'gif')
  const usableStickers = usable.filter(e => e.kind === 'sticker')
  const hasHiddenCross = !hasAstro && crossServer.length > 0

  const allEmojisFlat = EMOJI_GROUPS.flatMap(g => g.emojis)
  const searchResults = search.trim() ? allEmojisFlat.filter(e => e.includes(search.trim())) : null

  const pickItem = (item: ServerEmoji) => {
    if (item.kind === 'gif' || item.kind === 'sticker') {
      onPickMedia?.(item.url, item.name || item.id, item.kind)
    } else {
      onPick(`:${item.name}:`)
    }
  }

  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !serverId || busy) return
    setNote('')
    setBusy(true)
    try {
      if (!isDriveConnected()) {
        setNote(t('emoji.needDrive'))
        return
      }
      const blocked = assertUploadLimit(useUserStore.getState().currentUser, file.size)
      if (blocked) {
        setNote(blocked)
        return
      }
      const kind = addKind
      const ext = file.name.slice(file.name.lastIndexOf('.')) || (kind === 'gif' ? '.gif' : '.png')
      if (kind === 'emoji') {
        const name = sanitizeEmojiName(file.name.replace(/\.[^.]+$/, ''))
        if (!name) {
          setNote(t('emoji.badName'))
          return
        }
        const url = await uploadToDrive(file, `emoji-${Date.now()}-${name}${ext}`, file.type, 'emojis')
        if (!url) {
          setNote(t('emoji.uploadFail'))
          return
        }
        await addServerEmoji(serverId, name, url, 'emoji')
      } else {
        const folder = kind === 'gif' ? 'gifs' : 'emojis'
        const url = await uploadToDrive(file, `${kind}-${Date.now()}${ext}`, file.type, folder)
        if (!url) {
          setNote(t('emoji.uploadFail'))
          return
        }
        await addServerEmoji(serverId, '', url, kind)
      }
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  const tabBtnStyle = (on: boolean): React.CSSProperties => ({
    background: 'transparent', border: 'none', fontSize: 15, cursor: 'pointer',
    padding: '4px 2px', borderRadius: 6, opacity: on ? 1 : 0.45,
  })

  return (
    <div className="fs-emoji-picker">
      <div className="fs-emoji-header">
        <span className="fs-emoji-title">
          {isCustom ? 'Personalizados' : isGifTab ? 'GIFs' : isStickerTab ? 'Figurinhas' : (active?.label || 'Emojis')}
        </span>
        <input
          className="fs-emoji-search"
          placeholder="Buscar emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="fs-emoji-tabs">
        {customVisible && (
          <button onClick={() => setGroup(0)} title={t('emoji.custom')} style={tabBtnStyle(isCustom)}>
            <i className="fa-solid fa-icons" />
          </button>
        )}
        {EMOJI_GROUPS.map((g, i) => (
          <button key={g.label} onClick={() => setGroup(i + customOffset)} title={g.label} style={tabBtnStyle(group === i + customOffset)}>
            {g.emojis[0]}
          </button>
        ))}
        <button onClick={() => setGroup(gifTabIndex)} title={t('emoji.gifs')} style={{ ...tabBtnStyle(isGifTab), fontSize: 11, fontWeight: 800, color: '#23a55a' }}>
          GIF
        </button>
        <button onClick={() => setGroup(stickerTabIndex)} title={t('emoji.stickers')} style={tabBtnStyle(isStickerTab)}>
          🌈
        </button>
      </div>

      {isCustom ? (
        <>
          <div className="fs-emoji-custom-grid">
            {usableEmojis.map(emoji => (
              <CustomItem key={emoji.id} emoji={emoji} onClick={() => pickItem(emoji)} canDelete={manageable && !!serverId && emoji.serverId === serverId} onDelete={() => serverId && void deleteServerEmoji(serverId, emoji.id)} t={t} />
            ))}
            {usableGifs.map(emoji => (
              <CustomItem key={emoji.id} emoji={emoji} onClick={() => pickItem(emoji)} canDelete={manageable && !!serverId && emoji.serverId === serverId} onDelete={() => serverId && void deleteServerEmoji(serverId, emoji.id)} t={t} />
            ))}
            {usableStickers.map(emoji => (
              <CustomItem key={emoji.id} emoji={emoji} onClick={() => pickItem(emoji)} canDelete={manageable && !!serverId && emoji.serverId === serverId} onDelete={() => serverId && void deleteServerEmoji(serverId, emoji.id)} t={t} />
            ))}
            {manageable && serverId && (
              <div className="fs-emoji-add-cell">
                <div className="fs-emoji-add-kinds">
                  <button onClick={() => setAddKind('emoji')} style={{ fontWeight: addKind === 'emoji' ? 800 : 500, color: addKind === 'emoji' ? 'var(--accent)' : 'var(--text-secondary)' }}>{t('emoji.kindEmoji')}</button>
                  <button onClick={() => setAddKind('gif')} style={{ fontWeight: addKind === 'gif' ? 800 : 500, color: addKind === 'gif' ? 'var(--accent)' : 'var(--text-secondary)' }}>{t('emoji.kindGif')}</button>
                  <button onClick={() => setAddKind('sticker')} style={{ fontWeight: addKind === 'sticker' ? 800 : 500, color: addKind === 'sticker' ? 'var(--accent)' : 'var(--text-secondary)' }}>{t('emoji.kindSticker')}</button>
                </div>
                <button
                  className="fs-emoji-custom-item"
                  onClick={() => fileRef.current?.click()}
                  title={t('emoji.add')}
                  style={{ fontSize: 24, color: 'var(--text-secondary)' }}
                >
                  {busy ? <span className="inline-spinner" /> : <i className="fa-solid fa-plus" />}
                </button>
              </div>
            )}
          </div>
          {note && <div className="fs-emoji-manage-note">{note}</div>}
          {hasHiddenCross && (
            <div className="fs-emoji-astro-note">
              <i className="fa-solid fa-rocket" style={{ color: '#a855f7' }} /> {t('emoji.astroNote')}
            </div>
          )}
          {manageable && serverId && (
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={handleAdd} />
          )}
        </>
      ) : isGifTab ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {klipyEnabled() && <KlipyPicker kind="gifs" onPick={(url, name) => onPickMedia?.(url, name, 'gif')} />}
          <div className="fs-media-grid">
            {DEFAULT_GIFS.map(g => (
              <button key={g.id} className="fs-media-grid-item" onClick={() => onPickMedia?.(g.url, g.name, 'gif')} title={g.name}>
                <img src={toImageUrl(g.url)} alt={g.name} />
              </button>
            ))}
          </div>
        </div>
      ) : isStickerTab ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {klipyEnabled() && <KlipyPicker kind="stickers" onPick={(url, name) => onPickMedia?.(url, name, 'sticker')} />}
          <div className="fs-media-grid">
            {DEFAULT_STICKERS.map(s => (
              <button key={s.id} className="fs-media-grid-item" onClick={() => onPickMedia?.(s.url, s.name, 'sticker')} title={s.name}>
                <img src={toImageUrl(s.url)} alt={s.name} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fs-emoji-grid">
          {searchResults !== null
            ? (searchResults.length
              ? searchResults.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onPick(emoji)}
                  style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 1 }}
                >
                  {emoji}
                </button>
              ))
              : <p className="fs-emoji-no-results">Nenhum emoji encontrado</p>)
            : active?.emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => onPick(emoji)}
                style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', padding: 4, borderRadius: 6, lineHeight: 1 }}
              >
                {emoji}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function CustomItem({ emoji, onClick, canDelete, onDelete, t }: {
  emoji: ServerEmoji
  onClick: () => void
  canDelete: boolean
  onDelete: () => void
  t: (key: string) => string
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button className="fs-emoji-custom-item" onClick={onClick} title={emoji.name || emoji.id}>
        <img src={toImageUrl(emoji.url)} alt={emoji.name || emoji.id} />
      </button>
      {(emoji.kind === 'gif' || emoji.kind === 'sticker') && (
        <span className="fs-emoji-kind-badge">{kindBadge[emoji.kind]}</span>
      )}
      {canDelete && (
        <button className="fs-emoji-custom-delete" title={t('emoji.delete')} onClick={onDelete}>×</button>
      )}
    </span>
  )
}
