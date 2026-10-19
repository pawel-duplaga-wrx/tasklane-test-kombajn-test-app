import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PRIORITIES, type Issue, type Page } from '../../shared/types.ts'
import { api, qs, toApiError } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { useShell } from '../components/AppShell.tsx'
import { FilterBar, useIssueFilters } from '../components/FilterBar.tsx'
import { Icon } from '../components/icons.tsx'
import { ConfirmDialog } from '../components/Modal.tsx'
import { Avatar, DueDate, EmptyState, ErrorState, PageLoader, PriorityIcon, StatusIcon } from '../components/ui.tsx'
import { emit, useEvent } from '../events.ts'
import { pluralize, PRIORITY_LABELS, relativeTime } from '../format.ts'
import { useAsync } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { useProject } from './ProjectLayout.tsx'

const PAGE_SIZE = 20

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'key', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due', label: 'Due' },
  { key: 'updated', label: 'Updated' },
]

export function ListPage() {
  const { project } = useProject()
  const me = useMe()
  const shell = useShell()
  const toast = useToast()
  const { users, userById } = useWorkspace()
  const editable = canEdit(me) && !project.archived
  const [params, setParams] = useSearchParams()
  const { filters, active, clear } = useIssueFilters()
  const sort = params.get('sort') ?? 'key'
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const query = qs({ ...filters, sort, dir, page, pageSize: PAGE_SIZE })
  const { data, error, reload } = useAsync((signal) => api<Page<Issue>>(`/projects/${project.key}/issues${query}`, { signal }), [project.key, query])
  useEvent('issues-changed', reload)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => setSelected(new Set()), [query])

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const refsOnPage = data?.items.map((i) => i.ref) ?? []
  const allSelected = refsOnPage.length > 0 && refsOnPage.every((r) => selected.has(r))

  const setParam = (changes: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })
  }

  const toggleSort = (key: string) => {
    if (sort === key) setParam({ dir: dir === 'asc' ? 'desc' : 'asc', page: null })
    else setParam({ sort: key, dir: key === 'updated' ? 'desc' : 'asc', page: null })
  }

  const toggle = (ref: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  const bulk = async (action: 'status' | 'assignee' | 'priority' | 'delete', value?: string | null) => {
    const refs = [...selected]
    try {
      await api('/issues/bulk', { method: 'POST', body: { refs, action, value } })
      setSelected(new Set())
      emit('issues-changed')
      toast(action === 'delete' ? `Deleted ${pluralize(refs.length, 'issue')}` : `Updated ${pluralize(refs.length, 'issue')}`)
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  if (error && !data) return <ErrorState error={error} onRetry={reload} />

  const from = data && data.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = data ? Math.min(data.total, page * PAGE_SIZE) : 0

  return (
    <div className="list-page">
      <FilterBar project={project} />
      {selected.size > 0 && editable && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <select className="select select-sm" aria-label="Move selected to status" value="" onChange={(e) => e.target.value && void bulk('status', e.target.value)}>
            <option value="">Move to</option>
            {project.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            aria-label="Assign selected to"
            value=""
            onChange={(e) => e.target.value && void bulk('assignee', e.target.value === 'none' ? null : e.target.value)}
          >
            <option value="">Assign to</option>
            <option value="none">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select className="select select-sm" aria-label="Set priority of selected" value="" onChange={(e) => e.target.value && void bulk('priority', e.target.value)}>
            <option value="">Set priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} />
            Delete
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {!data ? (
        <PageLoader label="Loading issues" />
      ) : data.total === 0 ? (
        <EmptyState
          title={active ? 'No issues match these filters' : 'No issues yet'}
          action={
            active ? (
              <button type="button" className="btn" onClick={clear}>
                Clear filters
              </button>
            ) : (
              editable && (
                <button type="button" className="btn btn-primary" onClick={() => shell.openNewIssue({ projectKey: project.key })}>
                  Create an issue
                </button>
              )
            )
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {editable && (
                    <th className="col-check">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(refsOnPage))}
                      />
                    </th>
                  )}
                  {COLUMNS.map((col) => (
                    <th key={col.key} aria-sort={sort === col.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`col-${col.key}`}>
                      <button type="button" className="th-sort" onClick={() => toggleSort(col.key)}>
                        {col.label}
                        {sort === col.key && <Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={13} />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((issue) => {
                  const status = project.statuses.find((s) => s.id === issue.statusId)
                  const assignee = userById(issue.assigneeId)
                  return (
                    <tr key={issue.id} className={selected.has(issue.ref) ? 'is-selected' : undefined} onClick={() => shell.openIssue(issue.ref)}>
                      {editable && (
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Select ${issue.ref}`} checked={selected.has(issue.ref)} onChange={() => toggle(issue.ref)} />
                        </td>
                      )}
                      <td className="col-key">{issue.ref}</td>
                      <td className="col-title">
                        <button type="button" className="row-link" onClick={(e) => (e.stopPropagation(), shell.openIssue(issue.ref))}>
                          {issue.title}
                        </button>
                      </td>
                      <td className="col-status">
                        {status && (
                          <span className="cell-icon">
                            <StatusIcon category={status.category} />
                            {status.name}
                          </span>
                        )}
                      </td>
                      <td className="col-priority">
                        <span className="cell-icon">
                          <PriorityIcon priority={issue.priority} />
                          {PRIORITY_LABELS[issue.priority]}
                        </span>
                      </td>
                      <td className="col-assignee">
                        <span className="cell-icon">
                          <Avatar user={assignee} size={20} />
                          {assignee?.name ?? <span className="muted">Unassigned</span>}
                        </span>
                      </td>
                      <td className="col-due">
                        <DueDate date={issue.dueDate} done={status?.category === 'done'} />
                      </td>
                      <td className="col-updated">{relativeTime(issue.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Pages">
            <span className="pagination-info">
              Showing {from}–{to} of {data.total}
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
              <Icon name="chevron-left" size={14} />
              Previous
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === page ? 'btn btn-sm page-btn is-current' : 'btn btn-sm page-btn'}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
                onClick={() => setParam({ page: String(n) })}
              >
                {n}
              </button>
            ))}
            <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
              Next
              <Icon name="chevron-right" size={14} />
            </button>
          </nav>
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${pluralize(selected.size, 'issue')}?`}
          message={<p>The selected issues and their comments will be deleted.</p>}
          confirmLabel="Delete issues"
          danger
          onConfirm={() => bulk('delete')}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
