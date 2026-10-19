import type { Preferences, Priority, Role, TemplateId } from '../shared/types.ts'
import { emptyStore, hashPassword, type IssueRecord, type ProjectRecord, type Store } from './db.ts'
import { buildLabels, buildStatuses } from './templates.ts'
import { addDays, isoDate } from './time.ts'

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  density: 'comfortable',
  notifyAssigned: true,
  notifyComments: true,
  weeklyDigest: false,
}

/** Seed accounts. The README lists the same credentials. */
export const SEED_USERS: Array<{
  key: string
  name: string
  email: string
  password: string
  role: Role
  title: string
  color: string
  joinedDaysAgo: number
  avatarUrl?: string
}> = [
  { key: 'ada', name: 'Ada Park', email: 'ada@tasklane.test', password: 'Admin123!', role: 'admin', title: 'Head of Product', color: '#2453d6', joinedDaysAgo: 420 },
  { key: 'maya', name: 'Maya Okafor', email: 'maya@tasklane.test', password: 'Member123!', role: 'member', title: 'Frontend Engineer', color: '#1d8a5a', joinedDaysAgo: 300 },
  { key: 'victor', name: 'Victor Lindqvist', email: 'victor@tasklane.test', password: 'Viewer123!', role: 'viewer', title: 'Finance Lead', color: '#b8860b', joinedDaysAgo: 150 },
  { key: 'liam', name: 'Liam Chen', email: 'liam@tasklane.test', password: 'Password123!', role: 'member', title: 'Backend Engineer', color: '#7c4dcc', joinedDaysAgo: 280 },
  { key: 'sofia', name: 'Sofia Rossi', email: 'sofia@tasklane.test', password: 'Password123!', role: 'member', title: 'Product Designer', color: '#c8372d', joinedDaysAgo: 200, avatarUrl: '/avatars/sofia-rossi.png' },
  { key: 'noah', name: 'Noah Kim', email: 'noah@tasklane.test', password: 'Password123!', role: 'member', title: 'Marketing Manager', color: '#0e7490', joinedDaysAgo: 90 },
]

const P: Record<string, Priority> = { u: 'urgent', h: 'high', m: 'medium', l: 'low', n: 'none' }

// [title, status index, priority, assignee key, label names, due in days, estimate]
type Row = [string, number, keyof typeof P, string | null, string[], number | null, number | null]

