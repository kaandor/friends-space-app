import { isDevUser } from './dev'

export interface PermissionServer {
  ownerId: string
  staffMemberIds?: string[]
  roles?: { id: string; permissions?: string[] }[]
  memberRoles?: Record<string, string[]>
}

export const SERVER_PERMISSIONS: { key: string; label: string; desc: string; group: string }[] = [
  { key: 'administrator', group: 'Administração', label: 'Administrador', desc: 'Acesso total: vê e gerencia todas as seções do servidor' },
  { key: 'manageServer', group: 'Administração', label: 'Gerenciar servidor', desc: 'Identidade, configurações, segurança e integrações' },
  { key: 'manageRoles', group: 'Administração', label: 'Gerenciar cargos', desc: 'Criar, editar cargos e dar cargos a membros' },
  { key: 'manageMembers', group: 'Membros', label: 'Gerenciar membros', desc: 'Adicionar e remover pessoas do servidor' },
  { key: 'moderate', group: 'Membros', label: 'Moderar membros', desc: 'Silenciar, expulsar e banir membros' },
  { key: 'announce', group: 'Membros', label: 'Publicar anúncios', desc: 'Enviar anúncios nos canais do servidor' },
  { key: 'manageChannels', group: 'Estrutura', label: 'Gerenciar canais', desc: 'Criar e excluir canais e categorias' },
  { key: 'manageEvents', group: 'Estrutura', label: 'Gerenciar eventos', desc: 'Criar e excluir eventos' },
  { key: 'manageInvites', group: 'Estrutura', label: 'Gerenciar convites', desc: 'Criar e revogar convites' },
  { key: 'manageEmojis', group: 'Estrutura', label: 'Gerenciar emojis', desc: 'Adicionar e remover emojis e figurinhas' },
  { key: 'viewAudit', group: 'Segurança', label: 'Ver auditoria', desc: 'Consultar o registro de ações do servidor' },
  { key: 'sendMessages', group: 'Segurança', label: 'Conversar', desc: 'Enviar mensagens nos canais de texto' },
]

export const ROLE_TEMPLATES: { name: string; color: string; permissions: string[] }[] = [
  { name: 'Administrador', color: '#E74C3C', permissions: ['administrator'] },
  { name: 'Moderador', color: '#29A3FF', permissions: ['moderate', 'manageMembers', 'viewAudit', 'announce'] },
  { name: 'Suporte', color: '#2ECC71', permissions: ['viewAudit', 'sendMessages'] },
  { name: 'Anunciante', color: '#F1C40F', permissions: ['announce'] },
  { name: 'Membro', color: '#95A5A6', permissions: ['sendMessages'] },
  { name: 'VIP', color: '#9B59B6', permissions: ['sendMessages'] },
  { name: 'Visitante', color: '#7F8C8D', permissions: [] },
]

export const SECTION_PERMISSIONS: Record<string, string | null> = {
  visao: null,
  estatisticas: null,
  auditoria: 'viewAudit',
  config: 'manageServer',
  canais: 'manageChannels',
  categorias: 'manageChannels',
  cargos: 'manageRoles',
  membros: 'manageMembers',
  eventos: 'manageEvents',
  emojis: 'manageEmojis',
  figurinhas: 'manageEmojis',
  convites: 'manageInvites',
  widget: 'manageServer',
  modelo: 'manageServer',
  visao_comunidade: null,
  habilitacao: null,
  descoberta: 'manageServer',
  publicacoes: 'announce',
  regras: 'manageServer',
  moderacao: 'moderate',
  automod: 'manageServer',
  integracoes: 'manageServer',
  webhooks: 'manageServer',
  bots: 'manageServer',
}

export const isServerOwnerOrStaff = (server: PermissionServer | null | undefined, userId?: string | null): boolean =>
  Boolean(userId && server && (isDevUser(userId) || server.ownerId === userId || (server.staffMemberIds || []).includes(userId)))

export const permissionsOfMember = (server: PermissionServer | null | undefined, userId?: string | null): Set<string> => {
  const all = new Set(SERVER_PERMISSIONS.map(p => p.key))
  if (!userId || !server) return new Set()
  if (isServerOwnerOrStaff(server, userId)) return all
  const roleIds = Array.isArray(server.memberRoles?.[userId]) ? server.memberRoles![userId] : []
  const out = new Set<string>()
  for (const role of server.roles || []) {
    if (!role || !roleIds.includes(role.id)) continue
    for (const perm of role.permissions || []) out.add(String(perm))
  }
  return out
}

export const memberHasPermission = (server: PermissionServer | null | undefined, userId: string | null | undefined, perm: string): boolean => {
  const perms = permissionsOfMember(server, userId)
  return perms.has('administrator') || perms.has(perm)
}

export const canManageServer = (server: PermissionServer | null | undefined, userId?: string | null): boolean =>
  isServerOwnerOrStaff(server, userId) || permissionsOfMember(server, userId).size > 0

export const canAccessSection = (server: PermissionServer | null | undefined, userId: string | null | undefined, key: string): boolean => {
  const need = SECTION_PERMISSIONS[key]
  if (need === null) return canManageServer(server, userId)
  return memberHasPermission(server, userId, need)
}

export const canDeleteServer = (server: PermissionServer | null | undefined, userId?: string | null): boolean =>
  Boolean(userId && server && (isDevUser(userId) || server.ownerId === userId))
