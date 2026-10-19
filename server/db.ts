import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Activity, Comment, Invite, Issue, Project, User } from '../shared/types.ts'

export interface UserRecord extends User {
  passwordHash: string
}

export type ProjectRecord = Omit<Project, 'stats'> & { issueSeq: number }
export type IssueRecord = Omit<Issue, 'ref' | 'projectKey'>

export interface NotificationRecord {
  id: string
  userId: string
  actorId: string
  /** Text after the actor's name, e.g. "assigned you WEB-12". */
  text: string
  issueRef: string | null
  projectKey: string | null
  read: boolean
  createdAt: string
}

export interface Session {
  userId: string
  createdAt: number
  expiresAt: number
}

export interface Store {
  users: UserRecord[]
  projects: ProjectRecord[]
  issues: IssueRecord[]
  comments: Comment[]
  activity: Activity[]
  notifications: NotificationRecord[]
  invites: Invite[]
  sessions: Map<string, Session>
  /** Deleted issues, kept so "Undo" can restore them. */
  trash: Map<string, IssueRecord>
  failedLogins: Map<string, { count: number; lockedUntil: number }>
  seq: number
}

export function emptyStore(): Store {
  return {
    users: [],
    projects: [],
    issues: [],
    comments: [],
    activity: [],
    notifications: [],
    invites: [],
    sessions: new Map(),
    trash: new Map(),
    failedLogins: new Map(),
    seq: 0,
  }
}

export function nextId(store: Store, prefix: string): string {
  store.seq += 1
  return `${prefix}${store.seq}`
}

// Low scrypt cost: this is a demo app and the seed hashes several passwords on every reset.
const SCRYPT = { N: 1024, r: 8, p: 1 }

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32, SCRYPT).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const actual = scryptSync(password, salt, 32, SCRYPT)
  const expected = Buffer.from(hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function newSessionToken(): string {
  return randomBytes(24).toString('base64url')
}
