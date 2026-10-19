import { describe, expect, it } from 'vitest'
import { createApp, parseLatency, passwordProblem } from '../server/app.ts'
import { parseBugs, type BugId } from '../shared/bugs.ts'
import type { DashboardData, Issue, IssueDetail, Page, Project } from '../shared/types.ts'

const NOW = new Date('2026-10-14T10:00:00')

function client(bugs: BugId[] = []) {
  let clock = NOW.getTime()
  const app = createApp({ bugs, latency: [0, 0], now: () => new Date(clock) })
  let cookie = ''
  async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]!
    return { status: res.status, data: (await res.json()) as T }
  }
  const login = (email: string, password: string) => call('POST', '/api/auth/login', { email, password })
  return { call, login, advance: (ms: number) => (clock += ms) }
}

const ADMIN = ['ada@tasklane.test', 'Admin123!'] as const
const MEMBER = ['maya@tasklane.test', 'Member123!'] as const
const VIEWER = ['victor@tasklane.test', 'Viewer123!'] as const

describe('auth', () => {
  it('logs in with a seed account and reads the session back', async () => {
    const c = client()
    expect((await c.login(...ADMIN)).status).toBe(200)
    const me = await c.call<{ user: { email: string; role: string } }>('GET', '/api/auth/me')
    expect(me.data.user).toMatchObject({ email: 'ada@tasklane.test', role: 'admin' })
  })

  it('rejects a wrong password and protects the API without a session', async () => {
    const c = client()
    const bad = await c.login('ada@tasklane.test', 'nope1234')
    expect(bad.status).toBe(401)
    expect((await c.call('GET', '/api/projects')).status).toBe(401)
  })

  it('locks the email for 30 seconds after 5 failed attempts', async () => {
    const c = client()
    for (let i = 0; i < 4; i++) expect((await c.login('ada@tasklane.test', 'wrong123')).status).toBe(401)
    const locked = await c.login('ada@tasklane.test', 'wrong123')
    expect(locked.status).toBe(429)
    expect((await c.login(...ADMIN)).status).toBe(429)
    c.advance(31_000)
    expect((await c.login(...ADMIN)).status).toBe(200)
  })

  it('validates signup fields and creates a member', async () => {
    const c = client()
    const bad = await c.call<{ fields: Record<string, string> }>('POST', '/api/auth/signup', { name: 'A', email: 'ada@tasklane.test', password: 'short' })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.data.fields).sort()).toEqual(['email', 'name', 'password'])
    const ok = await c.call<{ user: { role: string } }>('POST', '/api/auth/signup', { name: 'New Person', email: 'new@tasklane.test', password: 'abcdef12' })
    expect(ok.status).toBe(201)
    expect(ok.data.user.role).toBe('member')
  })

  it('checks password rules', () => {
    expect(passwordProblem('abc')).toMatch(/8 characters/)
    expect(passwordProblem('abcdefgh')).toMatch(/number/)
    expect(passwordProblem('abcdefg1')).toBeNull()
  })
})

describe('permissions', () => {
  it('stops viewers from creating issues, unless the planted bug is on', async () => {
    const clean = client()
    await clean.login(...VIEWER)
    expect((await clean.call('POST', '/api/projects/WEB/issues', { title: 'Try' })).status).toBe(403)

    const buggy = client(['viewer-can-create'])
    await buggy.login(...VIEWER)
    expect((await buggy.call('POST', '/api/projects/WEB/issues', { title: 'Try' })).status).toBe(201)
  })

  it('only lets admins change roles and keeps one admin', async () => {
    const c = client()
    await c.login(...MEMBER)
    expect((await c.call('PATCH', '/api/users/u_liam', { role: 'viewer' })).status).toBe(403)
    await c.login(...ADMIN)
    expect((await c.call('PATCH', '/api/users/u_ada', { role: 'member' })).status).toBe(400)
    expect((await c.call('PATCH', '/api/users/u_liam', { role: 'viewer' })).status).toBe(200)
  })
})

