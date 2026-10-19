export interface User {
  id: string
  friendCode: string
  name: string
  bio: string
  photoUrl: string
  bannerUrl?: string
  accentColor?: string
  status?: string
  googleId?: string
  email?: string
  authProvider?: 'google'
  createdAt: number
  approved?: boolean
  activityName?: string
  activityDetails?: string
  activityStartedAt?: number
  activityEnabled?: boolean
  activityPrivacy?: 'public' | 'friends' | 'private'
  lastSeenAt?: number
  settings?: Record<string, unknown>
  flags?: {
    dev?: boolean
    support?: boolean
    verified?: boolean
    banned?: boolean
    contentRestricted?: boolean
    official?: boolean
  }
  verifiedAt?: number
  verifiedBy?: string
  banReason?: string
  bannedAt?: number
  bannedBy?: string
  network?: {
    city?: string
    region?: string
    country?: string
    asn?: string
    isp?: string
  }
  followers?: string[]
  following?: string[]
  blocked?: string[]
  bookmarks?: string[]
}

export interface ServerBot {
  id: string
  name: string
  token: string
  desc: string
}

export interface ServerWebhook {
  id: string
  name: string
  url: string
}

export interface ServerIntegration {
  id: string
  name: string
  detail: string
}

export interface ServerLibraryItem {
  id: string
  name: string
  detail: string
}

export interface ServerInviteItem {
  code: string
  label: string
  createdAt: number
}

export interface ServerAuditEntry {
  id: string
  at: number
  actorId: string
  actorName: string
  action: string
  detail: string
}

export interface ServerSettings {
  themes: string[]
  frequency: string
  minAge: string
  moderation: string
  toggles: { public: boolean; verification: boolean; welcome: boolean; log: boolean; rules: boolean }
  automod: { spam: boolean; links: boolean; ofensa: boolean; caps: boolean; words: string[] }
  bots: ServerBot[]
  webhooks: ServerWebhook[]
  emojis: ServerLibraryItem[]
  stickers: ServerLibraryItem[]
  invites: ServerInviteItem[]
  widget: { title: string; channel: string; enabled: boolean }
  template: { name: string; detail: string } | null
  integrations: ServerIntegration[]
  community: Record<string, boolean>
  banned: string[]
  timeouts: Record<string, number>
}

export function defaultServerSettings(): ServerSettings {
  return {
    themes: [],
    frequency: '',
    minAge: '',
    moderation: '',
    toggles: { public: false, verification: false, welcome: false, log: false, rules: false },
    automod: { spam: false, links: false, ofensa: false, caps: false, words: [] },
    bots: [],
    webhooks: [],
    emojis: [],
    stickers: [],
    invites: [],
    widget: { title: '', channel: '', enabled: false },
    template: null,
    integrations: [],
    community: {},
    banned: [],
    timeouts: {},
  }
}

export interface ServerCustomEmoji {
  id: string
  name: string
  url: string
}

export interface Server {
  id: string
  name: string
  category?: string
  tags?: string[]
  photoUrl: string
  bannerUrl?: string
  description?: string
  accentColor?: string
  ownerId: string
  inviteCode: string
  createdAt: number
  members: string[]
  channels: Channel[]
  roles: Role[]
  memberRoles?: Record<string, string[]>
  autoRoleId?: string
  callAccess?: 'public' | 'members' | 'staff'
  callPassword?: string
  staffMemberIds?: string[]
  emojis?: ServerEmoji[]
  customEmojis?: ServerCustomEmoji[]
  categories?: ServerCategory[]
  events?: ServerEvent[]
  verified?: boolean
  onlineCount?: number
  partner?: string
  settings?: ServerSettings
  auditLog?: ServerAuditEntry[]
}

export interface ServerCategory {
  id: string
  name: string
  serverId: string
}

export interface ServerEvent {
  id: string
  serverId: string
  title: string
  description?: string
  date: number
  location?: string
  createdBy: string
  createdAt: number
}

export interface StoryOverlayStyle {
  color: string
  size: number
  bold: boolean
  position: 'top' | 'bottom'
  font?: string
  x?: number
  y?: number
}

export interface Story {
  id: string
  userId: string
  authorKind?: 'user' | 'server'
  mediaUrl: string
  type: 'image' | 'video'
  caption?: string
  visibility?: 'friends' | 'global'
  createdAt: number
  updatedAt?: number
  sharedPostId?: string
  overlayText?: string
  overlayStyle?: StoryOverlayStyle
  likes?: string[]
  viewers?: string[]
}

