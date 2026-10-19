import type { Priority, StatusCategory } from '../shared/types.ts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

export function shiftIsoDate(value: string, days: number): string {
  const date = parseIsoDate(value)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

/** "Oct 14", with the year when it isn't the current one. */
export function formatDate(value: string, now = new Date()): string {
  const date = parseIsoDate(value)
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === now.getFullYear() ? base : `${base}, ${date.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${formatDate(isoDate(date))} at ${time}`
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later'

export function dueState(due: string | null, done: boolean, now = new Date()): DueState | null {
  if (!due || done) return null
  const today = isoDate(now)
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  const soon = new Date(now)
  soon.setDate(soon.getDate() + 3)
  return due <= isoDate(soon) ? 'soon' : 'later'
}

export function relativeTime(iso: string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(isoDate(new Date(iso)), now)
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]!.charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : ''
  return (first + last).toUpperCase()
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
}

export const CATEGORY_ORDER: StatusCategory[] = ['started', 'review', 'unstarted', 'backlog', 'done']

/** Suggests a project key from its name: initials for several words, else the first letters. */
export function suggestKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let key = words.length >= 2 ? words.map((w) => w.charAt(0)).join('') : (words[0] ?? '').slice(0, 3)
  key = key.toUpperCase().replace(/^[0-9]+/, '').slice(0, 5)
  if (key.length === 1 && words[0]) key = words[0].slice(0, 3).toUpperCase().replace(/^[0-9]+/, '')
  return key
}

export type Strength = 'weak' | 'fair' | 'strong'

export function passwordStrength(password: string): Strength | null {
  if (!password) return null
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (password.length < 8 || score <= 2) return 'weak'
  return score >= 4 ? 'strong' : 'fair'
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
