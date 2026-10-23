import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { ArrowLeft, Crown, RotateCcw, Swords, Users } from 'lucide-react'
import { useCallStore, type ChessState } from '../../stores/callStore'
import { useUserStore } from '../../stores/userStore'

const PIECES: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}

function playerColor(state: ChessState | null, userId?: string): 'white' | 'black' | null {
  if (!state || !userId) return null
  if (state.whiteId === userId) return 'white'
  if (state.blackId === userId) return 'black'
  return null
}

export function ChessGame({ onBack }: { onBack: () => void }) {
  const chessState = useCallStore(s => s.chess)
  const startChess = useCallStore(s => s.startChess)
  const joinChess = useCallStore(s => s.joinChess)
  const syncChess = useCallStore(s => s.syncChess)
  const stopChess = useCallStore(s => s.stopChess)
  const me = useUserStore(s => s.currentUser)
  const [selected, setSelected] = useState<string | null>(null)
  const myColor = playerColor(chessState, me?.id)

  const game = useMemo(() => {
    try { return new Chess(chessState?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') } catch { return new Chess() }
  }, [chessState?.fen])

  const turn = game.turn() === 'w' ? 'white' : 'black'
  const gameOver = game.isGameOver()
  const checked = game.isCheck()
  const flipped = myColor === 'black'

  const legal = useMemo(() => {
    if (!selected || !myColor || gameOver) return [] as string[]
    try {
      return game.moves({ square: selected as never, verbose: true }).map(move => String(move.to))
    } catch { return [] }
  }, [selected, game, myColor, gameOver])

  const clickSquare = (square: string) => {
    if (!chessState || !me) return
    if (!myColor) return
    if (gameOver) return
    if (turn !== myColor) return
    if (selected) {
      if (legal.includes(square)) {
        try {
          const move = game.move({ from: selected as never, to: square as never, promotion: 'q' })
          if (move) {
            syncChess(game.fen(), { from: selected, to: square })
            setSelected(null)
          }
        } catch { }
        return
      }
      if (square === selected) { setSelected(null); return }
    }
    try {
      const piece = game.get(square as never)
      if (piece && piece.color === (myColor === 'white' ? 'w' : 'b')) setSelected(square)
    } catch { }
  }

  const board = game.board()
  const rows = flipped ? [...board].reverse() : board
  const status = gameOver
    ? (game.isCheckmate() ? `Xeque-mate — ${turn === 'white' ? 'pretas' : 'brancas'} venceram` : 'Empate')
    : `${turn === 'white' ? 'Brancas' : 'Pretas'} jogam${checked ? ' · XEQUE' : ''}`

  return (
    <div className="act-game">
      <div className="act-game-head">
        <button className="act-back" onClick={onBack}><ArrowLeft size={15} /> Atividades</button>
        <span className="act-game-title">Xadrez da Call</span>
      </div>
      {!chessState ? (
        <div className="act-prompt-card" style={{ maxWidth: 440, margin: '30px auto' }}>
          <span className="act-prompt-kicker">JOGO ONLINE</span>
          <strong>Abra uma partida de xadrez para a call</strong>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Você começa com as brancas. Outra pessoa pode sentar como pretas.</p>
          <button className="act-primary" onClick={startChess}><Swords size={15} /> Criar partida</button>
        </div>
      ) : (
        <div className="chess-wrap">
          <div className="chess-board-col">
            <div className="chess-board">
              {rows.map((row, rowIndex) => row.map((piece, colIndex) => {
                const actualRow = flipped ? 7 - rowIndex : rowIndex
                const actualCol = flipped ? 7 - colIndex : colIndex
                const square = `${'abcdefgh'[actualCol]}${8 - actualRow}`
                const last = chessState.lastMove && (chessState.lastMove.from === square || chessState.lastMove.to === square)
                const canMove = legal.includes(square)
                return (
                  <button
                    key={square}
                    className={`chess-square ${(actualRow + actualCol) % 2 ? 'dark' : 'light'}${selected === square ? ' selected' : ''}${last ? ' last' : ''}${canMove ? ' target' : ''}`}
                    onClick={() => clickSquare(square)}
                    title={square}
                  >
                    {piece ? <span className={`chess-piece ${piece.color === 'w' ? 'white' : 'black'}`}>{PIECES[`${piece.color}${piece.type}`]}</span> : null}
                    {canMove ? <span className="chess-dot" /> : null}
                  </button>
                )
              }))}
            </div>
          </div>
          <aside className="chess-side">
            <div className="chess-status">
              <Crown size={16} />
              <div>
                <strong>{status}</strong>
                <span>{myColor ? `Você joga de ${myColor === 'white' ? 'brancas' : 'pretas'}` : 'Assistindo a partida'}</span>
              </div>
            </div>
            <div className="chess-seats">
              <div className={`chess-seat ${chessState.whiteId ? 'filled' : ''}`}>
                <span className="chess-seat-icon">♔</span>
                <div><strong>{chessState.whiteName || 'Brancas vazias'}</strong><small>Brancas</small></div>
                {!chessState.whiteId ? <button onClick={() => joinChess('white')}>Sentar</button> : null}
              </div>
              <div className={`chess-seat ${chessState.blackId ? 'filled' : ''}`}>
                <span className="chess-seat-icon">♚</span>
                <div><strong>{chessState.blackName || 'Pretas vazias'}</strong><small>Pretas</small></div>
                {!chessState.blackId ? <button onClick={() => joinChess('black')}>Sentar</button> : null}
              </div>
            </div>
            <div className="chess-tip"><Users size={14} /> A partida é sincronizada com todos da call em tempo real.</div>
            {(!myColor || !gameOver) && (
              <button className="chess-reset" onClick={() => { if (chessState.whiteId === me?.id || chessState.byUserId === me?.id) stopChess(); else startChess() }}>
                <RotateCcw size={14} /> {chessState.byUserId === me?.id ? 'Encerrar partida' : 'Nova partida'}
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
