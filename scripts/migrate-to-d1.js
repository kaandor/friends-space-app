// Script de migracao: le o JSON do Upstash e gera INSERTs para o D1.
// Uso: node scripts/migrate-to-d1.js <store.json> > migrate.sql
import { readFileSync } from 'node:fs'

const rawFile = process.argv[2]
if (!rawFile) {
  console.error('Uso: node scripts/migrate-to-d1.js <store.json>')
  process.exit(1)
}

let raw = readFileSync(rawFile, 'utf8').trim()
let parsed = raw
try {
  parsed = JSON.parse(raw)
  if (parsed && typeof parsed === 'object' && 'result' in parsed) {
    parsed = parsed.result
  }
} catch { }

let store = parsed
for (let attempt = 0; attempt < 4 && typeof store === 'string'; attempt += 1) {
  try {
    store = JSON.parse(store)
  } catch { break }
}
if (typeof store === 'string') store = JSON.parse(store)

// normaliza estruturas variadas (profile/directory/legacy)
const profiles = store.profiles && typeof store.profiles === 'object' ? store.profiles : {}
const directory = store.directory && typeof store.directory === 'object' ? store.directory : {}

const getList = (field) => {
  const fromDirectory = Array.isArray(directory[field]) ? directory[field] : []
  const fromProfiles = Object.values(profiles).flatMap((p) => Array.isArray(p?.[field]) ? p[field] : [])
  const seen = new Map()
  for (const item of [...fromDirectory, ...fromProfiles]) {
    if (item && item.id && !seen.has(item.id)) seen.set(item.id, item)
  }
  return [...seen.values()]
}

const users = getList('users')
const servers = getList('servers')
const friends = getList('friends')
const callSessions = getList('callSessions')
const callSignals = Array.isArray(directory.callSignals) ? directory.callSignals : []
const messages = getList('messages')
const directMessages = getList('directMessages')

const esc = (v) => {
  if (v === undefined || v === null) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

const b = (v) => (v ? 1 : 0)
const js = (v) => (v === undefined || v === null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'`)

const out = []

for (const u of users) {
  out.push(`INSERT OR REPLACE INTO users (id, friendCode, name, bio, photoUrl, bannerUrl, accentColor, status, googleId, email, authProvider, createdAt, lastSeenAt, activityName, activityDetails, activityStartedAt, activityEnabled, activityPrivacy) VALUES (${esc(u.id)}, ${esc(u.friendCode)}, ${esc(u.name)}, ${esc(u.bio)}, ${esc(u.photoUrl)}, ${esc(u.bannerUrl)}, ${esc(u.accentColor)}, ${esc(u.status)}, ${esc(u.googleId)}, ${esc(u.email)}, ${esc(u.authProvider)}, ${esc(u.createdAt)}, ${esc(u.lastSeenAt)}, ${esc(u.activityName)}, ${esc(u.activityDetails)}, ${esc(u.activityStartedAt)}, ${esc(u.activityEnabled != null ? (u.activityEnabled ? 1 : 0) : undefined)}, ${esc(u.activityPrivacy)});`)
}

for (const s of servers) {
  out.push(`INSERT OR REPLACE INTO servers (id, name, photoUrl, bannerUrl, description, accentColor, ownerId, inviteCode, createdAt, members, channels, roles, callAccess, callPassword, staffMemberIds) VALUES (${esc(s.id)}, ${esc(s.name)}, ${esc(s.photoUrl)}, ${esc(s.bannerUrl)}, ${esc(s.description)}, ${esc(s.accentColor)}, ${esc(s.ownerId)}, ${esc(s.inviteCode)}, ${esc(s.createdAt)}, ${js(s.members)}, ${js(s.channels)}, ${js(s.roles)}, ${esc(s.callAccess)}, ${esc(s.callPassword)}, ${js(s.staffMemberIds)});`)
}

for (const m of messages) {
  out.push(`INSERT OR REPLACE INTO messages (id, channelId, userId, userName, userPhoto, content, type, audioUrl, attachmentUrl, attachmentName, attachmentType, createdAt) VALUES (${esc(m.id)}, ${esc(m.channelId)}, ${esc(m.userId)}, ${esc(m.userName)}, ${esc(m.userPhoto)}, ${esc(m.content)}, ${esc(m.type)}, ${esc(m.audioUrl)}, ${esc(m.attachmentUrl)}, ${esc(m.attachmentName)}, ${esc(m.attachmentType)}, ${esc(m.createdAt)});`)
}

for (const f of friends) {
  out.push(`INSERT OR REPLACE INTO friends (id, userId, friendId, status, createdAt) VALUES (${esc(f.id)}, ${esc(f.userId)}, ${esc(f.friendId)}, ${esc(f.status)}, ${esc(f.createdAt)});`)
}

for (const dm of directMessages) {
  out.push(`INSERT OR REPLACE INTO direct_messages (id, fromId, toId, content, type, audioUrl, createdAt) VALUES (${esc(dm.id)}, ${esc(dm.fromId)}, ${esc(dm.toId)}, ${esc(dm.content)}, ${esc(dm.type)}, ${esc(dm.audioUrl)}, ${esc(dm.createdAt)});`)
}

for (const cs of callSessions) {
  out.push(`INSERT OR REPLACE INTO call_sessions (id, serverId, channelId, active, hostUserId, participantIds, screenSharingUserId, callMode, quality, antiloud, createdAt, updatedAt, connectionStats, participantLastSync) VALUES (${esc(cs.id)}, ${esc(cs.serverId)}, ${esc(cs.channelId)}, ${b(cs.active)}, ${esc(cs.hostUserId)}, ${js(cs.participantIds)}, ${esc(cs.screenSharingUserId)}, ${esc(cs.callMode)}, ${esc(cs.quality)}, ${esc(cs.antiloud != null ? (cs.antiloud ? 1 : 0) : undefined)}, ${esc(cs.createdAt)}, ${esc(cs.updatedAt)}, ${js(cs.connectionStats)}, ${js(cs.participantLastSync)});`)
}

for (const csig of callSignals) {
  out.push(`INSERT OR REPLACE INTO call_signals (id, sessionId, fromUserId, toUserId, type, payload, createdAt) VALUES (${esc(csig.id)}, ${esc(csig.sessionId)}, ${esc(csig.fromUserId)}, ${esc(csig.toUserId)}, ${esc(csig.type)}, ${js(csig.payload)}, ${esc(csig.createdAt)});`)
}

console.log(out.join('\n'))
console.error(`Total: ${users.length} users, ${servers.length} servers, ${messages.length} messages, ${friends.length} friends, ${directMessages.length} DMs, ${callSessions.length} calls, ${callSignals.length} signals`)
