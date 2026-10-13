import type { CSSProperties } from 'react'
import {
  AppWindow, ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowUp, ArrowUpLeft,
  ArrowUpRight, ArrowRight, BadgeCheck, Bitcoin, Bot, Briefcase, Bug, CalendarDays, Camera,
  Check, CheckCheck, ChevronDown, ChevronRight, ChevronUp, Circle, CircleCheck,
  CircleDot, CircleHelp, CircleX, Clipboard, ClipboardList, Clock, Compass, Copy,
  DoorOpen, Download, Ellipsis, Expand, ExternalLink, FileSignature, FileText,
  Flag, Folder, FolderOpen, FolderPlus, Gamepad2, Gauge, Gavel, Globe, Grid2x2,
  Handshake, HardDrive, Hash, Headphones, Headset, Heart, House, Image, Inbox, Info,
  Key, Keyboard, Lightbulb, Link, ListChecks, LoaderCircle, Lock, LogIn, LogOut, Mail, MailOpen,
  Maximize2, Mic, MicOff, Minimize2, Monitor, MousePointer2, MoveDiagonal, MoveRight, Music,
  Nfc, Paperclip, Pause, Pencil, Phone, PhoneOff, Play, Plug, Plus, Pointer, QrCode,
  RadioTower, Reply, Rocket, RotateCcw, RotateCw, SatelliteDish, Save, Scale,
  Search, Send, Server, Settings, Shapes, Share2, Shield, ShieldHalf, ShieldUser,
  SlidersHorizontal, Smile, Stamp, Star, Code, Trash2, Clock as ClockIcon, Upload, CloudUpload,
  User, UserPlus, UserPen, Users, Video, Volume2, VolumeX, Wallet, WandSparkles, X,
  Zap, ZoomIn, ZoomOut, BookOpen, Headset as HeadsetIcon, Circle as CircleIcon,
} from 'lucide-react'
import { IconHeadphonesOff } from './icons'

void ClockIcon
void HeadsetIcon
void CircleIcon

type LucideComp = typeof Plus