describe('projects', () => {
  it('validates the key and creates a project from a template', async () => {
    const c = client()
    await c.login(...MEMBER)
    const taken = await c.call<{ fields: Record<string, string> }>('POST', '/api/projects', { name: 'Web 2', key: 'WEB', template: 'software' })
    expect(taken.data.fields.key).toBe('WEB is already used by Website Redesign')
    const ok = await c.call<{ project: Project }>('POST', '/api/projects', { name: 'Billing', key: 'bil', template: 'marketing' })
    expect(ok.status).toBe(201)
    expect(ok.data.project.key).toBe('BIL')
    expect(ok.data.project.statuses.map((s) => s.name)).toEqual(['Ideas', 'Planned', 'In Progress', 'Review', 'Published'])
    const list = await c.call<{ projects: Project[] }>('GET', '/api/projects')
    expect(list.data.projects.map((p) => p.key)).toContain('BIL')
  })
})

describe('issues', () => {
  it('searches case-insensitively, or case-sensitively with the planted bug', async () => {
    const clean = client()
    await clean.login(...ADMIN)
    const hits = await clean.call<Page<Issue>>('GET', '/api/projects/WEB/issues?q=checkout&pageSize=0')
    expect(hits.data.items.map((i) => i.ref)).toEqual(['WEB-30'])
    const upper = await clean.call<Page<Issue>>('GET', '/api/projects/WEB/issues?q=CHECKOUT&pageSize=0')
    expect(upper.data.total).toBe(1)

    const buggy = client(['search-case-sensitive'])
    await buggy.login(...ADMIN)
    expect((await buggy.call<Page<Issue>>('GET', '/api/projects/WEB/issues?q=CHECKOUT&pageSize=0')).data.total).toBe(0)
  })

  it('pages the list without gaps, and skips a row with the planted bug', async () => {
    const refs = async (bugs: BugId[]) => {
      const c = client(bugs)
      await c.login(...ADMIN)
      const all: string[] = []
      for (const page of [1, 2, 3]) {
        const res = await c.call<Page<Issue>>('GET', `/api/projects/WEB/issues?sort=key&page=${page}`)
        all.push(...res.data.items.map((i) => i.ref))
      }
      return all
    }
    const clean = await refs([])
    expect(clean).toHaveLength(46)
    expect(new Set(clean).size).toBe(46)
    const buggy = await refs(['list-pagination-skips-row'])
    expect(buggy).not.toContain('WEB-21')
  })

  it('creates, moves, comments on, deletes and restores an issue', async () => {
    const c = client()
    await c.login(...MEMBER)
    const created = await c.call<{ issue: Issue }>('POST', '/api/projects/WEB/issues', { title: 'New thing', assigneeId: 'u_ada' })
    expect(created.data.issue.ref).toBe('WEB-47')
    const done = (await c.call<{ project: Project }>('GET', '/api/projects/WEB')).data.project.statuses.at(-1)!
    const moved = await c.call<{ issue: Issue }>('PATCH', '/api/issues/WEB-47', { statusId: done.id })
    expect(moved.data.issue.completedAt).not.toBeNull()
    expect((await c.call('POST', '/api/issues/WEB-47/comments', { body: 'Looks good' })).status).toBe(201)
    const detail = await c.call<IssueDetail>('GET', '/api/issues/WEB-47')
    expect(detail.data.comments).toHaveLength(1)
    expect(detail.data.activity.map((a) => a.text)).toContain('moved WEB-47 to Done')

    expect((await c.call('DELETE', '/api/issues/WEB-47')).status).toBe(200)
    expect((await c.call('GET', '/api/issues/WEB-47')).status).toBe(404)
    expect((await c.call('POST', '/api/issues/WEB-47/restore')).status).toBe(200)
    expect((await c.call('GET', '/api/issues/WEB-47')).status).toBe(200)
  })

  it('rejects bad field values with per-field messages', async () => {
    const c = client()
    await c.login(...MEMBER)
    const res = await c.call<{ fields: Record<string, string> }>('PATCH', '/api/issues/WEB-1', {
      title: ' ',
      priority: 'asap',
      dueDate: '2026-02-30',
      estimate: 2.5,
    })
    expect(res.status).toBe(400)
    expect(Object.keys(res.data.fields).sort()).toEqual(['dueDate', 'estimate', 'priority', 'title'])
  })
})

