import { create } from 'zustand'

export type Lang = 'pt-BR' | 'en-US'

type Dict = Record<string, { 'pt-BR': string; 'en-US': string }>

const DICT: Dict = {
  'app.title': { 'pt-BR': 'Friends Space', 'en-US': 'Friends Space' },
  'nav.friends': { 'pt-BR': 'Amigos', 'en-US': 'Friends' },
  'nav.search': { 'pt-BR': 'Pesquisar', 'en-US': 'Search' },
  'nav.createServer': { 'pt-BR': 'Criar servidor', 'en-US': 'Create server' },
  'nav.joinServer': { 'pt-BR': 'Entrar com convite', 'en-US': 'Join with invite' },
  'topbar.notifications': { 'pt-BR': 'Notificacoes', 'en-US': 'Notifications' },
  'topbar.settings': { 'pt-BR': 'Configuracoes', 'en-US': 'Settings' },
  'topbar.privacy': { 'pt-BR': 'Privacidade', 'en-US': 'Privacy' },
  'topbar.appearance': { 'pt-BR': 'Aparencia', 'en-US': 'Appearance' },
  'topbar.about': { 'pt-BR': 'Sobre', 'en-US': 'About' },
  'topbar.language': { 'pt-BR': 'Idioma', 'en-US': 'Language' },
  'topbar.notifs': { 'pt-BR': 'Notificacoes', 'en-US': 'Notifications' },
  'topbar.myProfile': { 'pt-BR': 'Meu perfil', 'en-US': 'My profile' },
  'topbar.editProfile': { 'pt-BR': 'Editar perfil', 'en-US': 'Edit profile' },
  'topbar.signOut': { 'pt-BR': 'Sair', 'en-US': 'Sign out' },
  'topbar.dark': { 'pt-BR': 'Escuro', 'en-US': 'Dark' },
  'topbar.light': { 'pt-BR': 'Claro', 'en-US': 'Light' },
  'notifs.friendRequests': { 'pt-BR': 'Solicitacoes de amizade', 'en-US': 'Friend requests' },
  'notifs.none': { 'pt-BR': 'Nenhuma solicitacao de amizade.', 'en-US': 'No friend requests.' },
  'notifs.accept': { 'pt-BR': 'Aceitar', 'en-US': 'Accept' },
  'notifs.reject': { 'pt-BR': 'Recusar', 'en-US': 'Decline' },
  'notifs.none_new': { 'pt-BR': 'Sem novas notificacoes', 'en-US': 'No new notifications' },
  'profile.tab.perfil': { 'pt-BR': 'Perfil', 'en-US': 'Profile' },
  'profile.tab.aparencia': { 'pt-BR': 'Aparencia', 'en-US': 'Appearance' },
  'profile.tab.social': { 'pt-BR': 'Social', 'en-US': 'Social' },
  'profile.tab.privacidade': { 'pt-BR': 'Privacidade', 'en-US': 'Privacy' },
  'profile.tab.astro': { 'pt-BR': 'Astro', 'en-US': 'Astro' },
  'profile.save': { 'pt-BR': 'Salvar alteracoes', 'en-US': 'Save changes' },
  'chat.placeholder': { 'pt-BR': 'Mensagem', 'en-US': 'Message' },
  'chat.send': { 'pt-BR': 'Enviar', 'en-US': 'Send' },
  'chat.emojis': { 'pt-BR': 'Emojis', 'en-US': 'Emojis' },
  'chat.media': { 'pt-BR': 'Enviar midia', 'en-US': 'Send media' },
  'call.mute': { 'pt-BR': 'Silenciar', 'en-US': 'Mute' },
  'call.unmute': { 'pt-BR': 'Reativar audio', 'en-US': 'Unmute' },
  'call.deafen': { 'pt-BR': 'Desativar audio', 'en-US': 'Deafen' },
  'call.undeafen': { 'pt-BR': 'Reativar audio', 'en-US': 'Undeafen' },
  'call.share': { 'pt-BR': 'Compartilhar tela', 'en-US': 'Share screen' },
  'call.end': { 'pt-BR': 'Encerrar chamada', 'en-US': 'End call' },
  'call.connected': { 'pt-BR': 'Conectado', 'en-US': 'Connected' },
  'call.connecting': { 'pt-BR': 'Conectando...', 'en-US': 'Connecting...' },
  'users.online': { 'pt-BR': 'Usuarios Online', 'en-US': 'Online Users' },
  'users.onlineCount': { 'pt-BR': 'online', 'en-US': 'online' },
  'friends.addTitle': { 'pt-BR': 'Adicionar amigo', 'en-US': 'Add friend' },
  'friends.yourCode': { 'pt-BR': 'Seu codigo:', 'en-US': 'Your code:' },
  'friends.copy': { 'pt-BR': 'Copiar', 'en-US': 'Copy' },
  'friends.addBtn': { 'pt-BR': 'Adicionar', 'en-US': 'Add' },
  'friends.searchPlaceholder': { 'pt-BR': 'Nome de usuario ou codigo', 'en-US': 'Username or code' },
  'friends.searchFriends': { 'pt-BR': 'Buscar amigos', 'en-US': 'Search friends' },
  'friends.tab.all': { 'pt-BR': 'Todas', 'en-US': 'All' },
  'friends.tab.unread': { 'pt-BR': 'Nao lidas', 'en-US': 'Unread' },
  'server.selectChannel': { 'pt-BR': 'Selecione um canal para comecar', 'en-US': 'Select a channel to start' },
  'server.roles': { 'pt-BR': 'Cargos', 'en-US': 'Roles' },
  'server.edit': { 'pt-BR': 'Editar', 'en-US': 'Edit' },
  'server.invite': { 'pt-BR': 'Convidar', 'en-US': 'Invite' },
  'server.copied': { 'pt-BR': 'Copiado!', 'en-US': 'Copied!' },
  'settings.title': { 'pt-BR': 'Configuracoes', 'en-US': 'Settings' },
  'settings.account': { 'pt-BR': 'Conta', 'en-US': 'Account' },
  'settings.voice': { 'pt-BR': 'Voz e Audio', 'en-US': 'Voice & Video' },
  'settings.appearance': { 'pt-BR': 'Aparencia', 'en-US': 'Appearance' },
  'settings.system': { 'pt-BR': 'Sistema', 'en-US': 'System' },
  'settings.displayName': { 'pt-BR': 'Nome de exibicao', 'en-US': 'Display name' },
  'settings.aboutMe': { 'pt-BR': 'Sobre mim', 'en-US': 'About me' },
  'settings.save': { 'pt-BR': 'Salvar alteracoes', 'en-US': 'Save changes' },
  'settings.saving': { 'pt-BR': 'Salvando...', 'en-US': 'Saving...' },
  'settings.saved': { 'pt-BR': 'Salvo!', 'en-US': 'Saved!' },
  'settings.mic': { 'pt-BR': 'Microfone', 'en-US': 'Microphone' },
  'settings.micHint': { 'pt-BR': 'Mude o dispositivo de entrada usado nas chamadas.', 'en-US': 'Change the input device used in calls.' },
  'settings.systemDefault': { 'pt-BR': 'Padrao do sistema', 'en-US': 'System default' },
  'settings.output': { 'pt-BR': 'Fone de ouvido / saida', 'en-US': 'Headset / output' },
  'settings.outputHint': { 'pt-BR': 'Altere para onde sai o audio das chamadas.', 'en-US': 'Change where call audio plays.' },
  'settings.outputUnsupported': { 'pt-BR': 'Seu navegador nao suporta trocar a saida de audio.', 'en-US': 'Your browser cannot change audio output.' },
  'settings.outputVolume': { 'pt-BR': 'Volume de saida da chamada', 'en-US': 'Call output volume' },
  'settings.outputVolumeHint': { 'pt-BR': 'Aplicado a todos os participantes da chamada atual.', 'en-US': 'Applied to all participants in the current call.' },
  'settings.audioProcessing': { 'pt-BR': 'Processamento de audio', 'en-US': 'Audio processing' },
  'settings.echo': { 'pt-BR': 'Cancelamento de eco', 'en-US': 'Echo cancellation' },
  'settings.noise': { 'pt-BR': 'Supressao de ruido', 'en-US': 'Noise suppression' },
  'settings.agc': { 'pt-BR': 'Controle automatico de ganho', 'en-US': 'Auto gain control' },
  'settings.theme': { 'pt-BR': 'Tema', 'en-US': 'Theme' },
  'settings.dark': { 'pt-BR': 'Escuro', 'en-US': 'Dark' },
  'settings.light': { 'pt-BR': 'Claro', 'en-US': 'Light' },
  'settings.profileCustom': { 'pt-BR': 'Personalizacao do perfil', 'en-US': 'Profile customization' },
  'settings.backend': { 'pt-BR': 'Backend', 'en-US': 'Backend' },
  'settings.drive': { 'pt-BR': 'Google Drive', 'en-US': 'Google Drive' },
  'settings.driveHint': { 'pt-BR': 'Midias e arquivos ficam na sua propria pasta FRIENDS-SPACE do Drive, compartilhados so com quem voce escolher.', 'en-US': 'Media and files live in your own FRIENDS-SPACE Drive folder, shared only with who you choose.' },
  'settings.connected': { 'pt-BR': 'Conectado', 'en-US': 'Connected' },
  'settings.notConnected': { 'pt-BR': 'Nao conectado', 'en-US': 'Not connected' },
  'settings.disconnect': { 'pt-BR': 'Desconectar', 'en-US': 'Disconnect' },
  'settings.connectDrive': { 'pt-BR': 'Conectar ao Drive', 'en-US': 'Connect to Drive' },
  'settings.wait': { 'pt-BR': 'Aguarde...', 'en-US': 'Wait...' },
  'settings.about': { 'pt-BR': 'Sobre', 'en-US': 'About' },
  'media.viewer': { 'pt-BR': 'Midia', 'en-US': 'Media' },
  'media.openBrowser': { 'pt-BR': 'Abrir no navegador', 'en-US': 'Open in browser' },
  'media.download': { 'pt-BR': 'Baixar', 'en-US': 'Download' },
  'media.copyLink': { 'pt-BR': 'Copiar link', 'en-US': 'Copy link' },
  'media.linkCopied': { 'pt-BR': 'Link copiado!', 'en-US': 'Link copied!' },
  'media.forward': { 'pt-BR': 'Encaminhar', 'en-US': 'Forward' },
  'media.zoomIn': { 'pt-BR': 'Ampliar', 'en-US': 'Zoom in' },
  'media.zoomOut': { 'pt-BR': 'Diminuir', 'en-US': 'Zoom out' },
  'media.noFriends': { 'pt-BR': 'Nenhum amigo para encaminhar.', 'en-US': 'No friends to forward to.' },
  'media.forwardedTo': { 'pt-BR': 'Encaminhado para', 'en-US': 'Forwarded to' },
  'media.copiedId': { 'pt-BR': 'ID copiado!', 'en-US': 'ID copied!' },
  'astro.activate': { 'pt-BR': 'Ativar ASTRO agora', 'en-US': 'Activate ASTRO now' },
  'astro.deactivate': { 'pt-BR': 'Desativar ASTRO', 'en-US': 'Deactivate ASTRO' },
  'astro.processing': { 'pt-BR': 'Processando...', 'en-US': 'Processing...' },
  'astro.demoNote': { 'pt-BR': 'Modo demonstracao: a ativacao salva a insignia no seu perfil.', 'en-US': 'Demo mode: activating saves the badge to your profile.' },
  'astro.activeNote': { 'pt-BR': 'ASTRO ativo no seu perfil.', 'en-US': 'ASTRO is active on your profile.' },
  'menu.conversar': { 'pt-BR': 'Conversar', 'en-US': 'Message' },
  'menu.viewProfile': { 'pt-BR': 'Ver perfil', 'en-US': 'View profile' },
  'menu.acceptRequest': { 'pt-BR': 'Aceitar solicitacao', 'en-US': 'Accept request' },
  'menu.declineRequest': { 'pt-BR': 'Recusar solicitacao', 'en-US': 'Decline request' },
  'menu.requestSent': { 'pt-BR': 'Solicitacao enviada', 'en-US': 'Request sent' },
  'menu.alreadyFriends': { 'pt-BR': 'Ja sao amigos', 'en-US': 'Already friends' },
  'menu.sendRequest': { 'pt-BR': 'Mandar solicitacao', 'en-US': 'Send request' },
  'menu.removeFriend': { 'pt-BR': 'Remover amigo', 'en-US': 'Remove friend' },
  'menu.copyId': { 'pt-BR': 'Copiar ID', 'en-US': 'Copy ID' },
  'menu.copied': { 'pt-BR': 'Copiado!', 'en-US': 'Copied!' },
  'menu.joinedOn': { 'pt-BR': 'Entrou em', 'en-US': 'Joined on' },
  'menu.friend': { 'pt-BR': 'Amigo', 'en-US': 'Friend' },
  'menu.verified': { 'pt-BR': 'Verificado', 'en-US': 'Verified' },
  'emoji.custom': { 'pt-BR': 'Personalizados', 'en-US': 'Custom' },
  'emoji.add': { 'pt-BR': 'Adicionar emoji', 'en-US': 'Add emoji' },
  'emoji.delete': { 'pt-BR': 'Remover emoji', 'en-US': 'Delete emoji' },
  'emoji.needDrive': { 'pt-BR': 'Conecte o Google Drive para enviar emojis (Configuracoes > Sistema).', 'en-US': 'Connect Google Drive to upload emojis (Settings > System).' },
  'emoji.badName': { 'pt-BR': 'Nome de arquivo invalido. Use apenas letras, numeros e _.', 'en-US': 'Invalid file name. Use only letters, numbers and _.' },
  'emoji.uploadFail': { 'pt-BR': 'Falha ao enviar a imagem.', 'en-US': 'Failed to upload the image.' },
  'emoji.gifs': { 'pt-BR': 'GIFs', 'en-US': 'GIFs' },
  'emoji.stickers': { 'pt-BR': 'Figurinhas', 'en-US': 'Stickers' },
  'emoji.kindEmoji': { 'pt-BR': 'Emoji', 'en-US': 'Emoji' },
  'emoji.kindGif': { 'pt-BR': 'GIF', 'en-US': 'GIF' },
  'emoji.kindSticker': { 'pt-BR': 'Figurinha', 'en-US': 'Sticker' },
  'emoji.astroNote': { 'pt-BR': 'Use os emojis, gifs e figurinhas de todos os seus servidores com ASTRO.', 'en-US': 'Use emojis, gifs and stickers from all your servers with ASTRO.' },
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

function readLang(): Lang {
  try {
    const stored = localStorage.getItem('friends-space:lang')
    return stored === 'en-US' ? 'en-US' : 'pt-BR'
  } catch {
    return 'pt-BR'
  }
}

function applyDocLang(lang: Lang) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'en-US' ? 'en' : 'pt-BR'
  }
}

const initialLang = typeof window !== 'undefined' ? readLang() : 'pt-BR'
applyDocLang(initialLang)

export const useLangStore = create<LangState>((set, get) => ({
  lang: initialLang,
  setLang: (lang) => {
    try { localStorage.setItem('friends-space:lang', lang) } catch { }
    applyDocLang(lang)
    set({ lang })
  },
  t: (key) => {
    const { lang } = get()
    const entry = DICT[key]
    if (!entry) return key
    return entry[lang]
  },
}))
