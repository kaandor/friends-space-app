import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, RefreshCw, Sparkles, UserRoundSearch, XCircle } from 'lucide-react'
import { useCallStore } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'
import { Avatar } from '../ui/Avatar'

interface Person { id: string; name: string; photo: string }

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

export function WhoIsPlayer({ onBack }: { onBack: () => void }) {
  const participants = useCallStore(s => s.participants)
  const me = useUserStore(s => s.currentUser)
  const [round, setRound] = useState(0)
  const [score, setScore] = useState({ right: 0, wrong: 0 })
  const [picked, setPicked] = useState<string | null>(null)

  const pool = useMemo<Person[]>(() => {
    const map = new Map<string, Person>()
    if (me) map.set(me.id, { id: me.id, name: me.name, photo: me.photoUrl })
    for (const person of participants) {
      if (person.userId) map.set(person.userId, { id: person.userId, name: person.userName, photo: person.userPhoto })
    }
    return [...map.values()]
  }, [me, participants])

  const target = pool.length ? pool[round % pool.length] : null
  const options = useMemo(() => {
    if (!target) return [] as Person[]
    const others = shuffle(pool.filter(person => person.id !== target.id)).slice(0, 3)
    return shuffle([target, ...others])
  }, [target, pool])

  const answer = (id: string) => {
    if (!target || picked) return
    setPicked(id)
    setScore(previous => id === target.id ? { ...previous, right: previous.right + 1 } : { ...previous, wrong: previous.wrong + 1 })
  }

  const next = () => {
    setPicked(null)
    setRound(value => value + 1)
  }

  return (
    <div className="act-game">
      <div className="act-game-head">
        <button className="act-back" onClick={onBack}><ArrowLeft size={15} /> Atividades</button>
        <span className="act-game-title">Quem é este jogador?</span>
      </div>
      {pool.length < 2 ? (
        <div className="act-prompt-card" style={{ maxWidth: 440, margin: '30px auto' }}>
          <UserRoundSearch size={34} />
          <strong>Chame mais alguém para a call</strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Este jogo usa as fotos e nomes de quem está na chamada.</p>
        </div>
      ) : (
        <div className="who-game">
          <div className="who-score">
            <span><CheckCircle2 size={14} /> {score.right}</span>
            <span><XCircle size={14} /> {score.wrong}</span>
            <strong>Rodada {round + 1}</strong>
          </div>
          <div className="who-card">
            <div className={`who-photo${picked ? ' revealed' : ''}`}>
              {target ? <Avatar src={target.photo} name={target.name} size={150} /> : null}
              {!picked ? <span className="who-mystery">?</span> : null}
            </div>
            <div className="who-copy">
              <span className="act-prompt-kicker"><Sparkles size={12} /> ADIVINHE O PINGUIM</span>
              <strong>Quem está por trás desta foto?</strong>
              <p>Dica: essa pessoa está na call agora.</p>
            </div>
            <div className="who-options">
              {options.map(option => {
                const correct = picked && target && option.id === target.id
                const wrong = picked === option.id && target && option.id !== target.id
                return (
                  <button
                    key={option.id}
                    className={`who-option${correct ? ' correct' : ''}${wrong ? ' wrong' : ''}`}
                    disabled={Boolean(picked)}
                    onClick={() => answer(option.id)}
                  >
                    {option.name}
                  </button>
                )
              })}
            </div>
            {picked ? (
              <div className="who-result">
                <span>{picked === target?.id ? 'Acertou! É ' : 'Era '}{target?.name}</span>
                <button className="act-primary" onClick={next}><RefreshCw size={14} /> Próxima rodada</button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
