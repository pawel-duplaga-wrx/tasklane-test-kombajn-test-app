import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { parseBugs, type BugId } from '../shared/bugs.ts'
import {
  PRIORITIES,
  ROLES,
  type DashboardData,
  type Issue,
  type IssueDetail,
  type Notification,
  type Page,
  type Preferences,
  type Priority,
  type Project,
  type Role,
  type Subtask,
  type TemplateId,
  type User,
} from '../shared/types.ts'
import {
  hashPassword,
  newSessionToken,
  nextId,
  verifyPassword,
  type IssueRecord,
  type ProjectRecord,
  type Store,
  type UserRecord,
} from './db.ts'
import { DEFAULT_PREFERENCES, seedStore } from './seed.ts'
import { buildLabels, buildStatuses } from './templates.ts'
import { addDays, isoDate, isValidIsoDate } from './time.ts'

export interface AppOptions {
  /** Planted bugs to switch on. Defaults to the BUGS environment variable. */
  bugs?: BugId[]
  /** Random delay added to every API call, in ms. Defaults to LATENCY, or 120-350. */
  latency?: [min: number, max: number]
  now?: () => Date
}

type Env = { Variables: { user: UserRecord } }
type Body = Record<string, unknown>

const COOKIE = 'tl_session'
const DAY_MS = 86_400_000
const LOCK_AFTER = 5
const LOCK_MS = 30_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COLOR_RE = /^#[0-9a-f]{6}$/i
const TEMPLATE_IDS: TemplateId[] = ['software', 'marketing', 'blank']
const AVATAR_COLORS = ['#2453d6', '#1d8a5a', '#7c4dcc', '#c8372d', '#0e7490', '#b8860b', '#b4489b']
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
const TEST_ALIASES: Record<string, string> = { admin: 'ada@tasklane.test', member: 'maya@tasklane.test', viewer: 'victor@tasklane.test' }
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/auth/signup', '/api/auth/forgot', '/api/auth/logout', '/api/auth/me', '/api/meta'])

export class HttpError extends Error {
  status: number
  fields: Record<string, string> | undefined
  retryAfter: number | undefined

  constructor(status: number, message: string, fields?: Record<string, string>, retryAfter?: number) {
    super(message)
    this.status = status
    this.fields = fields
    this.retryAfter = retryAfter
  }
}

export function parseLatency(value: string | undefined): [number, number] {
  if (value === undefined || value.trim() === '') return [120, 350]
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim())
  if (!match) throw new Error(`LATENCY must look like "200" or "120-350", got "${value}"`)
  const a = Number(match[1])
  const b = match[2] === undefined ? a : Number(match[2])
  return [Math.min(a, b), Math.max(a, b)]
}

