const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const logoB64 = fs.readFileSync(path.join(__dirname, 'public', 'Logo.png')).toString('base64')

// Icones SVG brancos (inline, stroke/fill #ffffff)
const phone = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
const live = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M10 9v6l5-3z"/><path d="M8 21h8"/></svg>'
const verify = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'
const drive = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15 12 3l6 12M6 15l-3 6h18l-3-6M9.5 9h5"/></svg>'
const server = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/></svg>'
const chat = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
const wrench = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
const zap = '<svg viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="0.5"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>'
const brain = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4.5 20V8.5A2.5 2.5 0 0 1 7 6.02V4.5A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 19.5 20V8.5A2.5 2.5 0 0 0 17 6.02V4.5A2.5 2.5 0 0 0 14.5 2z"/></svg>'
const bot = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 4h6M9 13h.01M15 13h.01"/></svg>'
const keyboard = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></svg>'
const sparkles = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/></svg>'
const user = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
const db = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
const tri = '<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M22 21H2L12 3l10 18z"/></svg>'
const cloud = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/></svg>'
const at = '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>'
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
const xmark = '<svg viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
const warn = '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>'
const iSVG = { phone, live, verify, drive, server, chat, wrench, zap, brain, bot, keyboard, sparkles, user, db, tri, cloud, at, check, xmark, warn }

const icon = (name, size = 22) => `<div style="width:${size}px;height:${size}px;flex:none;">${iSVG[name]}</div>`

