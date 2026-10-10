import { isDevUser } from './dev'

export interface PermissionServer {
  ownerId: string
  staffMemberIds?: string[]
}

export const canManageServer = (server: PermissionServer | null | undefined, userId?: string | null): boolean =>
  Boolean(userId && server && (isDevUser(userId) || server.ownerId === userId || (server.staffMemberIds || []).includes(userId)))

export const canDeleteServer = (server: PermissionServer | null | undefined, userId?: string | null): boolean =>
  Boolean(userId && server && (isDevUser(userId) || server.ownerId === userId))
