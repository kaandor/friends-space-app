import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Clapperboard, Gamepad2, Music2, Play, Presentation, RefreshCw, Search, Sparkles, Swords, UserRoundSearch, Users, X } from 'lucide-react'
import { useCallStore } from '../../stores/callStore'
import { useServerStore } from '../../stores/serverStore'
import { WatchPartyModal } from './WatchPartyModal'
import { MediaPartyModal } from './MediaPartyModal'
import { ChessGame } from './ChessGame'
import { WhoIsPlayer } from './WhoIsPlayer'

type ActivityId = 'youtube' | 'cinema' | 'music' | 'chess' | 'who' | 'meeting' | 'wordle' | 'improbable' | 'truth-dare'

interface Activity {
  id: ActivityId
  title: string
  description: string
  icon: ReactNode
  cover: ReactNode
  promoted?: boolean
}

const RECENTS_KEY = 'friends-space:activity-recents'

function loadRecents(): ActivityId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((id): id is ActivityId => id === 'youtube' || id === 'cinema' || id === 'music' || id === 'chess' || id === 'who' || id === 'wordle' || id === 'improbable' || id === 'truth-dare').slice(0, 6)
  } catch {
    return []
  }
}

function saveRecents(ids: ActivityId[]) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(ids)) } catch { }
}

const ACTIVITIES: Activity[] = [
  {
    id: 'youtube',
    title: 'YouTube Together',
    description: 'Assista ao mesmo vídeo com a call.',
    icon: <Play size={17} />,
    cover: (
      <div className="act-cover act-cover-youtube">
        <span className="act-cover-play"><Play size={24} fill="currentColor" /></span>
        <span className="act-cover-word">YouTube</span>
      </div>
    ),
    promoted: true,
  },
  {
    id: 'cinema',
    title: 'Cinema dos pinguins',
    description: 'Abra um vídeo ou link e entre na sala de cinema com a call.',
    icon: <Clapperboard size={17} />,
    cover: (
      <div className="act-cover act-cover-cinema">
        <span className="act-cover-cinema-screen"><Play size={24} fill="currentColor" /></span>
        <span className="act-cover-word">CINEMA</span>
      </div>
    ),
    promoted: true,
  },
  {
    id: 'music',
    title: 'Friends Music',
    description: 'Ouça junto com Spotify, Deezer, YouTube ou áudio direto.',
    icon: <Music2 size={17} />,
    cover: (
      <div className="act-cover act-cover-music">
        <Music2 size={42} />
        <span className="act-cover-word">FRIENDS MUSIC</span>
      </div>
    ),
  },
  {
    id: 'chess',
    title: 'Xadrez da Call',
    description: 'Partida online sincronizada para brancas e pretas.',
    icon: <Swords size={17} />,
    cover: (
      <div className="act-cover act-cover-chess">
        <span>♔</span><span>♞</span>
      </div>
    ),
  },
  {
    id: 'who',
    title: 'Quem é este jogador?',
    description: 'Adivinhe quem está por trás da foto da call.',
    icon: <UserRoundSearch size={17} />,
    cover: (
      <div className="act-cover act-cover-who">
        <span className="act-cover-who-avatar">?</span>
        <Users size={35} />
      </div>
    ),
  },
  {
    id: 'meeting',
    title: 'Modo Reunião',
    description: 'Sala de aula com uma tela, lousa, documento e apresentador.',
    icon: <Presentation size={17} />,
    cover: (
      <div className="act-cover act-cover-meeting">
        <Presentation size={38} />
        <span className="act-cover-word">REUNIÃO</span>
      </div>
    ),
    promoted: true,
  },
  {
    id: 'wordle',
    title: 'Wordle da Call',
    description: 'Adivinhe a palavra do dia em 6 tentativas.',
    icon: <Gamepad2 size={17} />,
    cover: (
      <div className="act-cover act-cover-wordle">
        {['F', 'E', 'S', 'T', 'A'].map((letter, i) => (
          <span key={i} className={`act-tile ${i === 0 || i === 4 ? 'is-correct' : i === 2 ? 'is-present' : ''}`}>{letter}</span>
        ))}
      </div>
    ),
  },
  {
    id: 'improbable',
    title: 'Quem é mais provável?',
    description: 'Perguntas para descobrir quem a call conhece melhor.',
    icon: <Users size={17} />,
    cover: (
      <div className="act-cover act-cover-improbable">
        <span className="act-cover-question">?</span>
        <Users size={38} />
      </div>
    ),
  },
  {
    id: 'truth-dare',
    title: 'Verdade ou Desafio',
    description: 'Escolha verdade ou desafio e passe para a call.',
    icon: <Sparkles size={17} />,
    cover: (
      <div className="act-cover act-cover-truth">
        <span>Verdade</span>
        <span>ou</span>
        <span>Desafio</span>
      </div>
    ),
  },
]

