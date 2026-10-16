// Página pública de Política de Privacidade (LGPD) — exigida pelo Google
// AdSense para aprovação do site. Acessível em /privacidade sem login.
export function PrivacyPage() {
  const base = 'https://friends-space.pages.dev'
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1115)', color: 'var(--text-primary, #e5e7eb)', padding: '32px 16px', fontFamily: 'Poppins, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <a href={base} style={{ color: '#29A3FF', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Voltar ao Friends Space</a>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '18px 0 6px' }}>Política de Privacidade</h1>
        <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 12.5, margin: '0 0 24px' }}>Última atualização: 25/08/2026 · Friends Space Beta</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Section title="1. Quem somos">
            <p>O Friends Space (disponível em {base}) é uma plataforma social brasileira de servidores, canais de texto e voz, chamadas e comunidade. Esta política explica como tratamos seus dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e o Estatuto da Criança e do Adolescente (ECA — Lei 8.069/1990).</p>
          </Section>

          <Section title="2. Dados que coletamos">
            <p>Coletamos apenas o necessário para o funcionamento da plataforma:</p>
            <ul style={{ paddingLeft: 20, fontSize: 13.5, lineHeight: 1.9, color: '#d1d5db' }}>
              <li>Dados de conta: nome de usuário (handle), apelido, e-mail da conta Google utilizada no login OAuth, foto de perfil e código de amigo.</li>
              <li>Dados de uso: mensagens, chamadas, servidores, posts do feed, stories e atividades — necessários para o serviço funcionar.</li>
              <li>Verificação de idade: para contas de 13 a 17 anos, o consentimento do responsável legal. Os dados informados são usados apenas para gerar resumos criptográficos (hash).</li>
              <li>Dados técnicos: endereço IP (usado apenas para detectar o idioma por país e prevenir abuso), tipo de navegador e origem da requisição.</li>
            </ul>
          </Section>

          <Section title="3. Como usamos seus dados">
            <p>Usamos seus dados para: operar e proteger a plataforma; entregar mensagens, chamadas e conteúdos; verificar maioridade e prevenir fraudes; moderar conteúdo e analisar denúncias; personalizar idioma; e exibir publicidade (Google AdSense) para usuários do plano gratuito. Não vendemos seus dados pessoais a terceiros.</p>
          </Section>

          <Section title="4. Publicidade e cookies">
            <p>O plano gratuito exibe anúncios do Google AdSense no feed, no mesmo formato de redes sociais (a cada grupo de posts). O Google pode usar cookies e tecnologias semelhantes para veicular anúncios relevantes, conforme a política do Google e os controles disponíveis em <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#29A3FF' }}>g.co/adssettings</a>. Assinantes do plano ASTRO não recebem anúncios.</p>
          </Section>

          <Section title="5. Compartilhamento">
            <p>Seus dados são processados por nossos provedores de infraestrutura (Vercel para o backend, Cloudflare Pages para o frontend, Turso para o banco de dados, Google Drive para arquivos de mídia enviados por você) e, para anúncios, pelo Google AdSense. Todos são processadores contratualmente obrigados à confidencialidade e segurança. Não compartilhamos dados com outros terceiros, exceto por obrigação legal.</p>
          </Section>

          <Section title="6. Segurança">
            <p>Aplicamos criptografia em trânsito (HTTPS/TLS) e em repouso para dados sensíveis (AES-GCM), controle de acesso restrito, lock de escrita no backend e boas práticas de segurança no código. Chamadas de voz e vídeo usam WebRTC com criptografia ponto a ponto.</p>
          </Section>

          <Section title="7. Seus direitos (LGPD)">
            <p>Você pode, a qualquer momento: acessar, corrigir ou atualizar seus dados no editor de perfil; solicitar a exclusão da conta e de todos os dados associados; revogar o consentimento; e saber quais dados tratamos. Para exercer seus direitos, envie um e-mail para suporte@friends-space.app (respondemos em até 15 dias, conforme a LGPD).</p>
          </Section>

          <Section title="8. Menores de idade">
            <p>O Friends Space é destinado a maiores de 13 anos. Usuários de 13 a 17 anos só acessam com consentimento e verificação biométrica do responsável legal, e recebem filtros de segurança reforçados. Se descobrirmos dados de crianças abaixo de 13 anos sem consentimento válido, os removeremos imediatamente.</p>
          </Section>

          <Section title="9. Retenção">
            <p>Mantemos dados de contas inativas por até 90 dias; após esse período, a conta e os dados associados são excluídos automaticamente pelo nosso sistema de manutenção, exceto quando a retenção for exigida por lei.</p>
          </Section>

          <Section title="10. Contato">
            <p>Dúvidas sobre privacidade: <b>suporte@friends-space.app</b>. Em caso de sofrimento emocional, ligue 188 (CVV — Centro de Valorização da Vida, gratuito).</p>
          </Section>
        </div>

        <p style={{ marginTop: 28, fontSize: 11.5, color: '#6b7280', textAlign: 'center' }}>Friends Space Beta · {base}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--bg-secondary, #16181d)', border: '1px solid var(--border, #23262b)', borderRadius: 12, padding: '16px 18px' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#fff' }}>{title}</h2>
      <div style={{ fontSize: 13.5, lineHeight: 1.8, color: '#d1d5db' }}>{children}</div>
    </section>
  )
}
