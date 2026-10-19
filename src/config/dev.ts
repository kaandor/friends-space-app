// Conta(s) de desenvolvedor — sempre ativas (inclusive em produção), para
// poder gerenciar/excluir servidores de teste.
export const DEV_USER_IDS: string[] = [
  'cf091bc8-e0fa-4331-b06a-03cf908ab132',
]

export const isDevUser = (userId?: string | null) => Boolean(userId && DEV_USER_IDS.includes(userId))
