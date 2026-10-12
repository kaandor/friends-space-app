import { Fa } from '../../utils/fa'
import { useState } from 'react'
import {
  acceptAgeGate,
  isAgeGatePassed,
  setAgeGroup,
  setParentalConsent,
  saveGuardianData,
  saveChildData,
} from '../../services/moderation'
import { assetUrl } from '../../utils/assets'

const GREEN = '#4ade80'

function LawItem({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Fa name={icon} size={13} style={{ color: GREEN, marginTop: 3, flexShrink: 0 }} />
      <div>
        <b style={{ color: '#e5e7eb', fontSize: 13, display: 'block', marginBottom: 2 }}>{title}</b>
        <span style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5 }}>{children}</span>
      </div>
    </div>
  )
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2')
}

type MinorStep = 'guardian' | 'child' | 'consent'

export function AgeGate18() {
  const [passed] = useState<boolean>(() => isAgeGatePassed())
  const [step, setStep] = useState<'gate' | 'minor' | 'terms'>('gate')
  const [minorSubStep, setMinorSubStep] = useState<MinorStep>('guardian')
  const [ageChoice, setAgeChoice] = useState<'adult' | 'minor' | ''>('')
  const [terms, setTerms] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  // dados do responsavel (pai/mae)
  const [guardianName, setGuardianName] = useState('')
  const [guardianCpf, setGuardianCpf] = useState('')
  const [guardianRg, setGuardianRg] = useState('')
  // dados do filho (menor 13-17)
  const [childName, setChildName] = useState('')
  const [childCpf, setChildCpf] = useState('')
  const [childRg, setChildRg] = useState('')
  const [consent, setConsent] = useState(false)
  const [done, setDone] = useState(false)

  if (passed || done) return null

  const handleGateConfirm = async () => {
    setError('')
    if (!ageChoice) { setError('Selecione sua faixa etaria.'); return }
    if (!terms) { setError('Voce precisa aceitar os Termos e a Politica de Privacidade para continuar.'); return }
    setChecking(true)
    try {
      const result = await acceptAgeGate()
      if (!result.ok) { setError(result.error || 'Nao foi possivel confirmar sua idade.'); setChecking(false); return }
      if (ageChoice === 'minor') {
        setAgeGroup('minor')
        setStep('minor')
        setMinorSubStep('guardian')
        setChecking(false)
      } else {
        setAgeGroup('adult')
        setDone(true)
        setChecking(false)
        window.location.reload()
      }
    } catch {
      setError('Falha ao validar. Tente novamente.')
      setChecking(false)
    }
  }

  const handleMinorNext = () => {
    setError('')
    if (minorSubStep === 'guardian') {
      if (!guardianName.trim()) { setError('Informe o nome completo do responsavel.'); return }
      if (guardianCpf.replace(/\D/g, '').length !== 11) { setError('CPF do responsavel invalido. Confira os numeros.'); return }
      if (!guardianRg.trim()) { setError('Informe o RG do responsavel.'); return }
      saveGuardianData({ cpf: guardianCpf, rg: guardianRg })
      setMinorSubStep('child')
    } else if (minorSubStep === 'child') {
      if (!childName.trim()) { setError('Informe o nome completo do menor.'); return }
      if (childCpf.replace(/\D/g, '').length !== 11) { setError('CPF do menor invalido. Confira os numeros.'); return }
      if (!childRg.trim()) { setError('Informe o RG do menor.'); return }
      saveChildData({ cpf: childCpf, rg: childRg })
      setMinorSubStep('consent')
    } else {
      if (!consent) { setError('O pai/mae ou responsavel precisa autorizar o uso do Friends Space pelo menor.'); return }
      setParentalConsent(true)
      setAgeGroup('minor')
      setDone(true)
      window.location.reload()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 10, color: '#e5e7eb', padding: '11px 12px', fontSize: 13.5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0b0d', padding: 16, overflowY: 'auto' }}>
      <div style={{ width: 'min(520px, 100%)', background: '#141517', border: '1px solid #2a2c30', borderRadius: 18, padding: '28px 26px', boxShadow: '0 0 80px rgba(74,222,128,0.12)', maxHeight: '96vh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <img src={assetUrl('Logo.png')} alt="Friends Space Beta" style={{ width: 64, height: 78, objectFit: 'contain', margin: '0 auto 10px', display: 'block' }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>
            Friends <span style={{ color: GREEN }}>Space</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#fbbf24', fontWeight: 700, letterSpacing: 1 }}>
            AMBIENTE SEGURO 13-17 (COM RESPONSAVEL) E 18+
          </p>
        </div>

        {step === 'gate' && (
          <>
            <div style={{ background: '#1e2e1e', border: '1px solid #2c4a2c', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Fa name="shield-halved" size={15} style={{ color: '#fbbf24', marginTop: 2, flexShrink: 0 }} />
              <p style={{ margin: 0, color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
                O Friends Space e um ambiente <b>+18</b> com controle parental para <b>adolescentes de 13 a 17 anos</b>. Menores de idade so entram com o <b>consentimento do pai, mae ou responsavel</b>, e recebem filtros de seguranca ainda mais rigorosos.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: ageChoice === 'adult' ? 'var(--bg-active)' : 'var(--bg-tertiary)', border: ageChoice === 'adult' ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <input type="radio" name="age" checked={ageChoice === 'adult'} onChange={() => setAgeChoice('adult')} style={{ marginTop: 3, accentColor: GREEN }} />
                <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
                  <b style={{ color: '#fff' }}>Tenho 18 anos ou mais</b>
                  <br />
                  Confirmo que sou maior de idade.
                </span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: ageChoice === 'minor' ? 'var(--bg-active)' : 'var(--bg-tertiary)', border: ageChoice === 'minor' ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <input type="radio" name="age" checked={ageChoice === 'minor'} onChange={() => setAgeChoice('minor')} style={{ marginTop: 3, accentColor: GREEN }} />
                <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
                  <b style={{ color: '#fff' }}>Sou menor de 18 anos (13 a 17)</b>
                  <br />
                  Vou informar os dados do pai/mae ou responsavel E os meus dados, e o responsavel vai autorizar o uso. Conteudo com filtro de seguranca reforcado.
                </span>
              </label>
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ marginTop: 2, accentColor: GREEN, width: 15, height: 15 }} />
              <span style={{ color: '#d1d5db', fontSize: 12.5, lineHeight: 1.5 }}>
                Li e concordo com os <b style={{ color: GREEN, cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); setStep('terms') }}>Termos e a Politica de Privacidade</b> e me comprometo a respeitar a lei brasileira e as regras da comunidade.
              </span>
            </label>

            {error && (
              <div style={{ background: '#3b1f1f', border: '1px solid #5a2c2c', borderRadius: 10, padding: '10px 12px', color: '#fca5a5', fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
                <Fa name="circle-xmark" size={14} style={{ marginRight: 6 }} />
                {error}
              </div>
            )}

            <button onClick={() => void handleGateConfirm()} disabled={checking} style={{ width: '100%', padding: '13px 0', background: GREEN, border: 'none', color: '#04120a', borderRadius: 10, cursor: checking ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, opacity: checking ? 0.7 : 1 }}>
              {checking ? 'Verificando...' : 'Continuar'}
            </button>

            <button onClick={() => setStep('terms')} style={{ width: '100%', marginTop: 8, padding: '10px 0', background: 'transparent', border: '1px solid #3a3d42', color: '#d1d5db', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
              <Fa name="book-open" size={14} style={{ marginRight: 6, color: GREEN }} />
              Ler lei brasileira e termos de protecao
            </button>
          </>
        )}

        {step === 'minor' && (
          <>
            <div style={{ background: '#1e2e1e', border: '1px solid #2c4a2c', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Fa name="user-shield" size={16} style={{ color: '#fbbf24', marginTop: 2, flexShrink: 0 }} />
              <p style={{ margin: 0, color: '#d1d5db', fontSize: 13, lineHeight: 1.5 }}>
                <b>Passo {minorSubStep === 'guardian' ? '1 de 3' : minorSubStep === 'child' ? '2 de 3' : '3 de 3'}.</b>{' '}
                {minorSubStep === 'guardian' && 'Informe os dados do pai, mae ou responsavel legal.'}
                {minorSubStep === 'child' && 'Agora os dados do menor (filho/filha).'}
                {minorSubStep === 'consent' && 'Confirmacao final do responsavel.'}
              </p>
            </div>

            {minorSubStep === 'guardian' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nome completo do responsavel</label>
                  <input value={guardianName} onChange={e => setGuardianName(e.target.value)} placeholder="Nome do pai, mae ou responsavel" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CPF do responsavel</label>
                  <input value={guardianCpf} onChange={e => setGuardianCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>RG do responsavel</label>
                  <input value={guardianRg} onChange={e => setGuardianRg(e.target.value)} placeholder="RG" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 11.5 }}>
                  Os dados do responsavel serao usados apenas para gerar hashes criptograficos (LGPD).
                </p>
              </div>
            )}

            {minorSubStep === 'child' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Nome completo do menor</label>
                  <input value={childName} onChange={e => setChildName(e.target.value)} placeholder="Nome do filho/filha (13 a 17 anos)" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CPF do menor</label>
                  <input value={childCpf} onChange={e => setChildCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#d1d5db', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>RG do menor</label>
                  <input value={childRg} onChange={e => setChildRg(e.target.value)} placeholder="RG do menor" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
              </div>
            )}

            {minorSubStep === 'consent' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Fa name="file-signature" size={14} style={{ color: GREEN }} />
                    Autorizacao do responsavel
                  </h3>
                  <p style={{ margin: 0, color: '#d1d5db', fontSize: 12.5, lineHeight: 1.6 }}>
                    Eu, <b>{guardianName || 'responsavel'}</b>, pai/mae ou responsavel legal, autorizo o menor <b>{childName || 'meu filho(a)'}</b> a usar o Friends Space com os filtros de seguranca reforcados. Confirmo que os dados informados sao verdadeiros.
                  </p>
                </div>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: GREEN, width: 15, height: 15 }} />
                  <span style={{ color: '#d1d5db', fontSize: 12.5, lineHeight: 1.5 }}>
                    <b>Autorizo</b> o uso do Friends Space pelo menor.
                  </span>
                </label>
              </div>
            )}

            {error && (
              <div style={{ background: '#3b1f1f', border: '1px solid #5a2c2c', borderRadius: 10, padding: '10px 12px', color: '#fca5a5', fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
                <Fa name="circle-xmark" size={14} style={{ marginRight: 6 }} />
                {error}
              </div>
            )}

            <button onClick={handleMinorNext} disabled={checking} style={{ width: '100%', padding: '13px 0', background: GREEN, border: 'none', color: '#04120a', borderRadius: 10, cursor: checking ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, opacity: checking ? 0.7 : 1 }}>
              {minorSubStep === 'guardian' ? 'Continuar com dados do menor' : minorSubStep === 'child' ? 'Continuar para autorizacao' : 'Autorizar'}
            </button>

            <button onClick={() => { if (minorSubStep === 'child') setMinorSubStep('guardian'); else if (minorSubStep === 'consent') setMinorSubStep('child'); else setStep('gate'); }} style={{ width: '100%', marginTop: 8, padding: '10px 0', background: 'transparent', border: '1px solid #3a3d42', color: '#d1d5db', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
              Voltar
            </button>
          </>
        )}

        {step === 'terms' && (
          <>
            <div style={{ background: '#1a1d20', border: '1px solid #2a2c30', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: '#fff' }}>
                <Fa name="scale-balanced" size={14} style={{ color: GREEN, marginRight: 8 }} />
                Termos, Lei Brasileira e Protecao
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <LawItem icon="fa-gavel" title="O Friends Space opera conforme a lei brasileira">
                  Este aplicativo e regulado pelas leis da Republica Federativa do Brasil, incluindo o Estatuto da Crianca e do Adolescente (ECA, Lei 8.069/1990), o Marco Civil da Internet (Lei 12.965/2014), a Lei Geral de Protecao de Dados (LGPD, Lei 13.709/2018) e o Codigo Penal (Decreto-Lei 2.848/1940).
                </LawItem>
                <LawItem icon="fa-user-shield" title="Menores de 18 anos (13-17)">
                  Adolescentes de 13 a 17 anos so acessam o Friends Space com o consentimento do pai, mae ou responsavel legal. Contas de menores recebem filtros de seguranca reforcados: palavras, links e conteudos que seriam aceitaveis para maiores de 18 sao bloqueados automaticamente.
                </LawItem>
                <LawItem icon="fa-shield-halved" title="Protecao e moderacao">
                  O Friends Space usa motor de moderacao com bloqueio de conteudos inadequados e avaliacao automatica de denuncias.
                </LawItem>
                <LawItem icon="fa-phone" title="Apoio em momentos dificeis">
                  Se voce ou alguem que voce conhece esta passando por sofrimento emocional, ligue 188 (CVV - Centro de Valorizacao da Vida, gratuito). Sua vida importa.
                </LawItem>
                <LawItem icon="fa-key" title="Privacidade e seus dados">
                  Conforme a LGPD, coletamos apenas o necessario para confirmar maioridade e proteger a plataforma.
                </LawItem>
              </div>
            </div>
            <button onClick={() => setStep('gate')} style={{ width: '100%', padding: '12px 0', background: 'transparent', border: '1px solid #3a3d42', color: '#d1d5db', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
              Voltar
            </button>
          </>
        )}

        <div style={{ marginTop: 16, borderTop: '1px solid #24262b', paddingTop: 12, textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 11, lineHeight: 1.6 }}>
            Friends Space Beta &copy; 2026. Plataforma brasileira que trabalha com a lei brasileira.
            <br />
            Seus dados sao protegidos por criptografia de ponta a ponta.
          </p>
        </div>
      </div>
    </div>
  )
}