/** At least 8 characters with a letter and a digit. Returns an error message or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters'
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Use at least one letter and one number'
  return null
}

async function readBody(c: Context): Promise<Body> {
  try {
    const value: unknown = await c.req.json()
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : {}
  } catch {
    return {}
  }
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

function checkFields(fields: Record<string, string>): void {
  if (Object.keys(fields).length > 0) throw new HttpError(400, 'Check the highlighted fields.', fields)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function createApp(options: AppOptions = {}): Hono<Env> {
  const now = options.now ?? (() => new Date())
  const latency = options.latency ?? parseLatency(process.env.LATENCY)
  let bugs = new Set<BugId>(options.bugs ?? parseBugs(process.env.BUGS))
  let store: Store = seedStore(now())
  const bug = (id: BugId) => bugs.has(id)

  // ---------- views and lookups ----------

  function publicUser(u: UserRecord): User {
    const { passwordHash: _, ...rest } = u
    return { ...rest, avatarUrl: bug('broken-avatar') ? u.avatarUrl : null, preferences: { ...u.preferences } }
  }

  function projectOf(issue: IssueRecord): ProjectRecord {
    return store.projects.find((p) => p.id === issue.projectId)!
  }

  function isDone(issue: IssueRecord, project = projectOf(issue)): boolean {
    return project.statuses.find((s) => s.id === issue.statusId)?.category === 'done'
  }

  function projectView(p: ProjectRecord): Project {
    const { issueSeq: _, ...rest } = p
    const issues = store.issues.filter((i) => i.projectId === p.id)
    const done = issues.filter((i) => isDone(i, p)).length
    return {
      ...rest,
      statuses: p.statuses.map((s) => ({ ...s })),
      labels: p.labels.map((l) => ({ ...l })),
      memberIds: [...p.memberIds],
      stats: { total: issues.length, done, open: issues.length - done },
    }
  }

  function issueView(i: IssueRecord): Issue {
    const key = projectOf(i).key
    return { ...i, ref: `${key}-${i.number}`, projectKey: key, labelIds: [...i.labelIds], subtasks: i.subtasks.map((s) => ({ ...s })) }
  }

  function findProject(key: string): ProjectRecord {
    const project = store.projects.find((p) => p.key === key.toUpperCase())
    if (!project) throw new HttpError(404, 'Project not found.')
    return project
  }

  function findIssue(ref: string): { issue: IssueRecord; project: ProjectRecord; ref: string } {
    const match = /^([a-z][a-z0-9]*)-(\d+)$/i.exec(ref)
    const project = match ? store.projects.find((p) => p.key === match[1]!.toUpperCase()) : undefined
    const issue = project && store.issues.find((i) => i.projectId === project.id && i.number === Number(match![2]))
    if (!project || !issue) throw new HttpError(404, 'Issue not found.')
    return { issue, project, ref: `${project.key}-${issue.number}` }
  }

  function findUser(id: string): UserRecord | undefined {
    return store.users.find((u) => u.id === id)
  }

  function requireEditor(user: UserRecord): void {
    if (user.role === 'viewer') throw new HttpError(403, "Viewers can't make changes. Ask an admin for member access.")
  }

  function requireAdmin(user: UserRecord): void {
    if (user.role !== 'admin') throw new HttpError(403, 'Only admins can do this.')
  }

  function addActivity(actor: UserRecord, projectKey: string, issueRef: string | null, text: string): void {
    store.activity.push({ id: nextId(store, 'a_'), issueRef, projectKey, actorId: actor.id, text, createdAt: now().toISOString() })
  }

  function notify(userId: string | null, actor: UserRecord, text: string, issueRef: string, projectKey: string): void {
    if (!userId || userId === actor.id || !findUser(userId)) return
    store.notifications.push({
      id: nextId(store, 'n_'),
      userId,
      actorId: actor.id,
      text,
      issueRef,
      projectKey,
      read: false,
      createdAt: now().toISOString(),
    })
  }

  function sessionUser(c: Context): UserRecord | undefined {
    const token = getCookie(c, COOKIE)
    const session = token ? store.sessions.get(token) : undefined
    if (!token || !session) return undefined
    if (session.expiresAt < now().getTime()) {
      store.sessions.delete(token)
      return undefined
    }
    return findUser(session.userId)
  }

  function startSession(c: Context, user: UserRecord, remember: boolean): void {
    const token = newSessionToken()
    const t = now().getTime()
    store.sessions.set(token, { userId: user.id, createdAt: t, expiresAt: t + (remember ? 30 : 1) * DAY_MS })
    setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', ...(remember ? { maxAge: 30 * 86_400 } : {}) })
  }

  // ---------- issue helpers ----------

  function parseIssuePatch(body: Body, project: ProjectRecord, creating: boolean): Partial<IssueRecord> {
    const patch: Partial<IssueRecord> = {}
    const fields: Record<string, string> = {}

    if (creating || body.title !== undefined) {
      const title = str(body.title)?.trim() ?? ''
      if (!title) fields.title = 'Enter a title'
      else if (title.length > 200) fields.title = 'Title must be 200 characters or fewer'
      else patch.title = title
    }
    if (body.description !== undefined) {
      const description = str(body.description)
      if (description === undefined || description.length > 10_000) fields.description = 'Description must be 10,000 characters or fewer'
      else patch.description = description
    }
    if (body.statusId !== undefined) {
      const status = project.statuses.find((s) => s.id === body.statusId)
      if (!status) fields.statusId = 'Pick a status'
      else patch.statusId = status.id
    }
    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority as Priority)) fields.priority = 'Pick a priority'
      else patch.priority = body.priority as Priority
    }
    if (body.assigneeId !== undefined) {
      if (body.assigneeId === null || body.assigneeId === '') patch.assigneeId = null
      else if (typeof body.assigneeId === 'string' && findUser(body.assigneeId)) patch.assigneeId = body.assigneeId
      else fields.assigneeId = 'Pick a person from the list'
    }
    if (body.labelIds !== undefined) {
      const ids = Array.isArray(body.labelIds) ? body.labelIds : null
      if (!ids || !ids.every((id) => project.labels.some((l) => l.id === id))) fields.labelIds = 'Pick labels from the list'
      else patch.labelIds = [...new Set(ids as string[])]
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === '') patch.dueDate = null
      else if (typeof body.dueDate === 'string' && isValidIsoDate(body.dueDate)) patch.dueDate = body.dueDate
      else fields.dueDate = 'Enter a valid date'
    }
    if (body.estimate !== undefined) {
      const e = body.estimate
      if (e === null || e === '') patch.estimate = null
      else if (typeof e === 'number' && Number.isInteger(e) && e >= 0 && e <= 100) patch.estimate = e
      else fields.estimate = 'Estimate must be a whole number from 0 to 100'
    }
    if (body.subtasks !== undefined) {
      const list = Array.isArray(body.subtasks) ? body.subtasks : null
      const subtasks: Subtask[] = []
      for (const item of list ?? []) {
        const s = item as Partial<Subtask> | null
        const title = typeof s?.title === 'string' ? s.title.trim() : ''
        if (!title || title.length > 200) {
          fields.subtasks = 'Each sub-task needs a title of up to 200 characters'
          break
        }
        subtasks.push({ id: typeof s?.id === 'string' && s.id ? s.id : nextId(store, 'st_'), title, done: s?.done === true })
      }
      if (!list) fields.subtasks = 'Sub-tasks must be a list'
      else if (!fields.subtasks) patch.subtasks = subtasks
    }
    if (body.order !== undefined) {
      if (typeof body.order !== 'number' || !Number.isFinite(body.order)) fields.order = 'Order must be a number'
      else patch.order = body.order
    }
    checkFields(fields)
    return patch
  }

  function applyIssuePatch(issue: IssueRecord, patch: Partial<IssueRecord>, project: ProjectRecord, actor: UserRecord): void {
    const ref = `${project.key}-${issue.number}`
    if (patch.statusId !== undefined && patch.statusId !== issue.statusId) {
      const status = project.statuses.find((s) => s.id === patch.statusId)!
      addActivity(actor, project.key, ref, `moved ${ref} to ${status.name}`)
      issue.completedAt = status.category === 'done' ? now().toISOString() : null
    }
    if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
      const assignee = patch.assigneeId ? findUser(patch.assigneeId) : undefined
      addActivity(actor, project.key, ref, assignee ? `assigned ${ref} to ${assignee.name}` : `unassigned ${ref}`)
      notify(patch.assigneeId, actor, `assigned you ${ref}`, ref, project.key)
    }
    if (patch.priority !== undefined && patch.priority !== issue.priority) {
      addActivity(actor, project.key, ref, `set the priority of ${ref} to ${capitalize(patch.priority)}`)
    }
    if (patch.title !== undefined && patch.title !== issue.title) addActivity(actor, project.key, ref, `renamed ${ref}`)
    if (patch.dueDate !== undefined && patch.dueDate !== issue.dueDate) {
      addActivity(actor, project.key, ref, patch.dueDate ? `set the due date of ${ref} to ${patch.dueDate}` : `removed the due date from ${ref}`)
    }
    Object.assign(issue, patch)
    issue.updatedAt = now().toISOString()
  }

  function listIssues(project: ProjectRecord, query: Record<string, string>, user: UserRecord): Page<Issue> {
    let items = store.issues.filter((i) => i.projectId === project.id)
    const q = query.q?.trim()
    if (q) {
      // Planted bug: compares without lower-casing.
      const sensitive = bug('search-case-sensitive')
      const needle = sensitive ? q : q.toLowerCase()
      items = items.filter((i) => {
        const hay = `${project.key}-${i.number} ${i.title}`
        return (sensitive ? hay : hay.toLowerCase()).includes(needle)
      })
    }
    if (query.assignee) {
      const want = query.assignee === 'me' ? user.id : query.assignee === 'none' ? null : query.assignee
      items = items.filter((i) => i.assigneeId === want)
    }
    if (query.priority) items = items.filter((i) => i.priority === query.priority)
    if (query.label) items = items.filter((i) => i.labelIds.includes(query.label!))
    if (query.status) items = items.filter((i) => i.statusId === query.status)

    const sort = query.sort ?? 'manual'
    const dir = query.dir === 'desc' ? -1 : 1
    const statusIndex = (i: IssueRecord) => project.statuses.findIndex((s) => s.id === i.statusId)
    const compare: Record<string, (a: IssueRecord, b: IssueRecord) => number> = {
      manual: (a, b) => statusIndex(a) - statusIndex(b) || a.order - b.order,
      key: (a, b) => a.number - b.number,
      title: (a, b) => a.title.localeCompare(b.title),
      status: (a, b) => statusIndex(a) - statusIndex(b) || a.number - b.number,
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number,
      assignee: (a, b) => (findUser(a.assigneeId ?? '')?.name ?? '~').localeCompare(findUser(b.assigneeId ?? '')?.name ?? '~'),
      due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.number - b.number,
      created: (a, b) => a.createdAt.localeCompare(b.createdAt),
      updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    }
    const cmp = compare[sort] ?? compare.manual!
    items = [...items].sort((a, b) => cmp(a, b) * dir)

    const total = items.length
    const pageSize = query.pageSize === undefined ? 20 : Math.max(0, Math.min(200, Number(query.pageSize) || 0))
    const page = Math.max(1, Number(query.page) || 1)
    if (pageSize > 0) {
      // Planted bug: pages after the first start one row too late.
      const offset = (page - 1) * pageSize + (bug('list-pagination-skips-row') && page > 1 ? 1 : 0)
      items = items.slice(offset, offset + pageSize)
    }
    return { items: items.map(issueView), total, page, pageSize }
  }

  // ---------- app ----------

  const app = new Hono<Env>()

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message, fields: err.fields, retryAfter: err.retryAfter }, err.status as ContentfulStatusCode)
    }
    console.error(err)
    return c.json({ error: 'Something went wrong on our side. Try again.' }, 500)
  })

  app.use('/api/*', async (c, next) => {
    const [min, max] = latency
    if (max > 0 && !c.req.path.startsWith('/api/test/')) {
      await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)))
    }
    await next()
  })

  app.use('/api/*', async (c, next) => {
    const path = c.req.path
    if (PUBLIC_PATHS.has(path) || path.startsWith('/api/test/')) return next()
    const user = sessionUser(c)
    if (!user) throw new HttpError(401, 'Your session has ended. Log in again.')
    c.set('user', user)
    await next()
  })

  // ----- meta and test hooks -----

  app.get('/api/meta', (c) => c.json({ name: 'Tasklane', version: '1.0.0', flags: [...bugs] }))

  /** Restores the seed data. Optional `bugs` (string or list) replaces the planted-bug set. */
  app.post('/api/test/reset', async (c) => {
    const body = await readBody(c)
    if (body.bugs !== undefined) {
      const value = Array.isArray(body.bugs) ? body.bugs.join(',') : String(body.bugs)
      try {
        bugs = new Set(parseBugs(value))
      } catch (err) {
        throw new HttpError(400, (err as Error).message)
      }
    }
    store = seedStore(now())
    return c.json({ ok: true, flags: [...bugs] })
  })

  /**
   * Starts a session without a password, so test tools never handle credentials.
   * `as` is an alias (admin, member, viewer) or a seed email. The login form is still the real path.
   */
  app.post('/api/test/login', async (c) => {
    const as = (str((await readBody(c)).as) ?? '').trim().toLowerCase()
    const email = TEST_ALIASES[as] ?? as
    const user = store.users.find((u) => u.email === email)
    if (!user) throw new HttpError(400, `Unknown account "${as}". Use admin, member, viewer or a seed email.`)
    startSession(c, user, true)
    return c.json({ user: publicUser(user) })
  })

  // ----- auth -----

  app.post('/api/auth/login', async (c) => {
    const body = await readBody(c)
    const email = (str(body.email) ?? '').trim().toLowerCase()
    const password = str(body.password) ?? ''
    const fields: Record<string, string> = {}
    if (!email) fields.email = 'Enter your email'
    else if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address'
    if (!password) fields.password = 'Enter your password'
    checkFields(fields)

    const t = now().getTime()
    const entry = store.failedLogins.get(email)
    if (entry && entry.lockedUntil > t) {
      const retryAfter = Math.ceil((entry.lockedUntil - t) / 1000)
      throw new HttpError(429, `Too many failed attempts. Try again in ${retryAfter} seconds.`, undefined, retryAfter)
    }
    const user = store.users.find((u) => u.email === email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      const count = (entry && entry.lockedUntil === 0 ? entry.count : 0) + 1
      if (count >= LOCK_AFTER) {
        store.failedLogins.set(email, { count: 0, lockedUntil: t + LOCK_MS })
        throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MS / 1000} seconds.`, undefined, LOCK_MS / 1000)
      }
      store.failedLogins.set(email, { count, lockedUntil: 0 })
      throw new HttpError(401, 'Incorrect email or password.')
    }
    store.failedLogins.delete(email)
    startSession(c, user, body.remember === true)
    return c.json({ user: publicUser(user) })
  })

  app.post('/api/auth/signup', async (c) => {
    const body = await readBody(c)
    const name = (str(body.name) ?? '').trim()
    const email = (str(body.email) ?? '').trim().toLowerCase()
    const password = str(body.password) ?? ''
    const fields: Record<string, string> = {}
    if (name.length < 2) fields.name = 'Enter your full name'
    else if (name.length > 50) fields.name = 'Name must be 50 characters or fewer'
    if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address'
    else if (store.users.some((u) => u.email === email)) fields.email = 'An account with this email already exists'
    const problem = passwordProblem(password)
    if (problem) fields.password = problem
    checkFields(fields)

    const invite = store.invites.find((i) => i.email === email)
    store.invites = store.invites.filter((i) => i !== invite)
    const user: UserRecord = {
      id: nextId(store, 'u_'),
      name,
      email,
      role: invite?.role ?? 'member',
      title: '',
      color: AVATAR_COLORS[store.users.length % AVATAR_COLORS.length]!,
      avatarUrl: null,
      joinedAt: now().toISOString(),
      preferences: { ...DEFAULT_PREFERENCES },
      passwordHash: hashPassword(password),
    }
    store.users.push(user)
    startSession(c, user, false)
    return c.json({ user: publicUser(user) }, 201)
  })

  app.post('/api/auth/forgot', async (c) => {
    const email = (str((await readBody(c)).email) ?? '').trim()
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Check the highlighted fields.', { email: 'Enter a valid email address' })
    return c.json({ ok: true })
  })

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, COOKIE)
    if (token) store.sessions.delete(token)
    deleteCookie(c, COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // Public, so the logged-out boot check doesn't log a 401 in the console.
  app.get('/api/auth/me', (c) => {
    const user = sessionUser(c)
    return c.json({ user: user ? publicUser(user) : null })
  })

  // ----- current user -----

  app.patch('/api/me', async (c) => {
    const user = c.var.user
    const body = await readBody(c)
    const name = str(body.name)?.trim()
    const title = str(body.title)?.trim()
    const color = str(body.color)
    const fields: Record<string, string> = {}
    if (name !== undefined && name.length < 2) fields.name = 'Name must be at least 2 characters'
    else if (name !== undefined && name.length > 50) fields.name = 'Name must be 50 characters or fewer'
    if (title !== undefined && title.length > 60) fields.title = 'Job title must be 60 characters or fewer'
    if (color !== undefined && !COLOR_RE.test(color)) fields.color = 'Pick one of the colors'
    checkFields(fields)
    // Planted bug: the name is echoed back but never stored.
    if (name !== undefined && !bug('profile-name-not-saved')) user.name = name
    if (title !== undefined) user.title = title
    if (color !== undefined) user.color = color
    const view = publicUser(user)
    if (name !== undefined) view.name = name
    return c.json({ user: view })
  })

  app.post('/api/me/password', async (c) => {
    const user = c.var.user
    const body = await readBody(c)
    const current = str(body.currentPassword) ?? ''
    const next = str(body.newPassword) ?? ''
    const fields: Record<string, string> = {}
    if (!verifyPassword(current, user.passwordHash)) fields.currentPassword = 'Current password is incorrect'
    const problem = passwordProblem(next)
    if (problem) fields.newPassword = problem
    else if (next === current) fields.newPassword = 'Choose a password different from the current one'
    checkFields(fields)
    user.passwordHash = hashPassword(next)
    const token = getCookie(c, COOKIE)
    for (const [key, session] of store.sessions) {
      if (session.userId === user.id && key !== token) store.sessions.delete(key)
    }
    return c.json({ ok: true })
  })

  app.post('/api/me/logout-everywhere', (c) => {
    const user = c.var.user
    for (const [key, session] of store.sessions) if (session.userId === user.id) store.sessions.delete(key)
    deleteCookie(c, COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  app.patch('/api/me/preferences', async (c) => {
    const user = c.var.user
    const body = await readBody(c)
    const prefs: Preferences = { ...user.preferences }
    const fields: Record<string, string> = {}
    if (body.theme !== undefined) {
      if (body.theme === 'light' || body.theme === 'dark' || body.theme === 'system') prefs.theme = body.theme
      else fields.theme = 'Pick a theme'
    }
    if (body.density !== undefined) {
      if (body.density === 'comfortable' || body.density === 'compact') prefs.density = body.density
      else fields.density = 'Pick a density'
    }
    for (const key of ['notifyAssigned', 'notifyComments', 'weeklyDigest'] as const) {
      if (body[key] === undefined) continue
      if (typeof body[key] === 'boolean') prefs[key] = body[key]
      else fields[key] = 'Must be on or off'
    }
    checkFields(fields)
    user.preferences = prefs
    return c.json({ user: publicUser(user) })
  })

  // ----- team -----

  app.get('/api/users', (c) => {
    const users = [...store.users].sort((a, b) => a.name.localeCompare(b.name)).map(publicUser)
    return c.json({ users })
  })

  app.patch('/api/users/:id', async (c) => {
    const actor = c.var.user
    requireAdmin(actor)
    const target = findUser(c.req.param('id'))
    if (!target) throw new HttpError(404, 'Member not found.')
    const role = (await readBody(c)).role
    if (!ROLES.includes(role as Role)) throw new HttpError(400, 'Check the highlighted fields.', { role: 'Pick a role' })
    const admins = store.users.filter((u) => u.role === 'admin')
    if (target.role === 'admin' && role !== 'admin' && admins.length === 1) {
      throw new HttpError(400, 'The workspace needs at least one admin.')
    }
    target.role = role as Role
    return c.json({ user: publicUser(target) })
  })

  app.delete('/api/users/:id', (c) => {
    const actor = c.var.user
    requireAdmin(actor)
    const target = findUser(c.req.param('id'))
    if (!target) throw new HttpError(404, 'Member not found.')
    if (target.id === actor.id) throw new HttpError(400, "You can't remove yourself.")
    for (const issue of store.issues) if (issue.assigneeId === target.id) issue.assigneeId = null
    for (const project of store.projects) {
      project.memberIds = project.memberIds.filter((id) => id !== target.id)
      if (project.leadId === target.id) project.leadId = actor.id
    }
    for (const [key, session] of store.sessions) if (session.userId === target.id) store.sessions.delete(key)
    store.users = store.users.filter((u) => u !== target)
    return c.json({ ok: true })
  })

  app.get('/api/invites', (c) => {
    requireAdmin(c.var.user)
    return c.json({ invites: [...store.invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) })
  })

  app.post('/api/invites', async (c) => {
    const actor = c.var.user
    requireAdmin(actor)
    const body = await readBody(c)
    const email = (str(body.email) ?? '').trim().toLowerCase()
    const role = body.role ?? 'member'
    const fields: Record<string, string> = {}
    if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address'
    else if (store.users.some((u) => u.email === email)) fields.email = 'This person is already a member'
    else if (store.invites.some((i) => i.email === email)) fields.email = 'This email already has a pending invite'
    if (!ROLES.includes(role as Role)) fields.role = 'Pick a role'
    checkFields(fields)
    const invite = { id: nextId(store, 'inv_'), email, role: role as Role, invitedById: actor.id, createdAt: now().toISOString() }
    store.invites.push(invite)
    return c.json({ invite }, 201)
  })

  app.delete('/api/invites/:id', (c) => {
    requireAdmin(c.var.user)
    const before = store.invites.length
    store.invites = store.invites.filter((i) => i.id !== c.req.param('id'))
    if (store.invites.length === before) throw new HttpError(404, 'Invite not found.')
    return c.json({ ok: true })
  })

  // ----- projects -----

  app.get('/api/projects', (c) => {
    const filter = c.req.query('filter') ?? 'active'
    const projects = store.projects
      .filter((p) => filter === 'all' || (filter === 'archived' ? p.archived : !p.archived))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(projectView)
    return c.json({ projects })
  })

  app.post('/api/projects', async (c) => {
    const actor = c.var.user
    requireEditor(actor)
    const body = await readBody(c)
    const name = (str(body.name) ?? '').trim()
    const key = (str(body.key) ?? '').trim().toUpperCase()
    const description = (str(body.description) ?? '').trim()
    const template = body.template as TemplateId
    const fields: Record<string, string> = {}
    if (name.length < 3) fields.name = 'Name must be at least 3 characters'
    else if (name.length > 60) fields.name = 'Name must be 60 characters or fewer'
    const taken = store.projects.find((p) => p.key === key)
    if (!/^[A-Z][A-Z0-9]{1,4}$/.test(key)) fields.key = 'Use 2 to 5 letters or digits, starting with a letter'
    else if (taken) fields.key = `${key} is already used by ${taken.name}`
    if (description.length > 500) fields.description = 'Description must be 500 characters or fewer'
    if (!TEMPLATE_IDS.includes(template)) fields.template = 'Pick a template'
    checkFields(fields)

    const requested = Array.isArray(body.memberIds) ? body.memberIds.filter((id): id is string => typeof id === 'string') : []
    const memberIds = [...new Set([actor.id, ...requested])].filter((id) => findUser(id))
    const leadId = typeof body.leadId === 'string' && memberIds.includes(body.leadId) ? body.leadId : actor.id
    const id = nextId(store, 'p_')
    const project: ProjectRecord = {
      id,
      key,
      name,
      description,
      color: typeof body.color === 'string' && COLOR_RE.test(body.color) ? body.color : '#2453d6',
      template,
      statuses: buildStatuses(id, template),
      labels: buildLabels(id, template),
      memberIds,
      leadId,
      archived: false,
      createdAt: now().toISOString(),
      issueSeq: 0,
    }
    store.projects.push(project)
    addActivity(actor, key, null, `created the project ${name}`)
    return c.json({ project: projectView(project) }, 201)
  })

  app.get('/api/projects/:key', (c) => c.json({ project: projectView(findProject(c.req.param('key'))) }))

  app.patch('/api/projects/:key', async (c) => {
    const actor = c.var.user
    requireEditor(actor)
    const project = findProject(c.req.param('key'))
    const body = await readBody(c)
    const fields: Record<string, string> = {}
    const name = str(body.name)?.trim()
    const description = str(body.description)?.trim()
    if (name !== undefined && name.length < 3) fields.name = 'Name must be at least 3 characters'
    else if (name !== undefined && name.length > 60) fields.name = 'Name must be 60 characters or fewer'
    if (description !== undefined && description.length > 500) fields.description = 'Description must be 500 characters or fewer'
    if (body.color !== undefined && !(typeof body.color === 'string' && COLOR_RE.test(body.color))) fields.color = 'Pick one of the colors'
    if (body.archived !== undefined) requireAdmin(actor)

    let labels = project.labels
    if (body.labels !== undefined) {
      const list = Array.isArray(body.labels) ? (body.labels as Array<{ id?: unknown; name?: unknown; color?: unknown }>) : []
      const names = new Set<string>()
      labels = []
      for (const item of list) {
        const labelName = typeof item.name === 'string' ? item.name.trim() : ''
        if (!labelName || labelName.length > 30) fields.labels = 'Label names need 1 to 30 characters'
        else if (names.has(labelName.toLowerCase())) fields.labels = `There is already a label called "${labelName}"`
        names.add(labelName.toLowerCase())
        const existing = project.labels.find((l) => l.id === item.id)
        labels.push({
          id: existing?.id ?? nextId(store, `${project.id}_l`),
          name: labelName,
          color: typeof item.color === 'string' && COLOR_RE.test(item.color) ? item.color : '#5b6577',
        })
      }
    }
    if (body.statuses !== undefined) {
      const list = Array.isArray(body.statuses) ? (body.statuses as Array<{ id?: unknown; wipLimit?: unknown }>) : []
      for (const item of list) {
        const w = item.wipLimit
        if (!project.statuses.some((s) => s.id === item.id)) fields.statuses = 'Unknown column'
        else if (w !== null && !(typeof w === 'number' && Number.isInteger(w) && w >= 1 && w <= 50)) {
          fields.statuses = 'Limits must be whole numbers from 1 to 50, or empty'
        }
      }
    }
    checkFields(fields)

    if (name !== undefined) project.name = name
    if (description !== undefined) project.description = description
    if (typeof body.color === 'string') project.color = body.color
    if (typeof body.archived === 'boolean' && body.archived !== project.archived) {
      project.archived = body.archived
      addActivity(actor, project.key, null, `${body.archived ? 'archived' : 'unarchived'} the project ${project.name}`)
    }
    if (Array.isArray(body.memberIds)) {
      project.memberIds = [...new Set(body.memberIds.filter((id): id is string => typeof id === 'string' && !!findUser(id)))]
    }
    if (typeof body.leadId === 'string' && project.memberIds.includes(body.leadId)) project.leadId = body.leadId
    if (body.labels !== undefined) {
      const kept = new Set(labels.map((l) => l.id))
      for (const issue of store.issues) {
        if (issue.projectId === project.id) issue.labelIds = issue.labelIds.filter((id) => kept.has(id))
      }
      project.labels = labels
    }
    if (Array.isArray(body.statuses)) {
      for (const item of body.statuses as Array<{ id: string; wipLimit: number | null }>) {
        project.statuses.find((s) => s.id === item.id)!.wipLimit = item.wipLimit
      }
    }
    return c.json({ project: projectView(project) })
  })

  app.delete('/api/projects/:key', (c) => {
    requireAdmin(c.var.user)
    const project = findProject(c.req.param('key'))
    const issueIds = new Set(store.issues.filter((i) => i.projectId === project.id).map((i) => i.id))
    store.projects = store.projects.filter((p) => p !== project)
    store.issues = store.issues.filter((i) => !issueIds.has(i.id))
    store.comments = store.comments.filter((cm) => !issueIds.has(cm.issueId))
    store.activity = store.activity.filter((a) => a.projectKey !== project.key)
    store.notifications = store.notifications.filter((n) => n.projectKey !== project.key)
    return c.json({ ok: true })
  })

  // ----- issues -----

  app.get('/api/projects/:key/issues', (c) => {
    const project = findProject(c.req.param('key'))
    return c.json(listIssues(project, c.req.query(), c.var.user))
  })

  app.post('/api/projects/:key/issues', async (c) => {
    const actor = c.var.user
    // Planted bug: viewers are allowed to create issues.
    if (!bug('viewer-can-create')) requireEditor(actor)
    const project = findProject(c.req.param('key'))
    if (project.archived) throw new HttpError(400, 'This project is archived. Unarchive it to add issues.')
    const patch = parseIssuePatch(await readBody(c), project, true)
    const statusId = patch.statusId ?? (project.statuses.find((s) => s.category === 'unstarted') ?? project.statuses[0]!).id
    const inStatus = store.issues.filter((i) => i.projectId === project.id && i.statusId === statusId)
    project.issueSeq += 1
    const t = now().toISOString()
    const issue: IssueRecord = {
      id: nextId(store, 'i_'),
      projectId: project.id,
      number: project.issueSeq,
      title: patch.title!,
      description: patch.description ?? '',
      statusId,
      priority: patch.priority ?? 'none',
      assigneeId: patch.assigneeId ?? null,
      reporterId: actor.id,
      labelIds: patch.labelIds ?? [],
      dueDate: patch.dueDate ?? null,
      estimate: patch.estimate ?? null,
      subtasks: patch.subtasks ?? [],
      order: patch.order ?? Math.max(0, ...inStatus.map((i) => i.order)) + 1000,
      createdAt: t,
      updatedAt: t,
      completedAt: project.statuses.find((s) => s.id === statusId)!.category === 'done' ? t : null,
    }
    store.issues.push(issue)
    const ref = `${project.key}-${issue.number}`
    addActivity(actor, project.key, ref, `created ${ref}`)
    notify(issue.assigneeId, actor, `assigned you ${ref}`, ref, project.key)
    return c.json({ issue: issueView(issue) }, 201)
  })

  app.post('/api/issues/bulk', async (c) => {
    const actor = c.var.user
    requireEditor(actor)
    const body = await readBody(c)
    const refs = Array.isArray(body.refs) ? body.refs.filter((r): r is string => typeof r === 'string') : []
    if (refs.length === 0) throw new HttpError(400, 'Select at least one issue.')
    const action = body.action
    const targets = refs.map(findIssue)
    for (const { issue, project, ref } of targets) {
      if (action === 'delete') {
        store.issues = store.issues.filter((i) => i !== issue)
        store.trash.set(ref, issue)
        continue
      }
      const key = action === 'status' ? 'statusId' : action === 'assignee' ? 'assigneeId' : action === 'priority' ? 'priority' : null
      if (!key) throw new HttpError(400, 'Unknown bulk action.')
      applyIssuePatch(issue, parseIssuePatch({ [key]: body.value }, project, false), project, actor)
    }
    return c.json({ updated: targets.length })
  })

  app.get('/api/issues/:ref', (c) => {
    const { issue, project, ref } = findIssue(c.req.param('ref'))
    const detail: IssueDetail = {
      issue: issueView(issue),
      project: projectView(project),
      comments: store.comments.filter((cm) => cm.issueId === issue.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      activity: store.activity.filter((a) => a.issueRef === ref).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
    return c.json(detail)
  })

  app.patch('/api/issues/:ref', async (c) => {
    const actor = c.var.user
    requireEditor(actor)
    const { issue, project } = findIssue(c.req.param('ref'))
    applyIssuePatch(issue, parseIssuePatch(await readBody(c), project, false), project, actor)
    return c.json({ issue: issueView(issue) })
  })

  app.delete('/api/issues/:ref', (c) => {
    requireEditor(c.var.user)
    const { issue, ref } = findIssue(c.req.param('ref'))
    store.issues = store.issues.filter((i) => i !== issue)
    store.trash.set(ref, issue)
    return c.json({ ok: true })
  })

  app.post('/api/issues/:ref/restore', (c) => {
    requireEditor(c.var.user)
    const ref = c.req.param('ref').toUpperCase()
    const issue = store.trash.get(ref)
    if (!issue || !store.projects.some((p) => p.id === issue.projectId)) throw new HttpError(404, 'This issue can no longer be restored.')
    store.trash.delete(ref)
    store.issues.push(issue)
    return c.json({ issue: issueView(issue) })
  })

  // ----- comments -----

  app.post('/api/issues/:ref/comments', async (c) => {
    const actor = c.var.user
    if (actor.role === 'viewer') throw new HttpError(403, "Viewers can't comment. Ask an admin for member access.")
    const { issue, project, ref } = findIssue(c.req.param('ref'))
    const text = (str((await readBody(c)).body) ?? '').trim()
    if (!text) throw new HttpError(400, 'Check the highlighted fields.', { body: 'Write a comment first' })
    if (text.length > 2000) throw new HttpError(400, 'Check the highlighted fields.', { body: 'Comments can be up to 2,000 characters' })
    const comment = { id: nextId(store, 'c_'), issueId: issue.id, authorId: actor.id, body: text, createdAt: now().toISOString(), editedAt: null }
    store.comments.push(comment)
    addActivity(actor, project.key, ref, `commented on ${ref}`)
    for (const userId of new Set([issue.assigneeId, issue.reporterId])) notify(userId, actor, `commented on ${ref}`, ref, project.key)
    return c.json({ comment }, 201)
  })

  app.patch('/api/comments/:id', async (c) => {
    const actor = c.var.user
    const comment = store.comments.find((cm) => cm.id === c.req.param('id'))
    if (!comment) throw new HttpError(404, 'Comment not found.')
    if (comment.authorId !== actor.id) throw new HttpError(403, 'You can only edit your own comments.')
    const text = (str((await readBody(c)).body) ?? '').trim()
    if (!text) throw new HttpError(400, 'Check the highlighted fields.', { body: 'Write a comment first' })
    if (text.length > 2000) throw new HttpError(400, 'Check the highlighted fields.', { body: 'Comments can be up to 2,000 characters' })
    comment.body = text
    comment.editedAt = now().toISOString()
    return c.json({ comment })
  })

  app.delete('/api/comments/:id', (c) => {
    const actor = c.var.user
    const comment = store.comments.find((cm) => cm.id === c.req.param('id'))
    if (!comment) throw new HttpError(404, 'Comment not found.')
    if (comment.authorId !== actor.id && actor.role !== 'admin') throw new HttpError(403, 'You can only delete your own comments.')
    store.comments = store.comments.filter((cm) => cm !== comment)
    return c.json({ ok: true })
  })

  // ----- overview pages -----

  app.get('/api/dashboard', (c) => {
    const user = c.var.user
    const today = isoDate(now())
    const soon = isoDate(addDays(now(), 7))
    const weekAgo = addDays(now(), -7).toISOString()
    const active = store.projects.filter((p) => !p.archived)
    const activeIds = new Set(active.map((p) => p.id))
    const mine = store.issues.filter((i) => activeIds.has(i.projectId) && i.assigneeId === user.id)
    const open = mine.filter((i) => !isDone(i))
    const data: DashboardData = {
      stats: {
        assignedOpen: open.length,
        dueSoon: open.filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= soon).length,
        // Planted bug: done issues are counted as overdue too.
        overdue: (bug('dashboard-overdue-count') ? mine : open).filter((i) => i.dueDate && i.dueDate < today).length,
        completedRecently: mine.filter((i) => isDone(i) && i.completedAt && i.completedAt >= weekAgo).length,
      },
      myIssues: [...open]
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
        .slice(0, 8)
        .map(issueView),
      activity: store.activity
        .filter((a) => active.some((p) => p.key === a.projectKey))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12),
      projects: active.map(projectView),
    }
    return c.json(data)
  })

  app.get('/api/my-issues', (c) => {
    const user = c.var.user
    const tab = c.req.query('tab') === 'created' ? 'created' : 'assigned'
    const active = store.projects.filter((p) => !p.archived)
    const activeIds = new Set(active.map((p) => p.id))
    const issues = store.issues
      .filter((i) => activeIds.has(i.projectId) && (tab === 'created' ? i.reporterId === user.id : i.assigneeId === user.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(issueView)
    return c.json({ issues, projects: active.map(projectView) })
  })

  app.get('/api/search', (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase()
    if (!q) return c.json({ projects: [], issues: [] })
    const projects = store.projects
      .filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
      .sort((a, b) => Number(a.archived) - Number(b.archived))
      .slice(0, 5)
      .map(projectView)
    const issues = store.issues
      .filter((i) => !projectOf(i).archived)
      .filter((i) => `${projectOf(i).key}-${i.number} ${i.title}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8)
      .map(issueView)
    return c.json({ projects, issues })
  })

  // ----- notifications -----

  app.get('/api/notifications', (c) => {
    const user = c.var.user
    const mine = store.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const items: Notification[] = mine.map((n) => {
      // Planted bug: the actor's name is read from a field that doesn't exist.
      const actorName = bug('undefined-in-notification') ? undefined : (findUser(n.actorId)?.name ?? 'Someone')
      return { id: n.id, text: `${actorName} ${n.text}`, issueRef: n.issueRef, projectKey: n.projectKey, read: n.read, createdAt: n.createdAt }
    })
    return c.json({ items, unread: items.filter((n) => !n.read).length })
  })

  app.post('/api/notifications/read-all', (c) => {
    for (const n of store.notifications) if (n.userId === c.var.user.id) n.read = true
    return c.json({ ok: true })
  })

  app.post('/api/notifications/:id/read', (c) => {
    const n = store.notifications.find((x) => x.id === c.req.param('id') && x.userId === c.var.user.id)
    if (!n) throw new HttpError(404, 'Notification not found.')
    n.read = true
    return c.json({ ok: true })
  })

  app.all('/api/*', () => {
    throw new HttpError(404, 'Not found.')
  })

  return app
}