const WEB: Row[] = [
  ['Audit current site navigation', 4, 'm', 'ada', ['Design'], -12, 3],
  ['Define new color tokens', 4, 'h', 'sofia', ['Design'], -8, 2],
  ['Build responsive header', 3, 'h', 'maya', ['Feature'], 2, 5],
  ['Fix footer links opening in the same tab', 1, 'l', 'liam', ['Bug'], 6, 1],
  ['Migrate blog to the new CMS', 0, 'm', null, ['Tech debt'], null, 8],
  ['Add dark mode toggle', 2, 'm', 'maya', ['Feature'], 4, 3],
  ['Optimize hero image loading', 2, 'h', 'liam', ['Tech debt'], 1, 3],
  ['Pricing page: annual and monthly switch', 1, 'm', 'maya', ['Feature'], 9, 3],
  ['Contact form shows no validation messages', 1, 'h', 'liam', ['Bug'], -2, 2],
  ['Set up redirects for old URLs', 0, 'l', null, [], null, 2],
  ['Cookie banner covers the footer on mobile', 2, 'u', 'sofia', ['Bug', 'Accessibility'], -1, 2],
  ['Write copy for the About page', 1, 'n', 'ada', [], 5, null],
  ['Create 404 page illustration', 0, 'l', 'sofia', ['Design'], null, 2],
  ['Improve Lighthouse performance score', 0, 'm', null, ['Tech debt'], null, 5],
  ['Add skip-to-content link', 4, 'm', 'maya', ['Accessibility'], -5, 1],
  ['Replace icon font with SVG sprites', 0, 'l', 'liam', ['Tech debt'], null, 3],
  ['Newsletter signup with double opt-in', 1, 'm', 'liam', ['Feature'], 12, 3],
  ['Case studies grid layout', 3, 'm', 'sofia', ['Design'], 3, 3],
  ['Search results page', 0, 'm', null, ['Feature'], null, 5],
  ['Fix layout shift on the product page', 2, 'h', 'ada', ['Bug'], 0, 2],
  ['Localize landing page (German, French)', 0, 'l', null, ['Feature'], null, 8],
  ['Customer logos carousel', 4, 'l', 'sofia', ['Design'], -15, 2],
  ['Add structured data for products', 1, 'l', 'liam', ['Tech debt'], 14, 2],
  ['Remove unused CSS', 4, 'n', 'maya', ['Tech debt'], null, 1],
  ['Team page photos', 0, 'n', 'ada', [], null, null],
  ['Keyboard focus styles for buttons', 3, 'h', 'maya', ['Accessibility'], 1, 2],
  ['Changelog page', 1, 'l', 'maya', ['Feature'], 20, 3],
  ['Low contrast on secondary buttons', 1, 'm', 'sofia', ['Accessibility', 'Design'], 7, 1],
  ['Generate sitemap.xml', 4, 'l', 'liam', ['Tech debt'], -20, 1],
  ['Investigate intermittent 502 errors on the checkout page when customers apply multiple discount codes at the same time', 1, 'u', 'liam', ['Bug'], 2, 5],
  ['Demo request flow', 0, 'h', 'ada', ['Feature'], -3, 5],
  ['Hero animation stutters in Safari', 0, 'm', null, ['Bug'], null, 2],
  ['Pricing FAQ accordion', 4, 'l', 'maya', ['Feature'], -6, 2],
  ['Image alt text audit', 1, 'm', 'ada', ['Accessibility'], 3, 2],
  ['Legal pages template', 4, 'n', 'ada', [], -10, 1],
  ['Status page link in footer', 4, 'l', 'liam', [], -4, 1],
  ['Integrations directory', 0, 'm', null, ['Feature'], null, 8],
  ['Testimonial quotes component', 3, 'l', 'sofia', ['Design'], 5, 2],
  ['Mobile menu stays open after navigation', 1, 'h', 'maya', ['Bug'], 1, 2],
  ['Upgrade build tooling', 0, 'm', 'liam', ['Tech debt'], null, 5],
  ['Show reading time on blog posts', 4, 'l', 'maya', ['Feature'], -2, 1],
  ['RSS feed for the blog', 0, 'n', null, [], null, 1],
  ['Spam protection for forms', 1, 'h', 'liam', ['Feature'], 8, 3],
  ['Careers page with open roles', 0, 'l', 'ada', [], null, 3],
  ['Launch checklist review', 1, 'h', 'ada', [], 10, 2],
  ['Broken links report', 4, 'l', 'ada', ['Bug'], -1, 1],
]

const MOB: Row[] = [
  ['Onboarding carousel', 4, 'm', 'sofia', ['Design'], -9, 3],
  ['Ask for push notification permission at the right moment', 1, 'm', 'liam', ['Feature'], 6, 2],
  ['Offline mode for saved items', 0, 'h', null, ['Feature'], null, 8],
  ['App crashes when rotating on the login screen', 2, 'u', 'liam', ['Bug'], 0, 3],
  ['Biometric login', 1, 'h', 'maya', ['Feature'], 11, 5],
  ['Deep links from email', 0, 'm', null, ['Feature'], null, 3],
  ['Settings screen redesign', 3, 'm', 'sofia', ['Design'], 2, 3],
  ['Reduce app download size', 0, 'l', 'liam', ['Tech debt'], null, 5],
  ['Dark mode icons', 4, 'l', 'sofia', ['Design'], -3, 1],
  ['In-app feedback form', 1, 'l', 'ada', ['Feature'], 15, 2],
  ['Crash reporting setup', 4, 'h', 'liam', ['Tech debt'], -11, 2],
  ['Tablet layout for lists', 0, 'm', 'maya', ['Design'], null, 5],
  ['Pull to refresh on the inbox', 2, 'm', 'maya', ['Feature'], 3, 2],
  ['App Store screenshots', 1, 'n', 'ada', [], 4, 1],
  ['Accessibility labels for the tab bar', 1, 'h', 'maya', ['Accessibility'], -1, 1],
]