// Slides de verificacao/competicao na tabela
const Y = '<span style="color:#00ff88">✓</span>'
const N = '<span style="color:#f87171">✗</span>'
const P = '<span style="color:#fbbf24">◐</span>'

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: 16in 9in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: rgb(10,11,13); color: #fff; }
  .slide {
    width: 16in; height: 9in; page-break-after: always;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0.7in 1in; position: relative; overflow: hidden;
  }
  .slide:last-child { page-break-after: auto; }
  .accent { position: absolute; width: 900px; height: 900px; border-radius: 50%; filter: blur(120px); opacity: 0.18; pointer-events: none; }
  .a1 { background: #00ff88; top: -200px; right: -200px; }
  .a2 { background: #5865f2; bottom: -250px; left: -150px; }
  .logo { height: 96px; width: 64px; object-fit: contain; margin-bottom: 18px; }
  .kicker { color: #00ff88; font-size: 17px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; }
  h1 { font-size: 62px; font-weight: 800; line-height: 1.1; margin-bottom: 18px; }
  h2 { font-size: 44px; font-weight: 800; margin-bottom: 20px; color: #00ff88; }
  h3 { font-size: 26px; font-weight: 700; margin: 22px 0 10px; color: #fff; }
  p.sub { font-size: 24px; color: #b8bfc6; line-height: 1.5; }
  ul { list-style: none; font-size: 25px; line-height: 1.9; }
  ul li { padding-left: 30px; position: relative; color: #e5e9ec; }
  ul li::before { content: '▸'; position: absolute; left: 0; color: #00ff88; font-weight: 700; }
  ul li strong { color: #fff; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
  .card { background: #16181c; border: 1px solid #26282e; border-radius: 16px; padding: 22px 26px; }
  .card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .card-head svg { width: 26px; height: 26px; flex: none; }
  .card h4 { color: #00ff88; font-size: 21px; }
  .card p, .card li { font-size: 19px; color: #cdd3d8; line-height: 1.6; }
  .num { font-size: 60px; font-weight: 800; color: #00ff88; }
  .big-tag { display: inline-block; background: #16181c; border: 1px solid #00ff88; color: #fff; border-radius: 10px; padding: 8px 18px; font-size: 20px; margin: 6px 6px 0 0; }
  .stack { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
  .chip { background: #16181c; border: 1px solid #26282e; border-radius: 10px; padding: 10px 20px; font-size: 20px; color: #e5e9ec; display: flex; align-items: center; gap: 10px; }
  .chip svg { width: 26px; height: 26px; flex: none; }
  .timestamp { position: absolute; bottom: 26px; right: 40px; color: #6b7280; font-size: 13px; }
  .pag { position: absolute; bottom: 26px; left: 40px; color: #6b7280; font-size: 13px; }
  .footlogo { position: absolute; top: 26px; left: 40px; display: flex; align-items: center; gap: 12px; color: #8b949e; font-size: 15px; font-weight: 600; }
  .footlogo img { height: 42px; width: 28px; object-fit: contain; }
  table { width: 100%; border-collapse: collapse; font-size: 20px; }
  th { text-align: left; color: #00ff88; padding: 12px 14px; border-bottom: 2px solid #00ff88; font-size: 20px; }
  td { padding: 12px 14px; border-bottom: 1px solid #26282e; color: #e5e9ec; }
  td:first-child { font-weight: 700; color: #fff; }
  .quote { font-size: 32px; font-style: italic; color: #cdd3d8; border-left: 6px solid #00ff88; padding-left: 28px; line-height: 1.6; }
  .ask-box { background: linear-gradient(135deg, #12271c, #101418); border: 1px solid #00ff88; border-radius: 18px; padding: 26px 34px; }
  .ask-box .num { font-size: 44px; }
  .funds { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
  .funds div { background: #16181c; border-radius: 10px; padding: 14px 18px; font-size: 19px; }
  .funds strong { color: #00ff88; display: block; font-size: 24px; margin-bottom: 4px; }
  .row { display: flex; align-items: center; gap: 16px; }
  .row svg { width: 40px; height: 40px; flex: none; }
</style>
</head>
<body>

<!-- SLIDE 1: CAPA -->
<div class="slide">
  <div class="accent a1"></div><div class="accent a2"></div>
  <div class="row" style="margin-bottom:22px;">${icon('user', 30)}
    <img class="logo" src="data:image/png;base64,${logoB64}" alt="Friends Space Logo">
  </div>
  <div class="kicker">Rede Social para Jovens</div>
  <h1>Friends Space</h1>
  <p class="sub">Calls P2P criptografados &bull; Transmissões até 2K60fps &bull; Comunidades &bull; Verificação biométrica facial + RG (em teste)</p>
</div>

<!-- SLIDE 2: O PROBLEMA -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">O Problema</div>
  <h2>Comunicação jovem sem confiança</h2>
  <ul>
    <li><strong>Falta verificação de idade real</strong> - nenhuma rede jovem exige prova segura de identidade</li>
    <li><strong>Calls sem privacidade</strong> - conexões não-criptografadas e de baixa qualidade</li>
    <li><strong>Sem armazenamento próprio</strong> - o usuário não controla onde seus arquivos e calls ficam</li>
    <li><strong>Qualidade limitada</strong> - streams raramente passam de 720p nas concorrentes</li>
    <li><strong>Onboarding complexo</strong> - verificações de idade dificultam a adoção</li>
  </ul>
</div>

<!-- SLIDE 3: A SOLUÇÃO -->
<div class="slide">
  <div class="accent a2"></div>
  <div class="kicker">A Solução</div>
  <h2>Uma rede social construída para jovens</h2>
  <div class="grid2">
    <div class="card"><div class="card-head">${icon('phone')}<h4>Calls P2P Criptografados</h4></div><p>Chamadas ponto a ponto com modo controle remoto e privacidade de ponta a ponta.</p></div>
    <div class="card"><div class="card-head">${icon('live')}<h4>Transmissões até 2K60fps</h4></div><p>Streaming de alta qualidade com qualidade personalizada por usuário.</p></div>
    <div class="card"><div class="card-head">${icon('verify')}<h4>Acesso verificado por idade</h4></div><p>Biometria facial + RG com MediaPipe (esqueleto, pele e íris) - em testes.</p></div>
    <div class="card"><div class="card-head">${icon('drive')}<h4>Google Drive por usuário</h4></div><p>Cada usuário tem seu próprio armazenamento para calls, transmissões e arquivos.</p></div>
    <div class="card"><div class="card-head">${icon('server')}<h4>Servidores de Comunidade</h4></div><p>Criação e gestão de servidores de comunidade para grupos de interesse.</p></div>
    <div class="card"><div class="card-head">${icon('chat')}<h4>Chat DM</h4></div><p>Mensagens diretas privadas e seguras dentro da plataforma.</p></div>
  </div>
</div>

<!-- SLIDE 4: HIGHLIGHTS & MOAT -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">Diferenciais</div>
  <h2>Produto &amp; Moat Técnico</h2>
  <div class="grid2">
    <div class="card">
      <div class="card-head">${icon('phone')}<h4>Recursos do Produto</h4></div>
      <ul style="font-size:20px; line-height:1.7;">
        <li>Calls P2P com baixa latência + controle remoto</li>
        <li>Transmissões até 2K60fps com qualidade personalizada</li>
        <li>Status de verificação biométrica no perfil</li>
        <li>Servidores de comunidade</li>
        <li>Chat DM privado</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-head">${icon('wrench')}<h4>Moat Técnico</h4></div>
      <ul style="font-size:20px; line-height:1.7;">
        <li>MediaPipe Face Landmarker - 478 pontos faciais, yaw, liveness</li>
        <li>dHash facial por CPF com histórico de 4 amostras</li>
        <li>Validação RG: comparação selfie x RG (esqueleto + pele + íris)</li>
        <li>Cloudflare Pages + proxy Vercel</li>
        <li>Mobile-first: 100dvh, safe-area, otimizado para iPhone</li>
      </ul>
    </div>
  </div>
</div>

<!-- SLIDE 5: COMO FUNCIONA -->
<div class="slide">
  <div class="accent a2"></div>
  <div class="kicker">Como Funciona</div>
  <h2>Onboarding com verificação em 7 passos</h2>
  <ul style="font-size:22px; line-height:2;">
    <li><strong>1.</strong> Login com Google → criação da conta</li>
    <li><strong>2.</strong> AgeGate18 → QR code + biometria de responsável (menores)</li>
    <li><strong>3.</strong> BiometricQR → selfie + frente e verso do RG</li>
    <li><strong>4.</strong> MediaPipe → giro da cabeça (esquerda/direita/centro), piscada, liveness</li>
    <li><strong>5.</strong> Comparação dHash → aceite com histórico de 4 amostras (tolerância 0.45)</li>
    <li><strong>6.</strong> Acesso liberado → perfil, calls, transmissões e comunidades</li>
    <li><strong>7.</strong> Armazenamento automático → calls e arquivos salvos no Google Drive do usuário</li>
  </ul>
</div>

<!-- SLIDE 6: BUSINESS MODEL -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">Negócio</div>
  <h2>Modelo de Negócio</h2>
  <div class="grid2">
    <div class="card">
      <div class="card-head">${icon('zap')}<h4>Fase Atual</h4></div>
      <p>Beta/teste com foco em crescimento de usuários e validação do fluxo biométrico.</p>
    </div>
    <div class="card">
      <div class="card-head">${icon('sparkles')}<h4>Monetização Futura</h4></div>
      <ul style="font-size:19px;">
        <li>Premium: maior qualidade de stream e temas de servidor</li>
        <li>Boosts de comunidade: customização e limites maiores</li>
        <li>Integrações de marca seguras para o público jovem</li>
      </ul>
    </div>
    <div class="card"><div class="card-head">${icon('drive')}<h4>Custo de Armazenamento</h4></div><p>Google Drive por usuário com cotas otimizadas - custo marginal baixo.</p></div>
    <div class="card"><div class="card-head">${icon('cloud')}<h4>Infra</h4></div><p>Cloudflare Pages (tier gratuito) + proxy Vercel - OpEx enxuto.</p></div>
  </div>
</div>

<!-- SLIDE 7: MERCADO -->
<div class="slide">
  <div class="accent a2"></div>
  <div class="kicker">Mercado</div>
  <h2>Oportunidade de Mercado</h2>
  <div class="grid2">
    <div><div class="num">50M+</div><p style="font-size:20px;color:#b8bfc6;">TAM - Redes sociais jovens (LATAM + EUA)</p></div>
    <div><div class="num">5M</div><p style="font-size:20px;color:#b8bfc6;">SAM - Apps com verificação de idade + calls</p></div>
    <div><div class="num">50K</div><p style="font-size:20px;color:#b8bfc6;">SOM - Primeiros adotantes em busca de plataforma verificada</p></div>
    <div><div class="num">↑</div><p style="font-size:20px;color:#b8bfc6;">Crescimento: crescente preocupação com privacidade e demanda por plataformas seguras para jovens</p></div>
  </div>
</div>

<!-- SLIDE 8: TRAÇÃO -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">Tração</div>
  <h2>Progresso e Métricas</h2>
  <div style="display:flex; gap:24px; margin-bottom:26px;">
    <div class="card" style="flex:1; text-align:center;"><div class="num" style="font-size:52px;">R$ 0</div><p style="font-size:18px;color:#b8bfc6;">Gasto até hoje<br><strong style="color:#00ff88;">nenhum centavo na plataforma</strong></p></div>
    <div class="card" style="flex:1; text-align:center;"><div class="num" style="font-size:52px;">16 dias</div><p style="font-size:18px;color:#b8bfc6;">Plataforma em<br><strong style="color:#00ff88;">desenvolvimento (0 → 16 dias)</strong></p></div>
  </div>
  <ul style="font-size:22px; line-height:1.8;">
    <li><strong>Plataforma ativa</strong> - deploy no Cloudflare Pages, domínio <span style="color:#00ff88;">friends-space.pages.dev</span></li>
    <li><strong>Biometria</strong> - integração MediaPipe com rastreamento de 478 landmarks</li>
    <li><strong>Captura mobile</strong> - selfie + RG otimizados (resize 900px, qualidade 0.6/0.85)</li>
    <li><strong>Pipeline de deploy</strong> - wrangler pages deploy dist --branch production</li>
    <li><strong>Código</strong> - TypeScript estrito, tsc -b + vite build</li>
    <li><strong>Iterações</strong> - 20+ correções de yaw, overlay, captura e análise de RG</li>
  </ul>
</div>

<!-- SLIDE 9: STACK -->
<div class="slide">
  <div class="accent a2"></div>
  <div class="kicker">Stack &amp; Hospedagem</div>
  <h2>Tecnologias e Funcionamento</h2>
  <div class="grid2">
    <div class="card">
      <div class="card-head">${icon('keyboard')}<h4>Frontend &amp; Interface</h4></div>
      <ul style="font-size:19px;">
        <li>React + TypeScript (modo estrito)</li>
        <li>Vite - build otimizado</li>
        <li>MediaPipe Face Landmarker</li>
        <li>Canvas - captura, análise de RG e geração dHash</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-head">${icon('server')}<h4>Backend &amp; Hospedagem</h4></div>
      <ul style="font-size:19px;">
        <li>Cloudflare Pages - hospedagem do site</li>
        <li>Vercel - backend API proxy</li>
        <li>Turso - banco de dados relacional</li>
        <li>Google Drive - armazenamento por usuário</li>
        <li>Cloudflare Tunnel - conexão segura</li>
      </ul>
    </div>
  </div>
  <div class="stack">
    <div class="chip">${icon('cloud')} Cloudflare</div>
    <div class="chip">${icon('tri')} Vercel</div>
    <div class="chip">${icon('db')} Turso</div>
    <div class="chip">${icon('drive')} Google Drive</div>
    <div class="chip">${icon('zap')} React</div>
    <div class="chip">${icon('keyboard')} TypeScript</div>
  </div>
</div>

<!-- SLIDE 10: COMPETIÇÃO -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">Competição</div>
  <h2>Paisagem Competitiva</h2>
  <table>
    <tr><th>Recurso</th><th>Friends Space</th><th>WhatsApp</th><th>Discord</th><th>Snapchat</th></tr>
    <tr><td>Verificação por idade</td><td>${Y} Biometria + RG</td><td>${N} Nenhuma</td><td>${P} Nível servidor</td><td>${P} Celular</td></tr>
    <tr><td>Calls P2P criptografadas</td><td>${Y} Completo</td><td>${N} Nenhum</td><td>${P} Só voz</td><td>${N} Nenhum</td></tr>
    <tr><td>Streaming 2K60fps</td><td>${Y} Sim</td><td>${N} Nenhum</td><td>${P} Máx 720p</td><td>${N} Nenhum</td></tr>
    <tr><td>Armazenamento individual</td><td>${Y} Google Drive</td><td>${N} Nenhum</td><td>${P} Storage servidor</td><td>${N} Nenhum</td></tr>
    <tr><td>Servidores de comunidade</td><td>${Y} Sim</td><td>${N} Limitado</td><td>${Y} Sim</td><td>${N} Nenhum</td></tr>
    <tr><td>Chat DM</td><td>${Y} Sim</td><td>${Y} Sim</td><td>${Y} Sim</td><td>${Y} Sim</td></tr>
  </table>
</div>

<!-- SLIDE 11: TIME -->
<div class="slide">
  <div class="accent a2"></div>
  <div class="kicker">Time</div>
  <h2>Desenvolvedores</h2>
  <div class="grid2">
    <div class="card"><div class="card-head">${icon('user')}<h4>Kaandro Bezerra</h4></div><p>Backend &amp; Liveness Logic - APIs, biometria, validação e infraestrutura.</p></div>
    <div class="card"><div class="card-head">${icon('user')}<h4>Maycon da Silva</h4></div><p>Frontend, Interface &amp; Recursos - UI, captura mobile, experiência do usuário.</p></div>
  </div>
  <div class="stack">
    <div class="chip">${icon('wrench')} opencode CLI</div>
    <div class="chip">${icon('zap')} Mimo</div>
    <div class="chip">${icon('brain')} Deepseek</div>
    <div class="chip">${icon('bot')} Nemotron</div>
    <div class="chip">${icon('keyboard')} VS Code</div>
    <div class="chip">${icon('sparkles')} GPT</div>
  </div>
</div>

<!-- SLIDE 12: ASK -->
<div class="slide">
  <div class="accent a1"></div>
  <div class="kicker">Aporte</div>
  <h2>Uso dos Recursos</h2>
  <div class="ask-box">
    <div class="num">R$ 500K - R$ 1M</div>
    <p style="font-size:22px; color:#cdd3d8; margin-top:8px;">ou equivalente em US$</p>
  </div>
  <div class="funds">
    <div><strong>40%</strong> Desenvolvimento (visão computacional mobile, escalonamento backend)</div>
    <div><strong>30%</strong> Crescimento (aquisição de usuários, comunidades, parcerias)</div>
    <div><strong>20%</strong> Operações (infra, compliance, legal)</div>
    <div><strong>10%</strong> Contingência</div>
  </div>
  <p style="font-size:20px; margin-top:20px;color:#b8bfc6;"><strong style="color:#fff;">Marcos:</strong> 100K usuários beta, lançamento premium, receita positiva</p>
</div>

<!-- SLIDE 13: VISÃO -->
<div class="slide">
  <div class="accent a2"></div>
  <img class="logo" src="data:image/png;base64,${logoB64}" alt="Friends Space Logo">
  <div class="kicker">Visão</div>
  <h2>Tornar-se a rede social mais segura e de maior qualidade para jovens</h2>
  <p class="quote">&quot;A rede social que gostaríamos de ter aos 16 anos: verificada, de alta qualidade e verdadeiramente nossa.&quot;</p>
  <div style="display:flex; gap:24px; margin-top:34px;">
    <div class="card" style="flex:1; text-align:center;"><div class="num" style="font-size:44px;">R$ 0</div><p style="font-size:17px;color:#b8bfc6;">Nenhum centavo gasto<br><strong style="color:#00ff88;">até o momento</strong></p></div>
    <div class="card" style="flex:1; text-align:center;"><div class="num" style="font-size:44px;">16 dias</div><p style="font-size:17px;color:#b8bfc6;">de desenvolvimento<br><strong style="color:#00ff88;">(0 → 16)</strong></p></div>
    <div class="card" style="flex:1; text-align:center;"><div class="num" style="font-size:44px;">100%</div><p style="font-size:17px;color:#b8bfc6;">valor para o<br><strong style="color:#00ff88;">investimento recebido</strong></p></div>
  </div>
  <p style="margin-top:26px;color:#6b7280;font-size:18px;">Friends Space - Biometria em testes &bull; Produto ativo para construção de comunidades</p>
</div>

</body>
</html>`

fs.writeFileSync(path.join(__dirname, 'pitch-deck-final.html'), html)

async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()
  await page.goto('file://' + path.join(__dirname, 'pitch-deck-final.html'), { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 800))
  await page.pdf({
    path: path.join(__dirname, 'Friends-Space-Pitch-Decks.pdf'),
    width: '16in',
    height: '9in',
    printBackground: true,
    preferCSSPageSize: true,
    pageRanges: '1-13',
  })
  await browser.close()
  console.log('PDF gerado com sucesso: Friends-Space-Pitch-Decks.pdf')
}

main().catch(e => { console.error('ERRO:', e); process.exit(1) })