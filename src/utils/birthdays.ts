import type { User } from '../types'

export function parseBirthday(value: unknown): { month: number; day: number; year?: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { month, day, year }
}

export function daysUntilBirthday(value: unknown, now = new Date()): number | null {
  const parsed = parseBirthday(value)
  if (!parsed) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(today.getFullYear(), parsed.month - 1, parsed.day)
  if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, parsed.month - 1, parsed.day)
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

export function ageOnBirthday(value: unknown, now = new Date()): number | null {
  const parsed = parseBirthday(value)
  if (!parsed?.year) return null
  const year = now.getFullYear() + (daysUntilBirthday(value, now) === 0 ? 0 : 1)
  const age = year - parsed.year
  return age > 0 && age < 130 ? age : null
}

export function formatBirthday(value: unknown): string {
  const parsed = parseBirthday(value)
  if (!parsed) return ''
  try {
    return new Date(2000, parsed.month - 1, parsed.day).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  } catch {
    return `${parsed.day}/${parsed.month}`
  }
}

export interface UpcomingBirthday {
  user: User
  days: number
  dateLabel: string
  turning?: number
}

export function upcomingBirthdays(users: User[], withinDays = 14, now = new Date()): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = []
  for (const user of users) {
    const days = daysUntilBirthday(user.birthday, now)
    if (days === null || days > withinDays) continue
    out.push({
      user,
      days,
      dateLabel: formatBirthday(user.birthday),
      turning: ageOnBirthday(user.birthday, now) ?? undefined,
    })
  }
  return out.sort((a, b) => a.days - b.days)
}

export function birthdayLabel(days: number): string {
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `Em ${days} dias`
}
