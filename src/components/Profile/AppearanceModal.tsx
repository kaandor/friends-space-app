import { useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useUserStore } from '../../stores/userStore'
import {
  APPEARANCE_FONTS, APPEARANCE_TEXT_COLORS, PLAN_THEMES, PLAN_BACKGROUNDS,
  parseAppearance, serializeAppearance, planFromUser,
  type AppearanceThemeId, type AppearanceFontId, type AppearanceBgId, type AppearanceTextColorId,
} from './ProfileEditor/appearance'

interface Props { onClose: () => void }

// Modal de aparência (extraído do editor): salva na hora via updateUser.
export function AppearanceModal({ onClose }: Props) {
  const { currentUser, updateUser } = useUserStore()
  const plan = planFromUser(currentUser)
  const saved = parseAppearance((currentUser?.settings || {}) as Record<string, unknown>)
  const [theme, setTheme] = useState<string>(saved.theme)
  const [font, setFont] = useState<string>(saved.font)
  const [bg, setBg] = useState<string>(saved.bg)
  const [textColor, setTextColor] = useState<string>(saved.textColor)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!currentUser || saving) return
    setSaving(true)
    try {
      await updateUser({
        settings: {
          ...(currentUser.settings || {}),
          ...serializeAppearance({ theme: theme as AppearanceThemeId, font: font as AppearanceFontId, bg: bg as AppearanceBgId, textColor: textColor as AppearanceTextColorId }),
        },
      })
      setMsg('Aparência salva!')
      window.setTimeout(onClose, 700)
    } catch {
      setMsg('Erro ao salvar.')
    } finally { setSaving(false) }
  }

  return (
    <div className="appearance-modal-overlay" onClick={onClose}>
      <div className="appearance-modal fs-modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="appearance-modal-header">
          <h3><Sparkles size={16} /> Editar Aparência do Perfil</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="appearance-modal-body">
          <div className="appearance-live-preview" style={{ fontFamily: (APPEARANCE_FONTS as Record<string, string>)[font] ?? APPEARANCE_FONTS.space }}>
            <span className="appearance-live-preview-label">Preview das cores</span>
            <div className="appearance-live-preview-text" style={{ color: ((APPEARANCE_TEXT_COLORS as Record<string, string>)[textColor] || 'inherit') === 'inherit' ? 'var(--text-primary)' : (APPEARANCE_TEXT_COLORS as Record<string, string>)[textColor] }}>
              Olá, eu sou {currentUser?.name || 'você'}! 🚀 Este texto muda com a <b>Cor das letras</b>.
            </div>
          </div>
          <div className="appearance-group">
            <label>Tema de Cores ({plan.toUpperCase()})</label>
            <div className="appearance-options-grid">
              {PLAN_THEMES[plan].map((tid) => (
                <button key={tid} className={theme === tid ? 'selected' : ''} onClick={() => setTheme(tid)}>
                  {tid === 'default' ? 'Padrão' : 'Branco'}
                </button>
              ))}
            </div>
          </div>
          <div className="appearance-group">
            <label>Fonte de Letra</label>
            <div className="appearance-options-grid">
              {[
                ['space', 'Space Grotesk'], ['inter', 'Inter'], ['mono', 'Monospace'],
                ['poppins', 'Poppins'], ['montserrat', 'Montserrat'], ['outfit', 'Outfit'],
                ['roboto', 'Roboto'], ['playfair', 'Playfair Display'], ['jetbrains', 'JetBrains Mono'],
              ].map(([id, label]) => (
                <button key={id} className={font === id ? 'selected' : ''} onClick={() => setFont(id)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="appearance-group">
            <label>Cor das letras</label>
            <p className="appearance-helper-text">Esta configuração é independente da fonte e altera somente as cores dos textos no preview.</p>
            <div className="appearance-color-grid">
              {([
                ['default', 'Padrão', '#94a3b8'], ['white', 'Branco', '#f8fafc'], ['silver', 'Prata', '#cbd5e1'],
                ['green', 'Verde', '#86efac'], ['blue', 'Azul', '#93c5fd'], ['pink', 'Rosa', '#f9a8d4'],
                ['yellow', 'Amarelo', '#fde68a'], ['purple', 'Roxo', '#d8b4fe'], ['gold', 'Dourado', '#f7d774'],
              ] as [AppearanceTextColorId, string, string][]).map(([id, label, color]) => (
                <button key={id} className={textColor === id ? 'selected' : ''} onClick={() => setTextColor(id)}>
                  <span className="appearance-color-swatch" style={{ background: color }} />{label}
                </button>
              ))}
            </div>
          </div>
          <div className="appearance-group">
            <label>Plano de Fundo (Background)</label>
            <div className="appearance-options-grid">
              {PLAN_BACKGROUNDS[plan].map((bid) => (
                <button key={bid} className={bg === bid ? 'selected' : ''} onClick={() => setBg(bid)}>
                  {bid === 'default' ? 'Padrão' : 'Branco'}
                </button>
              ))}
            </div>
          </div>
          {msg && <p style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{msg}</p>}
        </div>
        <div className="appearance-modal-footer">
          <button onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Concluir'}</button>
        </div>
      </div>
    </div>
  )
}
