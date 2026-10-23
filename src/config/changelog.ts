export interface ChangelogEntry {
  version: string
  date: string
  app: string[]
  site: string[]
}

// SEMPRE atualizar a cada release (app ou site): a janela Baixar app mostra
// a primeira entrada. App = Electron; Site = web.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.8',
    date: '2026-10-21',
    app: [
      'Novo logo, ícones e banners do instalador',
      'Soundboard para de tocar quando o autor sai da call (DM e servidores)',
      'Volume dos efeitos sonoros ajustǭvel no app',
      'Fóruns, retrospectiva, conquistas e busca global no app desktop',
    ],
    site: [
      'Volume do soundboard ajustǭvel durante a call',
      'Sons de quem sai da call sǜo interrompidos para todos',
      'Busca global com Ctrl+K para servidores, canais, amigos e comandos',
      'Fóruns por servidor, retrospectiva semanal, conquistas e aniversários',
      'Modo foco, PWA instalável e central de transparência',
      'Checklist e análise de atividade no painel do servidor',
    ],
  },
  {
    version: '1.2.7',
    date: '2026-10-15',
    app: [
      'Tecnologia Light Speed: conexão até 2x mais rápida',
      'Controle remoto mais responsivo (50 comandos/s)',
      'Tela com prioridade máxima no encoder',
    ],
    site: [
      'Uploads com barra de progresso e limites por plano Astro',
      'Handshake com pool de candidatos (call abre antes)',
    ],
  },
  {
    version: '1.2.6',
    date: '2026-10-15',
    app: [
      'Atualização pelo tray funcionando (com aviso do resultado)',
      'Controle remoto unificado e verificado de ponta a ponta',
      'Tela cheia automática ao aceitar o controle',
    ],
    site: [
      'Diagnóstico com prova de entrega do controle',
      'Feed estilo X no mobile + Descubra com busca',
    ],
  },
  {
    version: '1.2.5',
    date: '2026-10-13',
    app: [
      'Controle remoto com mira corrigida (acabou o mouse travado/deslocado)',
      'Aviso claro quando o controle é indisponível (Wayland/sem xdotool)',
      'Teclado completo no controle (Enter, Tab, setas, F1–F12)',
      'Seletor de tela com tentar de novo quando vazio',
      'Botão de download certo por sistema (Windows/Linux/macOS)',
      'Aviso de update só quando há versão realmente nova',
    ],
    site: [
      'Call conecta mais rápido (sinal em lote + turbo)',
      'Tela compartilhada com slots fixos (sem erro de m-lines)',
      'Descobrir lista servidores sem digitar + Praça Central automática',
      'Diagnóstico com códigos + botão copiar (um print basta)',
      'Sons de mutar/desmutar para todos + notificações de comentários e updates',
    ],
  },
]
