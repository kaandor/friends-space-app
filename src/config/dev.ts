// Conta(s) de desenvolvedor — sempre ativas (inclusive em produção), para
// poder gerenciar/excluir servidores de teste. O DEV_MODE continua controlando
// features exclusivas de dev server (painéis de debug etc.), mas o isDevUser
// NÃO depende dele para as contas listadas.
const DEV_MODE = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

export const DEV_USER_IDS: string[] = [
  'cf091bc8-e0fa-4331-b06a-03cf908ab132',
]

export const isDevUser = (userId?: string | null) => Boolean(userId && DEV_USER_IDS.includes(userId))

export const isDevMode = () => DEV_MODE