// Marcas oficiais (simple-icons, fill) — o lucide não tem brand icons.
function brand(path: string) {
  return (p?: { width?: number; height?: number; className?: string; style?: CSSProperties }) => (
    <svg
      viewBox="0 0 24 24"
      width={p?.width ?? 20}
      height={p?.height ?? 20}
      fill="currentColor"
      className={p?.className}
      style={p?.style}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const BrandWindows = brand('M3 5.5 10.5 4.4v7.1H3zM11.6 4.2 21 3v8.5h-9.4zM3 12.5h7.5v7.1L3 18.5zM11.6 12.5H21V21l-9.4-1.2z')
const BrandApple = brand('M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701')
const BrandLinux = brand('M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm-2.433 5.17c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065z')
const BrandFacebook = brand('M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z')
const BrandWhatsapp = brand('M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z')
const BrandTelegram = brand('M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z')

const MAP: Record<string, LucideComp> = {
  plus: Plus, trash: Trash2, xmark: X, check: Check, hashtag: Hash,
  microphone: Mic, 'microphone-slash': MicOff, download: Download, lock: Lock,
  'paper-plane': Send, minimize: Minimize2, 'volume-high': Volume2,
  'volume-xmark': VolumeX, flag: Flag, 'floppy-disk': Save, rotate: RotateCw,
  'rotate-left': RotateCcw, bug: Bug, 'face-smile': Smile, display: Monitor,
  'hand-pointer': Pointer, rocket: Rocket, pen: Pencil, 'user-pen': UserPen,
  'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'arrow-right': ArrowRight,
  'arrow-right-long': MoveRight, 'arrow-up-left': ArrowUpLeft,
  'arrow-up-right': ArrowUpRight, 'arrow-down-left': ArrowDownLeft,
  'arrow-down-right': ArrowDownRight, 'circle-info': Info,
  'circle-question': CircleHelp, 'shield-halved': ShieldHalf, 'grid-2': Grid2x2,
  'user-group': Users, users: Users, user: User, expand: Expand,
  'up-right-and-down-left-from-center': MoveDiagonal, music: Music, video: Video,
  'mouse-pointer': MousePointer2, share: Share2, 'share-nodes': Share2,
  'file-lines': FileText, 'file-signature': FileSignature, server: Server,
  link: Link, 'chevron-down': ChevronDown, 'chevron-up': ChevronUp,
  'chevron-right': ChevronRight, shield: Shield, 'calendar-days': CalendarDays,
  phone: Phone, 'phone-slash': PhoneOff, 'right-from-bracket': LogOut,
  'right-to-bracket': LogIn, gear: Settings, lightbulb: Lightbulb,
  'list-check': ListChecks, 'circle-xmark': CircleX, 'scale-balanced': Scale,
  paperclip: Paperclip, reply: Reply, 'arrow-up-right-from-square': ExternalLink,
  clock: Clock, 'badge-check': BadgeCheck, folder: Folder, gavel: Gavel,
  gamepad: Gamepad2, 'folder-open': FolderOpen, sliders: SlidersHorizontal,
  house: House, compass: Compass, 'folder-plus': FolderPlus,
  'magnifying-glass': Search, 'magnifying-glass-plus': ZoomIn,
  'magnifying-glass-minus': ZoomOut, globe: Globe, 'hard-drive': HardDrive,
  ellipsis: Ellipsis, headset: Headset, 'book-open': BookOpen,
  'user-shield': ShieldUser, 'circle-notch': LoaderCircle, 'circle-dot': CircleDot,
  'wand-magic-sparkles': WandSparkles, 'user-plus': UserPlus,
  'tower-broadcast': RadioTower, circle: Circle, headphones: Headphones,
  'check-double': CheckCheck, 'circle-check': CircleCheck,
  'check-circle': CircleCheck, bolt: Zap, star: Star, icons: Shapes, copy: Copy,
  'envelope-open-text': MailOpen, envelope: Mail, inbox: Inbox,
  handshake: Handshake, qrcode: QrCode, camera: Camera, image: Image,
  gauge: Gauge, 'gauge-high': Gauge, 'door-open': DoorOpen, robot: Bot,
  'satellite-dish': SatelliteDish, 'clipboard-list': ClipboardList, stamp: Stamp,
  code: Code, plug: Plug, clipboard: Clipboard, 'window-restore': AppWindow,
  wallet: Wallet, bitcoin: Bitcoin, 'google-pay': Nfc, paypal: Wallet,
  // Aliases vindos de classes fa-* dinâmicas antigas
  'cloud-arrow-up': CloudUpload, 'cloud-upload': CloudUpload, upload: Upload,
  'folder-blank': Folder, 'chevron-left': ChevronRight, heart: Heart,
    pause: Pause,
  keyboard: Keyboard, play: Play, key: Key, briefcase: Briefcase, maximize: Maximize2,
  'fa-user': User, 'fa-briefcase': Briefcase, 'fa-maximize': Maximize2,
}

const BRANDS: Record<string, (p?: { width?: number; height?: number; className?: string; style?: CSSProperties }) => React.ReactNode> = {
  windows: BrandWindows,
  apple: BrandApple,
  linux: BrandLinux,
  'facebook-f': BrandFacebook,
  whatsapp: BrandWhatsapp,
  telegram: BrandTelegram,
}

export function Fa({ name, size = 16, className, style, strokeWidth = 2.25 }: {
  name: string
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}) {
  // Aceita tanto "check" quanto "fa-check" / "fa-solid fa-check".
  const normalized = String(name || '').trim().split(/\s+/).pop()?.replace(/^fa-/, '') || ''
  const Brand = BRANDS[normalized] || BRANDS[name]
  if (Brand) return <>{Brand({ width: size, height: size, className, style })}</>
  if (normalized === 'headphones-slash' || name === 'headphones-slash') {
    return <IconHeadphonesOff width={size} height={size} />
  }
  const C = MAP[normalized] || MAP[name]
  if (!C) return null
  return <C size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden="true" />
}