const MKT: Row[] = [
  ['Launch announcement blog post', 3, 'h', 'noah', ['Blog'], 2, 3],
  ['Product Hunt launch prep', 1, 'h', 'noah', ['Social'], 9, 3],
  ['Email sequence for trial users', 2, 'm', 'noah', ['Email'], 5, 5],
  ['Webinar with a customer panel', 0, 'm', null, ['Video'], null, 5],
  ['LinkedIn ad creatives', 2, 'm', 'sofia', ['Paid', 'Social'], 3, 2],
  ['Press kit update', 4, 'l', 'ada', [], -7, 2],
  ['Launch video script', 1, 'h', 'noah', ['Video'], 6, 3],
  ['Partner co-marketing outreach', 0, 'l', null, [], null, 2],
  ['Customer story: Northwind Logistics', 3, 'm', 'ada', ['Blog'], 1, 3],
  ['Holiday promo landing page', 0, 'm', 'sofia', ['Paid'], null, 3],
  ['Newsletter: October edition', 4, 'm', 'noah', ['Email'], -2, 1],
  ['Retargeting campaign setup', 1, 'l', 'noah', ['Paid'], 13, 2],
]

const OPS: Row[] = [
  ['Clean up old feature flags', 0, 'l', 'liam', [], null, 2],
  ['Onboarding doc for new hires', 2, 'm', 'ada', ['Important'], -30, 2],
  ['Expense tool export', 1, 'm', 'liam', [], -14, 3],
  ['Archive Q2 dashboards', 2, 'l', 'ada', [], -25, 1],
  ['Rotate staging API keys', 0, 'h', 'ada', ['Important'], -18, 1],
]

const DESCRIPTIONS: Record<string, string> = {
  'WEB-3':
    'The header needs to work from 320px up to wide desktop screens.\n\nBelow 768px the navigation collapses into a menu button. The logo stays on the left and the "Book a demo" button stays visible at every size.',
  'WEB-11':
    'On phones the cookie banner sits on top of the footer links, so people cannot reach Privacy or Imprint until they accept.\n\nSteps: open the site on a 390px wide screen, scroll to the bottom.\nExpected: footer links are reachable.\nActual: the banner covers them.',
  'WEB-30':
    'Support reported three cases this week. All of them applied two or more discount codes within a few seconds.\n\nThe gateway logs show the upstream timing out after 30 seconds. Start with the discount service; it locks the cart row for every code.',
  'MOB-4': 'Reproduces on Android 15 and iOS 19. Rotate the phone while the login form has focus and the app closes.',
  'MKT-1': 'Draft is in the shared drive. Needs a final pass from Ada and two screenshots of the new board view.',
}

interface ProjectSeed {
  key: string
  name: string
  description: string
  color: string
  template: TemplateId
  lead: string
  members: string[]
  archived: boolean
  createdDaysAgo: number
  rows: Row[]
}

