import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import type { SearchResults } from '../../shared/types.ts'
import { api } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { useDebounced, useEscape } from '../hooks.ts'
import { useShell, useCanCreateIssue } from './AppShell.tsx'
import { Icon, type IconName } from './icons.tsx'
import { Spinner } from './ui.tsx'

interface Item {
  id: string
  group: 'Actions' | 'Projects' | 'Issues'
  label: string
  hint?: string
  icon: IconName
  color?: string
  run: () => void
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const navigate = useNavigate()
  const shell = useShell()
  const canCreate = useCanCreateIssue()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const debounced = useDebounced(query.trim(), 200)
  const listId = useId()
  useEscape(onClose)

  useEffect(() => {
    if (!debounced) {
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    api<SearchResults>(`/search?q=${encodeURIComponent(debounced)}`, { signal: ctrl.signal })
      .then((r) => setResults(r))
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setSearching(false)
      })
    return () => ctrl.abort()
  }, [debounced])

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path)
    const actions: Item[] = [
      { id: 'a-dashboard', group: 'Actions', label: 'Go to Dashboard', icon: 'home', run: go('/') },
      { id: 'a-my', group: 'Actions', label: 'Go to My issues', icon: 'inbox', run: go('/my-issues') },
      { id: 'a-projects', group: 'Actions', label: 'Go to Projects', icon: 'folder', run: go('/projects') },
      { id: 'a-team', group: 'Actions', label: 'Go to Team', icon: 'users', run: go('/team') },
      { id: 'a-settings', group: 'Actions', label: 'Go to Settings', icon: 'settings', run: go('/settings') },
      ...(canCreate ? [{ id: 'a-new-issue', group: 'Actions' as const, label: 'Create issue', icon: 'plus' as const, run: () => shell.openNewIssue() }] : []),
      ...(canEdit(me) ? [{ id: 'a-new-project', group: 'Actions' as const, label: 'Create project', icon: 'plus' as const, run: () => shell.openNewProject() }] : []),
    ]
    const q = query.trim().toLowerCase()
    const matchedActions = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions
    const projects: Item[] = (results?.projects ?? []).map((p) => ({
      id: `p-${p.id}`,
      group: 'Projects',
      label: p.name,
      hint: p.archived ? `${p.key}, archived` : p.key,
      icon: 'folder',
      color: p.color,
      run: go(`/projects/${p.key}/board`),
    }))
    const issues: Item[] = (results?.issues ?? []).map((i) => ({
      id: `i-${i.id}`,
      group: 'Issues',
      label: i.title,
      hint: i.ref,
      icon: 'board',
      run: () => navigate(`/projects/${i.projectKey}/board?issue=${i.ref}`),
    }))
    return [...matchedActions, ...projects, ...issues]
  }, [query, results, navigate, shell, canCreate, me])

  useEffect(() => setActive(0), [items.length])

  const run = (item: Item | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(items[active])
    }
  }

  let lastGroup = ''
  return createPortal(
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-input">
          <Icon name="search" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
            aria-label="Search issues, projects and commands"
            placeholder="Search issues, projects and commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {searching && <Spinner size={16} label="Searching" />}
        </div>
        <ul className="palette-list" role="listbox" id={listId} aria-label="Results">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <li key={item.id} role="presentation">
                {header && (
                  <div className="palette-group" role="presentation">
                    {header}
                  </div>
                )}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'palette-item is-active' : 'palette-item'}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  {item.color ? <span className="project-swatch" style={{ background: item.color }} /> : <Icon name={item.icon} size={16} />}
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                </div>
              </li>
            )
          })}
          {items.length === 0 && !searching && debounced && <li className="palette-empty">Nothing matches "{debounced}"</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