export interface PostComment {
  id: string
  userId: string
  content: string
  imageUrl?: string
  parentId?: string
  likes?: string[]
  dislikes?: string[]
  createdAt: number
}

export interface Post {
  id: string
  authorId: string
  authorKind?: 'user' | 'server'
  content: string
  mediaUrl?: string
  type: 'image' | 'video'
  linkUrl?: string
  linkTitle?: string
  linkImage?: string
  linkDescription?: string
  embedType?: 'youtube' | 'tiktok' | 'generic' | 'video' | 'image'
  hashtags: string[]
  likes: string[]
  reposts?: string[]
  reports?: number
  reportedBy?: string[]
  comments: PostComment[]
  createdAt: number
  updatedAt?: number
  shares?: number
  score?: number
  poll?: { options: Array<{ text: string; votes: string[] }>; endsAt: number; createdAt: number }
  location?: string
  scheduledFor?: number
  promoted?: boolean
  views?: number
}

export interface ServerEmoji {
  id: string
  serverId: string
  name: string
  url: string
  addedBy: string
  createdAt: number
  kind?: 'emoji' | 'gif' | 'sticker'
}

export interface Channel {
  id: string
  name: string
  type: 'text' | 'voice'
  serverId: string
  categoryId?: string
}

export interface ServerFolder {
  id: string
  ownerId: string
  name: string
  serverIds: string[]
  color?: string
  sharedFrom?: string
  createdAt: number
}

export interface Role {
  id: string
  name: string
  color: string
  serverId: string
  permissions: string[]
}

export interface MessageReaction {
  emoji: string
  userIds: string[]
}

export interface Message {
  id: string
  channelId: string
  userId: string
  userName: string
  userPhoto: string
  content: string
  isBot?: boolean
  type: 'text' | 'audio'
  audioUrl?: string
  attachmentUrl?: string
  attachmentName?: string
  attachmentType?: string
  createdAt: number
  reactions?: MessageReaction[]
  edited?: boolean
  editedAt?: number
  replyTo?: { id: string; userName: string; content: string }
  forwardedFrom?: { id: string; userName: string }
}

export interface Report {
  id: string
  reporterId: string
  type: 'media' | 'message' | 'user' | 'server' | 'help'
  target: {
    id: string
    name?: string
    channelId?: string
    serverId?: string
    messageId?: string
    preview?: string
  }
  questionnaire: string[]
  description: string
  proofUrl?: string
  status: 'pending' | 'responded'
  response?: string
  complained?: boolean
  complaintMessage?: string
  complainedAt?: number
  createdAt: number
  respondedAt?: number
}

export interface Friend {
  id: string
  userId: string
  friendId: string
  status: 'pending' | 'accepted'
  createdAt: number
}

export interface CallParticipant {
  userId: string
  userName: string
  userPhoto: string
  muted: boolean
  deafened: boolean
  stream?: MediaStream
  screenStream?: MediaStream
}

export interface DirectMessage {
  id: string
  fromId: string
  toId: string
  content: string
  type: 'text' | 'audio'
  audioUrl?: string
  attachmentUrl?: string
  attachmentName?: string
  attachmentType?: string
  createdAt: number
}

export interface CallSession {
  id: string
  serverId: string
  channelId: string
  active: boolean
  hostUserId: string
  participantIds: string[]
  invitedAt?: Record<string, number>
  screenSharingUserId: string
  callMode?: 'audio' | 'video'
  quality?: '480p' | '720p' | '1080p' | '2k' | '4k'
  fps?: 30 | 60
  bitrateKbps?: number
  createdAt: number
  updatedAt: number
  connectionStats?: {
    latencyMs?: number
    packetLoss?: number
  }
  peerViews?: Record<string, {
    stats: Record<string, { state?: string; tracks?: number; screen?: boolean; screenTracks?: number; dc?: boolean; ice?: string }>
    at: number
  }>
  watch?: CallSessionWatch
}

export interface CallSessionWatch {
  slowPeerIds: string[]
  screenMissingFor: string[]
  unhealthy: boolean
  at: number
}

export interface CallSignal {
  id: string
  sessionId: string
  fromUserId: string
  toUserId: string
  type: 'offer' | 'answer' | 'candidate' | 'renegotiate' | 'decline' | 'cancel' | 'resync'
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, unknown>
  createdAt: number
}

export interface AppNotification {
  id: string
  toUserId: string
  fromUserId: string
  fromName: string
  fromPhoto: string
  type: string
  title: string
  body?: string
  data?: Record<string, unknown>
  read: boolean
  createdAt: number
}