const PROJECTS: ProjectSeed[] = [
  {
    key: 'WEB',
    name: 'Website Redesign',
    description: 'New marketing site: navigation, pricing, blog and performance work before the Q4 launch.',
    color: '#2453d6',
    template: 'software',
    lead: 'maya',
    members: ['ada', 'maya', 'liam', 'sofia', 'victor'],
    archived: false,
    createdDaysAgo: 60,
    rows: WEB,
  },
  {
    key: 'MOB',
    name: 'Mobile App',
    description: 'iOS and Android app for reviewing and updating issues on the go.',
    color: '#1d8a5a',
    template: 'software',
    lead: 'liam',
    members: ['ada', 'liam', 'maya', 'sofia'],
    archived: false,
    createdDaysAgo: 45,
    rows: MOB,
  },
  {
    key: 'MKT',
    name: 'Q4 Launch Campaign',
    description: 'Everything marketing needs for the launch: blog, email, social, video and paid.',
    color: '#b4489b',
    template: 'marketing',
    lead: 'noah',
    members: ['ada', 'noah', 'sofia'],
    archived: false,
    createdDaysAgo: 30,
    rows: MKT,
  },
  {
    key: 'OPS',
    name: 'Internal Tools',
    description: 'Small fixes for the tools the team uses every day.',
    color: '#5b6577',
    template: 'blank',
    lead: 'ada',
    members: ['ada', 'liam'],
    archived: true,
    createdDaysAgo: 200,
    rows: OPS,
  },
]

const uid = (key: string) => `u_${key}`

