import { useEffect } from 'react'

const WIKI_BG = '#f8f9fa'
const WIKI_FG = '#202122'
const WIKI_BORDER = '#a2a9b1'
const WIKI_LINK = '#3366cc'

const infoboxRows: Array<{ label: string; value: React.ReactNode }> = [
  { label: 'Slogan', value: 'O seu espaco social na web' },
  { label: 'Criador', value: 'MHK Community' },
  { label: 'Pais', value: 'Brasil' },
  { label: 'Idioma', value: 'Portugues' },
  { label: 'Genero', value: 'Rede social, mensageiro, VoIP' },
  { label: 'Modelo de negocios', value: 'Gratuito' },
  { label: 'Plataformas', value: 'Web (navegador) e desktop (Windows)' },
  { label: 'Endereco eletronico', value: <a href="https://friends-space.pages.dev" style={{ color: WIKI_LINK }}>friends-space.pages.dev</a> },
  { label: 'Tecnologia', value: 'React, TypeScript, WebRTC' },
  { label: 'Versao', value: '1.0.0' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 id={id} style={{ fontSize: 20, fontWeight: 700, borderBottom: `1px solid ${WIKI_BORDER}`, paddingBottom: 4, margin: '28px 0 12px' }}>{title}</h2>
      {children}
    </>
  )
}

export default function AboutPage() {
  useEffect(() => {
    document.title = 'Friends Space Beta — Sobre, historia e recursos'
    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'Conheca a historia do Friends Space Beta: plataforma brasileira de servidores, canais de texto e voz, chamadas criptografadas ponto a ponto e midia no Google Drive.')
    let ld = document.getElementById('ld-about')
    if (!ld) {
      ld = document.createElement('script')
      ld.id = 'ld-about'
      ld.setAttribute('type', 'application/ld+json')
      document.head.appendChild(ld)
    }
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Friends Space Beta',
      about: 'Rede social de comunidades com servidores, canais de texto e voz e chamadas WebRTC',
      url: 'https://friends-space.pages.dev/sobre',
      inLanguage: 'pt-BR',
      publisher: { '@type': 'Organization', name: 'MHK Community', url: 'https://friends-space.pages.dev' },
    })
    return () => { document.title = 'Friends Space Beta — Grupos, amigos, chat e chamadas' }
  }, [])

  return (
    <div style={{ minHeight: '100%', background: WIKI_BG, color: WIKI_FG, fontFamily: "'Poppins', system-ui, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ borderBottom: `1px solid ${WIKI_BORDER}`, paddingBottom: 12, marginBottom: 8 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>Friends Space Beta</h1>
          <p style={{ margin: '4px 0 0', color: '#54595d', fontSize: 13 }}>Artigo enciclopedico sobre a plataforma de comunidades</p>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', minWidth: 0 }}>
            <p style={{ margin: '12px 0 0' }}>
              <b>Friends Space Beta</b> e uma plataforma brasileira de <a href="https://pt.wikipedia.org/wiki/Rede_social" style={{ color: WIKI_LINK }}>rede social</a> e comunicacao, voltada para a criacao de servidores e comunidades. Permite criar grupos com canais de texto e voz, mensagens diretas entre amigos, chamadas de voz e video ponto a ponto com criptografia ponta a ponta e armazenamento de midias no Google Drive do proprio usuario. O servico e gratuito e funciona pelo navegador, com uma versao desktop para Windows.
            </p>
            <Section id="historia" title="Historia">
              <p>
                O Friends Space Beta nasceu como um projeto da comunidade MHK Community com o objetivo de oferecer um espaco proprio de conversa, no modelo de plataformas de servidores como o Discord. Em vez de depender de terceiros, a comunidade desenvolveu um aplicativo web proprio com chamadas de voz e video criptografadas, canais organizados por categoria e integracao com o Google Drive para guardar fotos, GIFs e videos.
              </p>
              <p>
                A primeira versao publica (1.0.0) foi publicada no endereco <a href="https://friends-space.pages.dev" style={{ color: WIKI_LINK }}>friends-space.pages.dev</a>, hospedada na plataforma Cloudflare Pages, com backend serverless e banco de dados Cloudflare D1. Alem da versao web, existe um aplicativo desktop para Windows empacotado com Electron.
              </p>
            </Section>

            <Section id="recursos" title="Recursos">
              <ul style={{ margin: 0, paddingLeft: 24 }}>
                <li><b>Servidores</b> — criacao de comunidades com categorias, canais de texto e voz, convites por link e controle de permissao por cargos e staff.</li>
                <li><b>Mensagens diretas</b> — conversas privadas entre usuarios, com adicao por codigo de amigo.</li>
                <li><b>Chamadas</b> — chamadas de voz e video ponto a ponto, com suporte a sessoes de ate 20 pessoas, criptografia SRTP e modo de controle remoto de tela.</li>
                <li><b>Midia no Drive</b> — fotos, GIFs e videos ficam na pasta "friends-space" do Google Drive do proprio usuario.</li>
                <li><b>Personalizacao</b> — perfil com foto, banner e bio; servidores com icone, banner e cor de destaque proprios.</li>
              </ul>
            </Section>

            <Section id="tecnologia" title="Tecnologia">
              <p>
                O front-end e construido em React e TypeScript com o empacotador Vite. A comunicacao em tempo real usa WebRTC, com sinalizacao das sessoes feita por um backend serverless. A infraestrutura roda em Cloudflare Pages com banco de dados Cloudflare D1, e ha uma versao desktop para Windows feita com Electron.
              </p>
            </Section>

            <Section id="ver-tambem" title="Ver tambem">
              <ul style={{ margin: 0, paddingLeft: 24 }}>
                <li><a href="https://pt.wikipedia.org/wiki/Discord_(software)" style={{ color: WIKI_LINK }}>Discord (software)</a></li>
                <li><a href="https://pt.wikipedia.org/wiki/WebRTC" style={{ color: WIKI_LINK }}>WebRTC</a></li>
              </ul>
            </Section>

            <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${WIKI_BORDER}`, fontSize: 12, color: '#54595d' }}>
              Esta pagina e uma iniciativa independente da comunidade MHK Community para divulgar a plataforma.
              <br />
              <a href="/" style={{ color: WIKI_LINK }}>Voltar para o Friends Space</a>
            </div>
          </div>

          <div style={{ width: 280, flexShrink: 0 }}>
            <table style={{ width: '100%', border: `1px solid ${WIKI_BORDER}`, borderCollapse: 'collapse', background: '#fff', fontSize: 12.5 }}>
              <tbody>
                <tr>
                  <td colSpan={2} style={{ borderBottom: `1px solid ${WIKI_BORDER}`, background: '#eaecf0', textAlign: 'center', padding: 8, fontWeight: 700, fontSize: 13 }}>Friends Space Beta</td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ textAlign: 'center', padding: 10 }}>
                    <img src="/Logo.png" alt="Friends Space Beta" style={{ width: 96, height: 96, objectFit: 'contain' }} />
                  </td>
                </tr>
                {infoboxRows.map(r => (
                  <tr key={r.label}>
                    <td style={{ border: '1px solid #eaecf0', padding: '5px 8px', verticalAlign: 'top', fontWeight: 600, background: '#f8f9fa', width: '40%' }}>{r.label}</td>
                    <td style={{ border: '1px solid #eaecf0', padding: '5px 8px', verticalAlign: 'top' }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
