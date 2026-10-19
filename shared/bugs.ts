// Planted bugs, all off by default. Turn them on with BUGS=all, BUGS=functional,
// BUGS=visual or a comma-separated list of ids. BUGS.md describes each one.
export const BUGS = [
  { id: 'sidebar-stale-projects', kind: 'functional' },
  { id: 'points-sum-off-by-one', kind: 'functional' },
  { id: 'search-case-sensitive', kind: 'functional' },
  { id: 'undo-delete-noop', kind: 'functional' },
  { id: 'list-pagination-skips-row', kind: 'functional' },
  { id: 'due-date-shifts', kind: 'functional' },
  { id: 'viewer-can-create', kind: 'functional' },
  { id: 'comment-posted-twice', kind: 'functional' },
  { id: 'profile-name-not-saved', kind: 'functional' },
  { id: 'dashboard-overdue-count', kind: 'functional' },
  { id: 'long-title-overflow', kind: 'visual' },
  { id: 'mobile-header-covers-action', kind: 'visual' },
  { id: 'dark-low-contrast', kind: 'visual' },
  { id: 'broken-avatar', kind: 'visual' },
  { id: 'undefined-in-notification', kind: 'visual' },
  { id: 'wizard-footer-clipped', kind: 'visual' },
] as const

export type BugId = (typeof BUGS)[number]['id']
export type BugKind = (typeof BUGS)[number]['kind']

const IDS = new Set<string>(BUGS.map((b) => b.id))

export function isBugId(value: string): value is BugId {
  return IDS.has(value)
}

/** Parses the BUGS setting. Throws on an unknown id so a typo never silently runs clean. */
export function parseBugs(value: string | undefined): BugId[] {
  const parts = (value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const out = new Set<BugId>()
  for (const part of parts) {
    if (part === 'none') continue
    if (part === 'all' || part === 'functional' || part === 'visual') {
      for (const bug of BUGS) if (part === 'all' || bug.kind === part) out.add(bug.id)
      continue
    }
    if (!isBugId(part)) throw new Error(`Unknown bug id "${part}". Known: ${[...IDS].join(', ')}`)
    out.add(part)
  }
  return [...out]
}