export function seedStore(now: Date = new Date()): Store {
  const store = emptyStore()
  store.seq = 1000
  const at = (daysAgo: number, hours = 0) => addDays(now, -daysAgo - hours / 24).toISOString()

  for (const u of SEED_USERS) {
    store.users.push({
      id: uid(u.key),
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      color: u.color,
      avatarUrl: u.avatarUrl ?? null,
      joinedAt: at(u.joinedDaysAgo),
      preferences: { ...DEFAULT_PREFERENCES },
      passwordHash: hashPassword(u.password),
    })
  }

  for (const seed of PROJECTS) {
    const id = `p_${seed.key.toLowerCase()}`
    const project: ProjectRecord = {
      id,
      key: seed.key,
      name: seed.name,
      description: seed.description,
      color: seed.color,
      template: seed.template,
      statuses: buildStatuses(id, seed.template),
      labels: buildLabels(id, seed.template),
      memberIds: seed.members.map(uid),
      leadId: uid(seed.lead),
      archived: seed.archived,
      createdAt: at(seed.createdDaysAgo),
      issueSeq: seed.rows.length,
    }
    store.projects.push(project)

    seed.rows.forEach(([title, statusIndex, p, assignee, labels, due, estimate], i) => {
      const number = i + 1
      const ref = `${seed.key}-${number}`
      const status = project.statuses[statusIndex]!
      const createdDaysAgo = Math.max(1, Math.round(seed.createdDaysAgo * (1 - i / seed.rows.length)))
      const done = status.category === 'done'
      const issue: IssueRecord = {
        id: `i_${seed.key.toLowerCase()}_${number}`,
        projectId: id,
        number,
        title,
        description: DESCRIPTIONS[ref] ?? '',
        statusId: status.id,
        priority: P[p]!,
        assigneeId: assignee ? uid(assignee) : null,
        reporterId: uid(i % 3 === 0 ? 'ada' : seed.lead),
        labelIds: labels.map((name) => project.labels.find((l) => l.name === name)!.id),
        dueDate: due === null ? null : isoDate(addDays(now, due)),
        estimate,
        subtasks: [],
        order: number * 1000,
        createdAt: at(createdDaysAgo),
        updatedAt: at(Math.max(0, createdDaysAgo - 3), i % 7),
        completedAt: done ? at((i % 9) + 1) : null,
      }
      store.issues.push(issue)
      store.activity.push({
        id: `a_${seed.key.toLowerCase()}_${number}`,
        issueRef: ref,
        projectKey: seed.key,
        actorId: issue.reporterId,
        text: `created ${ref}`,
        createdAt: issue.createdAt,
      })
    })
  }

  const issue = (ref: string) => {
    const [key, n] = ref.split('-')
    return store.issues.find((i) => i.id === `i_${key!.toLowerCase()}_${n}`)!
  }

  issue('WEB-3').subtasks = [
    { id: 'st_1', title: 'Desktop layout', done: true },
    { id: 'st_2', title: 'Tablet layout', done: true },
    { id: 'st_3', title: 'Mobile menu', done: false },
    { id: 'st_4', title: 'Sticky behaviour on scroll', done: false },
  ]
  issue('WEB-30').subtasks = [
    { id: 'st_5', title: 'Reproduce on staging', done: true },
    { id: 'st_6', title: 'Add timing logs to the discount service', done: false },
    { id: 'st_7', title: 'Load test with parallel discount codes', done: false },
  ]

  const comments: Array<[ref: string, author: string, body: string, hoursAgo: number]> = [
    ['WEB-3', 'sofia', 'Mobile menu designs are in the file, page "Header v3".', 30],
    ['WEB-3', 'maya', 'Thanks! Desktop and tablet are done, starting on the menu today.', 20],
    ['WEB-11', 'ada', 'This blocks the privacy review, so it needs to go out this week.', 50],
    ['WEB-30', 'liam', 'I can reproduce it on staging with two codes applied within a second.', 6],
    ['WEB-30', 'ada', 'Great. Let me know if you need help from the payments team.', 4],
    ['MOB-4', 'maya', 'Same crash on my Pixel. Logs attached in the support ticket.', 26],
  ]
  comments.forEach(([ref, author, body, hoursAgo], i) => {
    const target = issue(ref)
    const createdAt = addDays(now, -hoursAgo / 24).toISOString()
    store.comments.push({ id: `c_${i + 1}`, issueId: target.id, authorId: uid(author), body, createdAt, editedAt: null })
    store.activity.push({
      id: `a_c${i + 1}`,
      issueRef: ref,
      projectKey: ref.split('-')[0]!,
      actorId: uid(author),
      text: `commented on ${ref}`,
      createdAt,
    })
  })

  const moves: Array<[ref: string, actor: string, status: string, hoursAgo: number]> = [
    ['WEB-3', 'maya', 'In Review', 3],
    ['WEB-20', 'ada', 'In Progress', 9],
    ['MKT-1', 'noah', 'Review', 12],
    ['WEB-46', 'ada', 'Done', 22],
    ['MOB-4', 'liam', 'In Progress', 28],
  ]
  moves.forEach(([ref, actor, status, hoursAgo], i) => {
    store.activity.push({
      id: `a_m${i + 1}`,
      issueRef: ref,
      projectKey: ref.split('-')[0]!,
      actorId: uid(actor),
      text: `moved ${ref} to ${status}`,
      createdAt: addDays(now, -hoursAgo / 24).toISOString(),
    })
  })

  const notifications: Array<[user: string, actor: string, text: string, ref: string, hoursAgo: number, read: boolean]> = [
    ['ada', 'liam', 'commented on WEB-30', 'WEB-30', 4, false],
    ['ada', 'maya', 'assigned you WEB-20', 'WEB-20', 9, false],
    ['ada', 'noah', 'assigned you MKT-9', 'MKT-9', 40, true],
    ['maya', 'sofia', 'commented on WEB-3', 'WEB-3', 30, false],
    ['liam', 'ada', 'assigned you WEB-30', 'WEB-30', 72, true],
  ]
  notifications.forEach(([user, actor, text, ref, hoursAgo, read], i) => {
    store.notifications.push({
      id: `n_${i + 1}`,
      userId: uid(user),
      actorId: uid(actor),
      text,
      issueRef: ref,
      projectKey: ref.split('-')[0]!,
      read,
      createdAt: addDays(now, -hoursAgo / 24).toISOString(),
    })
  })

  store.invites.push({ id: 'inv_1', email: 'emma@tasklane.test', role: 'member', invitedById: uid('ada'), createdAt: at(2) })

  return store
}
