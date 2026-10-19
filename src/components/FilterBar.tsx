import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PRIORITIES, type Project } from '../../shared/types.ts'
import { useDebounced } from '../hooks.ts'
import { PRIORITY_LABELS } from '../format.ts'
import { useWorkspace } from '../workspace.tsx'
import { Icon } from './icons.tsx'

const KEYS = ['q', 'assignee', 'priority', 'label'] as const
type FilterKey = (typeof KEYS)[number]

/** Issue filters kept in the URL, shared by the board and the list. */
export function useIssueFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<FilterKey, string>, [params])
  const active = KEYS.some((k) => filters[k])

  const set = (key: FilterKey, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }
  const clear = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const k of KEYS) next.delete(k)
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }
  return { filters, active, set, clear }
}

export function FilterBar({ project }: { project: Project }) {
  const { filters, active, set, clear } = useIssueFilters()
  const { users } = useWorkspace()
  const members = users.filter((u) => project.memberIds.includes(u.id))
  const [search, setSearch] = useState(filters.q)
  const debounced = useDebounced(search, 300)

  useEffect(() => {
    if (debounced !== filters.q) set('q', debounced.trim())
    // Only push the debounced text; URL changes are synced below.
  }, [debounced])

  useEffect(() => {
    setSearch((s) => (s.trim() === filters.q ? s : filters.q))
  }, [filters.q])

  return (
    <div className="filter-bar" role="search">
      <div className="search-field">
        <Icon name="search" size={15} />
        <input className="input input-sm" type="search" placeholder="Filter issues" aria-label="Filter issues by title or key" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <select className="select select-sm" aria-label="Assignee" value={filters.assignee} onChange={(e) => set('assignee', e.target.value)}>
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="none">Unassigned</option>
        {members.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <select className="select select-sm" aria-label="Priority" value={filters.priority} onChange={(e) => set('priority', e.target.value)}>
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <select className="select select-sm" aria-label="Label" value={filters.label} onChange={(e) => set('label', e.target.value)}>
        <option value="">Any label</option>
        {project.labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setSearch('')
            clear()
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
