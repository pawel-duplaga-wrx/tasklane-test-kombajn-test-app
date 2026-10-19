import type { BugId } from '../shared/bugs.ts'

let flags = new Set<string>()

/** Stores the planted bugs from /api/meta. CSS-only bugs key off `html[data-bugs]`. */
export function setFlags(list: string[]): void {
  flags = new Set(list)
  if (list.length > 0) document.documentElement.dataset.bugs = list.join(' ')
  else delete document.documentElement.dataset.bugs
}

export function hasBug(id: BugId): boolean {
  return flags.has(id)
}
