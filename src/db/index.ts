import Dexie, { type Table } from 'dexie'
import type { User, Server, Message, Friend, DirectMessage } from '../types'

export interface AppUsage {
  id?: number
  app: string
  day: string
  seconds: number
}

class AppDatabase extends Dexie {
  users!: Table<User, string>
  servers!: Table<Server, string>
  messages!: Table<Message, string>
  friends!: Table<Friend, string>
  directMessages!: Table<DirectMessage, string>
  appUsage!: Table<AppUsage, number>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      users: 'id',
      servers: 'id, ownerId, inviteCode',
      messages: 'id, channelId, createdAt',
      friends: 'id, userId, friendId',
      directMessages: 'id, fromId, toId, createdAt',
    })
    this.version(2).stores({
      appUsage: '++id, [app+day], day',
    })
  }
}

const databases = new Map<string, AppDatabase>()

export function normalizeProfileKey(profileKey: string) {
  return profileKey.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function getDb(profileKey = 'anonymous') {
  const normalized = normalizeProfileKey(profileKey)
  const existing = databases.get(normalized)
  if (existing) return existing
  const database = new AppDatabase(`FriendsSpaceDB-${normalized}`)
  databases.set(normalized, database)
  return database
}