describe('dashboard and notifications', () => {
  it('counts only open issues as overdue, unless the planted bug is on', async () => {
    const overdue = async (bugs: BugId[]) => {
      const c = client(bugs)
      await c.login(...ADMIN)
      return (await c.call<DashboardData>('GET', '/api/dashboard')).data.stats.overdue
    }
    const clean = await overdue([])
    expect(clean).toBe(1) // WEB-31; WEB-35 and WEB-46 are done.
    expect(await overdue(['dashboard-overdue-count'])).toBeGreaterThan(clean)
  })

  it('names the actor in notifications, or "undefined" with the planted bug', async () => {
    const text = async (bugs: BugId[]) => {
      const c = client(bugs)
      await c.login(...ADMIN)
      return (await c.call<{ items: Array<{ text: string }> }>('GET', '/api/notifications')).data.items[0]!.text
    }
    expect(await text([])).toBe('Liam Chen commented on WEB-30')
    expect(await text(['undefined-in-notification'])).toBe('undefined commented on WEB-30')
  })
})

describe('test hooks and settings', () => {
  it('resets the data and swaps the planted bugs', async () => {
    const c = client()
    await c.login(...MEMBER)
    await c.call('POST', '/api/projects/WEB/issues', { title: 'Temp' })
    const reset = await c.call<{ flags: string[] }>('POST', '/api/test/reset', { bugs: 'visual' })
    expect(reset.data.flags).toContain('long-title-overflow')
    expect(reset.data.flags).not.toContain('search-case-sensitive')
    expect((await c.call('GET', '/api/projects')).status).toBe(401) // sessions are cleared too
    await c.login(...MEMBER)
    expect((await c.call<Page<Issue>>('GET', '/api/projects/WEB/issues?pageSize=0')).data.total).toBe(46)
    expect((await c.call('POST', '/api/test/reset', { bugs: ['nope'] })).status).toBe(400)
  })

  it('logs in by alias through the test hook, without a password', async () => {
    const c = client()
    const res = await c.call<{ user: { email: string } }>('POST', '/api/test/login', { as: 'viewer' })
    expect(res.data.user.email).toBe('victor@tasklane.test')
    expect((await c.call<{ user: { role: string } }>('GET', '/api/auth/me')).data.user.role).toBe('viewer')
    expect((await c.call('POST', '/api/test/login', { as: 'liam@tasklane.test' })).status).toBe(200)
    expect((await c.call('POST', '/api/test/login', { as: 'nobody' })).status).toBe(400)
  })

  it('parses BUGS and LATENCY settings', () => {
    expect(parseBugs(undefined)).toEqual([])
    expect(parseBugs('all')).toHaveLength(16)
    expect(parseBugs('functional, broken-avatar')).toHaveLength(11)
    expect(() => parseBugs('typo')).toThrow(/Unknown bug id/)
    expect(parseLatency(undefined)).toEqual([120, 350])
    expect(parseLatency('0')).toEqual([0, 0])
    expect(parseLatency('400-100')).toEqual([100, 400])
    expect(() => parseLatency('fast')).toThrow()
  })

  it('saves the profile name, or only pretends to with the planted bug', async () => {
    const saved = async (bugs: BugId[]) => {
      const c = client(bugs)
      await c.login(...MEMBER)
      const res = await c.call<{ user: { name: string } }>('PATCH', '/api/me', { name: 'Maya O.' })
      expect(res.data.user.name).toBe('Maya O.')
      return (await c.call<{ user: { name: string } }>('GET', '/api/auth/me')).data.user.name
    }
    expect(await saved([])).toBe('Maya O.')
    expect(await saved(['profile-name-not-saved'])).toBe('Maya Okafor')
  })
})
