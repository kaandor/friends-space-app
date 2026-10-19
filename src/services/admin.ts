// Servicos do painel de moderacao (dev / support).
// Hierarquia: dev > support > verified. Soh dev e support acessam.
import type { CallSession, Report, Server, User } from '../types'
import { requestBackend } from './backend'
import { useUserStore } from '../stores/userStore'

export function getAdminId(): string {
  return useUserStore.getState().currentUser?.id || localStorage.getItem('friends-space:current-user-id') || ''
}

export function userIsDev(user?: User | null): boolean {
  return Boolean(user?.flags?.dev)
}

export function userIsSupport(user?: User | null): boolean {
  return userIsDev(user) || Boolean(user?.flags?.support)
}

export function userIsVerified(user?: User | null): boolean {
  return Boolean(user?.flags?.verified)
}

export function canOpenAdminPanel(user?: User | null): boolean {
  return userIsSupport(user) || userIsDev(user) || userIsVerified(user)
}

export interface AdminReport extends Report {
  reporterName?: string
}

export async function listAllReports(onlyPending = false): Promise<AdminReport[]> {
  try {
    const result = await requestBackend<{ reports: AdminReport[] }>('listAllReports', {
      adminId: getAdminId(),
      onlyPending,
    })
    return result?.reports || []
  } catch {
    return []
  }
}

export async function respondReport(reportId: string, response: string) {
  try {
    await requestBackend('respondReport', { adminId: getAdminId(), reportId, response })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao responder' }
  }
}

export async function banUser(targetId: string, reason: string) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('banUser', {
      adminId: getAdminId(),
      targetId,
      reason,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao banir' }
  }
}

export async function unbanUser(targetId: string) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('unbanUser', {
      adminId: getAdminId(),
      targetId,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao desbanir' }
  }
}

export async function setUserVerified(targetId: string, verified: boolean) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('setUserVerified', {
      adminId: getAdminId(),
      targetId,
      verified,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao verificar' }
  }
}

export async function setUserSupport(targetId: string, support: boolean) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('setUserSupport', {
      adminId: getAdminId(),
      targetId,
      support,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao promover suporte' }
  }
}

export async function findUserById(query: string): Promise<User[]> {
  try {
    const result = await requestBackend<{ users: User[] }>('findUserById', {
      adminId: getAdminId(),
      query,
    })
    return result?.users || []
  } catch {
    return []
  }
}

export async function setServerVerified(serverId: string, verified: boolean, partner?: string) {
  try {
    const result = await requestBackend<{ server: Server, servers: Server[] }>('setServerVerified', {
      adminId: getAdminId(),
      serverId,
      verified,
      partner,
    })
    return { ok: true, server: result?.server, servers: result?.servers }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao verificar servidor' }
  }
}

export async function transferServerOwner(serverId: string, newOwnerId: string) {
  try {
    const result = await requestBackend<{ server: Server, servers: Server[] }>('transferServerOwner', {
      adminId: getAdminId(),
      serverId,
      newOwnerId,
    })
    return { ok: true, server: result?.server, servers: result?.servers }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao transferir' }
  }
}

export interface CallSessionAdmin extends CallSession {
  memberNames?: string[]
  signalCount?: number
}

export async function listCallSessionsAdmin(): Promise<CallSessionAdmin[]> {
  try {
    const result = await requestBackend<{ sessions: CallSessionAdmin[], signalCount: number }>('listCallSessionsAdmin', {
      adminId: getAdminId(),
    })
    return result?.sessions || []
  } catch {
    return []
  }
}

export async function clearFeed() {
  try {
    const result = await requestBackend<{ cleared?: number }>('clearFeed', {
      adminId: getAdminId(),
    })
    return { ok: true, cleared: result?.cleared ?? 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao limpar feed' }
  }
}
export async function cleanupCallSession(sessionId: string) {
  try {
    const result = await requestBackend<{ removed: number }>('cleanupCallSession', {
      adminId: getAdminId(),
      sessionId,
    })
    return { ok: true, removed: result?.removed ?? 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao limpar chamada' }
  }
}

export type AdminAstroTier = 'astro' | 'astro_plus' | 'astro_ultimate'

export async function adminSetAstro(target: string, months: number, tier: AdminAstroTier) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('adminSetAstro', {
      adminId: getAdminId(),
      target,
      months,
      tier,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao ativar Astro' }
  }
}

export async function adminCancelAstro(target: string) {
  try {
    const result = await requestBackend<{ user: User, users: User[] }>('adminCancelAstro', {
      adminId: getAdminId(),
      target,
    })
    return { ok: true, user: result?.user, users: result?.users }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao cancelar Astro' }
  }
}

export async function approveUser(targetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('approveUser', { adminId: getAdminId(), targetId })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao aprovar' }
  }
}

export async function listPendingUsers(): Promise<User[]> {
  try {
    const result = await requestBackend<{ users: User[] }>('listPendingUsers', { adminId: getAdminId() })
    return result?.users || []
  } catch {
    return []
  }
}

export async function setUserDev(targetId: string, makeDev: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('setUserDev', { adminId: getAdminId(), targetId, makeDev })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao alterar dev' }
  }
}

export interface BanEntry { id: string; reason: string; createdAt: number }

export async function getUserDiagnostics(targetId: string): Promise<{ ok: boolean; user?: any; stats?: any; error?: string }> {
  try {
    const result = await requestBackend<{ user: any; stats: any }>('getUserDiagnostics', { adminId: getAdminId(), targetId })
    return { ok: true, user: result?.user, stats: result?.stats }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro no diagnóstico' }
  }
}

export async function rejectUser(targetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('rejectUser', { adminId: getAdminId(), targetId })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao rejeitar' }
  }
}

export async function listBans(): Promise<{ ips: BanEntry[]; devices: BanEntry[] }> {
  try {
    const result = await requestBackend<{ ips: BanEntry[]; devices: BanEntry[] }>('listBans', { adminId: getAdminId() })
    return { ips: result?.ips || [], devices: result?.devices || [] }
  } catch {
    return { ips: [], devices: [] }
  }
}

export async function banIp(ip: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('banIp', { adminId: getAdminId(), ip, reason })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao banir IP' }
  }
}

export async function unbanIp(ip: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('unbanIp', { adminId: getAdminId(), ip })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao desbanir IP' }
  }
}

export async function unbanDevice(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestBackend('unbanDevice', { adminId: getAdminId(), deviceId })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Erro ao desbanir dispositivo' }
  }
}

export interface ClientErrorEntry { id: string; userId: string; ts: number; where: string; message: string; code?: string }

export async function listClientErrors(): Promise<ClientErrorEntry[]> {
  try {
    const result = await requestBackend<{ errors: ClientErrorEntry[] }>('listClientErrors', { adminId: getAdminId() })
    return result?.errors || []
  } catch {
    return []
  }
}