const WORDS = [
  'AMIGO', 'FESTA', 'JOGOS', 'MUNDO', 'PRAIA', 'NOITE', 'VERDE', 'PEDRA', 'LIVRO', 'TEMPO',
  'CARRO', 'BOLAS', 'SONHO', 'FELIZ', 'CHUVA', 'TERRA', 'PORTA', 'PAPEL', 'VIDEO', 'DANCA',
  'CINZA', 'FORTE', 'LUGAR', 'PODER', 'RISOS', 'SINAL', 'VALOR', 'CAMPO', 'FRUTA', 'GRAVE',
]

const KEYBOARD_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

function wordOfTheDay(): string {
  const day = Math.floor(Date.now() / 86_400_000)
  return WORDS[day % WORDS.length]
}

function scoreGuess(guess: string, answer: string): Array<'correct' | 'present' | 'absent'> {
  const result: Array<'correct' | 'present' | 'absent'> = Array(5).fill('absent')
  const remaining: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct'
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'correct') continue
    const letter = guess[i]
    if ((remaining[letter] || 0) > 0) {
      result[i] = 'present'
      remaining[letter] -= 1
    }
  }
  return result
}

function WordleGame({ onBack }: { onBack: () => void }) {
  const answer = useMemo(wordOfTheDay, [])
  const [guesses, setGuesses] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [message, setMessage] = useState('Descubra a palavra de 5 letras.')

  const finished = guesses.includes(answer) || guesses.length >= 6
  const keyState = useMemo(() => {
    const state: Record<string, 'correct' | 'present' | 'absent'> = {}
    for (const guess of guesses) {
      const score = scoreGuess(guess, answer)
      for (let i = 0; i < 5; i++) {
        const letter = guess[i]
        const next = score[i]
        if (state[letter] === 'correct') continue
        if (next === 'correct' || (next === 'present' && state[letter] !== 'absent')) state[letter] = next
        else if (!state[letter]) state[letter] = next
      }
    }
    return state
  }, [guesses, answer])

  const submit = () => {
    if (finished) return
    if (current.length !== 5) { setMessage('Digite 5 letras.'); return }
    const guess = current.toUpperCase()
    const next = [...guesses, guess]
    setGuesses(next)
    setCurrent('')
    if (guess === answer) setMessage('Acertou! Compartilhe com a call.')
    else if (next.length >= 6) setMessage(`A palavra era ${answer}.`)
    else setMessage('Tente outra palavra.')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (finished) return
      if (/^[a-zA-Z]$/.test(event.key)) {
        setCurrent(value => (value.length < 5 ? value + event.key.toUpperCase() : value))
        setMessage('')
      } else if (event.key === 'Backspace') {
        setCurrent(value => value.slice(0, -1))
      } else if (event.key === 'Enter') {
        submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="act-game">
      <div className="act-game-head">
        <button className="act-back" onClick={onBack}><ArrowLeft size={15} /> Atividades</button>
        <span className="act-game-title">Wordle da Call</span>
      </div>
      <div className="act-wordle">
        <div className="act-wordle-grid">
          {Array.from({ length: 6 }).map((_, row) => {
            const guess = guesses[row]
            const letters = guess ? guess.split('') : row === guesses.length ? current.padEnd(5, ' ').split('') : ['', '', '', '', '']
            const score = guess ? scoreGuess(guess, answer) : []
            return (
              <div className="act-wordle-row" key={row}>
                {letters.map((letter, col) => (
                  <span key={col} className={`act-wordle-cell ${letter.trim() ? 'filled' : ''} ${score[col] ? `is-${score[col]}` : ''}`}>{letter.trim()}</span>
                ))}
              </div>
            )
          })}
        </div>
        <div className="act-wordle-message">{message}{finished && guesses.includes(answer) && <Check size={14} />}</div>
        <div className="act-keyboard">
          {KEYBOARD_ROWS.map(row => (
            <div className="act-keyboard-row" key={row}>
              {row.split('').map(letter => (
                <button
                  key={letter}
                  className={`act-key ${keyState[letter] ? `is-${keyState[letter]}` : ''}`}
                  onClick={() => { if (!finished && current.length < 5) { setCurrent(v => v + letter); setMessage('') } }}
                >
                  {letter}
                </button>
              ))}
              {row === 'ZXCVBNM' && (
                <>
                  <button className="act-key act-key-wide" onClick={() => setCurrent(v => v.slice(0, -1))}>Apagar</button>
                  <button className="act-key act-key-wide" onClick={submit}>Enviar</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const IMPROBABLE = [
  '…vai dormir mais tarde mesmo dizendo que vai dormir cedo?',
  '…vai rir de uma mensagem que não entendeu?',
  '…vai chegar atrasado em um compromisso?',
  '…vai mandar áudio de 3 minutos?',
  '…vai virar o líder da call?',
  '…vai esquecer o microfone mutado?',
  '…vai contar uma história que já contou?',
  '…vai trocar de jogo no meio da partida?',
  '…vai fazer uma pergunta e responder sozinho?',
  '…vai criar um servidor novo do nada?',
  '…vai falar "última partida" e jogar mais cinco?',
  '…vai ficar em silêncio e voltar falando alto?',
]

function ImprobableGame({ onBack }: { onBack: () => void }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * IMPROBABLE.length))
  return (
    <div className="act-game act-game-center">
      <div className="act-game-head">
        <button className="act-back" onClick={onBack}><ArrowLeft size={15} /> Atividades</button>
        <span className="act-game-title">Quem é mais provável?</span>
      </div>
      <div className="act-prompt-card">
        <span className="act-prompt-kicker">Quem é mais provável que…</span>
        <strong>{IMPROBABLE[index]}</strong>
        <button className="act-primary" onClick={() => setIndex(value => (value + 1) % IMPROBABLE.length)}>
          <RefreshCw size={14} /> Próxima pergunta
        </button>
      </div>
    </div>
  )
}

const TRUTHS = [
  'Qual foi a última coisa que você pesquisou?',
  'Qual é a sua mania mais estranha na call?',
  'Qual jogo você finge que já jogou?',
  'Qual foi o seu maior mico em uma call?',
  'Se você pudesse apagar uma mensagem sua, qual seria?',
  'Qual é o seu talento mais inútil?',
  'Qual foi a última vez que você chorou de rir?',
  'Qual é a sua opinião mais impopular sobre jogos?',
]

const DARES = [
  'Mande um áudio cantando o refrão da última música que ouviu.',
  'Troque o seu status para uma frase escolhida pela call.',
  'Faça uma imitação de alguém da call até alguém acertar.',
  'Fale com sotaque escolhido pela call por 2 minutos.',
  'Mande uma mensagem para um amigo usando só emojis.',
  'Descreva a sua rotina como se fosse um narrador de futebol.',
  'Mostre o item mais aleatório que está perto de você.',
  'Faça uma pose de vitória e deixe a câmera ligada por 30 segundos.',
]

function TruthDareGame({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState<{ kind: 'Verdade' | 'Desafio'; text: string } | null>(null)
  const pick = (kind: 'Verdade' | 'Desafio') => {
    const pool = kind === 'Verdade' ? TRUTHS : DARES
    setPrompt({ kind, text: pool[Math.floor(Math.random() * pool.length)] })
  }
  return (
    <div className="act-game act-game-center">
      <div className="act-game-head">
        <button className="act-back" onClick={onBack}><ArrowLeft size={15} /> Atividades</button>
        <span className="act-game-title">Verdade ou Desafio</span>
      </div>
      <div className="act-truth-card">
        <div className="act-truth-actions">
          <button className="act-truth-btn is-truth" onClick={() => pick('Verdade')}>Verdade</button>
          <button className="act-truth-btn is-dare" onClick={() => pick('Desafio')}>Desafio</button>
        </div>
        {prompt ? (
          <div className="act-prompt-card">
            <span className="act-prompt-kicker">{prompt.kind}</span>
            <strong>{prompt.text}</strong>
            <button className="act-primary" onClick={() => setPrompt(null)}><RefreshCw size={14} /> Sortear de novo</button>
          </div>
        ) : (
          <div className="act-truth-empty">Escolha verdade ou desafio para começar.</div>
        )}
      </div>
    </div>
  )
}

export function ActivityModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<ActivityId[]>(loadRecents)
  const [active, setActive] = useState<ActivityId | null>(null)
  const [ytOpen, setYtOpen] = useState(false)
  const [cinemaOpen, setCinemaOpen] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const startMeeting = useCallStore(s => s.startMeeting)
  const currentServer = useServerStore(s => s.currentServer)
  const meetingEnabled = currentServer?.settings?.community?.meeting !== false

  const remember = (id: ActivityId) => {
    setRecents(prev => {
      const next = [id, ...prev.filter(item => item !== id)].slice(0, 6)
      saveRecents(next)
      return next
    })
  }

  const open = (id: ActivityId) => {
    if (id === 'meeting') {
      if (!meetingEnabled) return
      startMeeting()
      onClose()
      return
    }
    remember(id)
    if (id === 'youtube') { setYtOpen(true); return }
    if (id === 'cinema') { setCinemaOpen(true); return }
    if (id === 'music') { setMusicOpen(true); return }
    setActive(id)
  }

  const filtered = ACTIVITIES.filter(activity => {
    if (activity.id === 'meeting' && !meetingEnabled) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return activity.title.toLowerCase().includes(q) || activity.description.toLowerCase().includes(q)
  })

  const recentActivities = recents
    .map(id => ACTIVITIES.find(activity => activity.id === id))
    .filter((activity): activity is Activity => Boolean(activity))

  return (
    <div className="act-backdrop" onClick={onClose}>
      <div className="act-modal" onClick={event => event.stopPropagation()}>
        {active === 'chess' ? <ChessGame onBack={() => setActive(null)} /> : null}
        {active === 'who' ? <WhoIsPlayer onBack={() => setActive(null)} /> : null}
        {active === 'wordle' ? <WordleGame onBack={() => setActive(null)} /> : null}
        {active === 'improbable' ? <ImprobableGame onBack={() => setActive(null)} /> : null}
        {active === 'truth-dare' ? <TruthDareGame onBack={() => setActive(null)} /> : null}
        {!active ? (
          <>
            <div className="act-top">
              <div className="act-search">
                <Search size={16} />
                <input
                  autoFocus
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar atividades"
                />
              </div>
              <button className="act-close" onClick={onClose} title="Fechar"><X size={18} /></button>
            </div>
            <div className="act-scroll">
              {recentActivities.length > 0 && !query.trim() ? (
                <section className="act-section">
                  <h3>Recentes</h3>
                  <div className="act-recents">
                    {recentActivities.map(activity => (
                      <button key={activity.id} className="act-recent" onClick={() => open(activity.id)} title={activity.title}>
                        <span className="act-recent-icon">{activity.icon}</span>
                        <span>{activity.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="act-section">
                <h3>{query.trim() ? 'Resultados' : 'Atividades'}</h3>
                {filtered.length === 0 ? (
                  <div className="act-empty">Nenhuma atividade encontrada.</div>
                ) : (
                  <div className="act-grid">
                    {filtered.map(activity => (
                      <button key={activity.id} className="act-card" onClick={() => open(activity.id)}>
                        <div className="act-card-cover">
                          {activity.cover}
                          {activity.promoted ? <span className="act-promo">PROMOVIDA</span> : null}
                        </div>
                        <div className="act-card-body">
                          <span className="act-card-icon">{activity.icon}</span>
                          <div className="act-card-copy">
                            <strong>{activity.title}</strong>
                            <span>{activity.description}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <div className="act-foot">As atividades acontecem dentro da call. Chame seus amigos e comecem juntos.</div>
            </div>
          </>
        ) : null}
      </div>
      {ytOpen ? <WatchPartyModal onClose={() => setYtOpen(false)} /> : null}
      {cinemaOpen ? <MediaPartyModal mode="cinema" onClose={() => setCinemaOpen(false)} /> : null}
      {musicOpen ? <MediaPartyModal mode="music" onClose={() => setMusicOpen(false)} /> : null}
    </div>
  )
}
