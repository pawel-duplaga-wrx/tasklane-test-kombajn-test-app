import { useMemo, useState, type DragEvent } from 'react'
import type { Issue, Page, Status } from '../../shared/types.ts'
import { api, qs, toApiError } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { useShell } from '../components/AppShell.tsx'
import { FilterBar, useIssueFilters } from '../components/FilterBar.tsx'
import { Icon } from '../components/icons.tsx'
import { Avatar, DueDate, ErrorState, LabelChip, PageLoader, PriorityIcon, StatusIcon } from '../components/ui.tsx'
import { emit, useEvent } from '../events.ts'
import { hasBug } from '../flags.ts'
import { useAsync, useEscape } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { lanePoints, orderAt } from '../board-logic.ts'
import { useProject } from './ProjectLayout.tsx'

export function BoardPage() {
  const { project } = useProject()
  const me = useMe()
  const toast = useToast()
  const editable = canEdit(me) && !project.archived
  const { filters, active, clear } = useIssueFilters()
  const query = qs({ ...filters, sort: 'manual', pageSize: 0 })
  const { data, error, reload, setData } = useAsync((signal) => api<Page<Issue>>(`/projects/${project.key}/issues${query}`, { signal }), [project.key, query])
  useEvent('issues-changed', reload)
  const [dragRef, setDragRef] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ statusId: string; index: number } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const lanes = useMemo(() => {
    const map = new Map<string, Issue[]>(project.statuses.map((s) => [s.id, []]))
    for (const issue of data?.items ?? []) map.get(issue.statusId)?.push(issue)
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [data, project.statuses])

  const move = async (ref: string, status: Status, index: number) => {
    const issue = data?.items.find((i) => i.ref === ref)
    if (!issue) return
    const lane = (lanes.get(status.id) ?? []).filter((i) => i.ref !== ref)
    const order = orderAt(lane, index)
    if (issue.statusId === status.id && issue.order === order) return
    setData((d) => d && { ...d, items: d.items.map((i) => (i.ref === ref ? { ...i, statusId: status.id, order } : i)) })
    try {
      await api(`/issues/${ref}`, { method: 'PATCH', body: { statusId: status.id, order } })
      if (status.wipLimit && issue.statusId !== status.id && lane.length + 1 > status.wipLimit) {
        toast(`${status.name} is over its limit: ${lane.length + 1} of ${status.wipLimit}`, { kind: 'warning' })
      }
      emit('issues-changed')
    } catch (err) {
      reload()
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  const create = async (title: string, statusId: string) => {
    try {
      await api(`/projects/${project.key}/issues`, { method: 'POST', body: { title, statusId } })
      emit('issues-changed')
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  const indexFromPointer = (container: HTMLElement, y: number): number => {
    const cards = [...container.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => el.dataset.card !== dragRef)
    const i = cards.findIndex((el) => {
      const box = el.getBoundingClientRect()
      return y < box.top + box.height / 2
    })
    return i === -1 ? cards.length : i
  }

  const laneHandlers = (status: Status) =>
    editable
      ? {
          onDragOver: (e: DragEvent<HTMLDivElement>) => {
            if (!dragRef) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const index = indexFromPointer(e.currentTarget, e.clientY)
            setDrop((d) => (d?.statusId === status.id && d.index === index ? d : { statusId: status.id, index }))
          },
          onDragLeave: (e: DragEvent<HTMLDivElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.statusId === status.id ? null : d))
          },
          onDrop: (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            const ref = e.dataTransfer.getData('text/plain') || dragRef
            const index = indexFromPointer(e.currentTarget, e.clientY)
            setDragRef(null)
            setDrop(null)
            if (ref) void move(ref, status, index)
          },
        }
      : {}

  if (error && !data) return <ErrorState error={error} onRetry={reload} />

  return (
    <div className="board-page">
      <FilterBar project={project} />
      {active && data && data.total === 0 && (
        <div className="banner">
          No issues match these filters.{' '}
          <button type="button" className="link-btn" onClick={clear}>
            Clear filters
          </button>
        </div>
      )}
      {!data ? (
        <PageLoader label="Loading board" />
      ) : (
        <div className="board" aria-label={`${project.name} board`}>
          {project.statuses.map((status) => {
            const issues = lanes.get(status.id) ?? []
            const over = status.wipLimit !== null && issues.length > status.wipLimit
            const points = lanePoints(issues, hasBug('points-sum-off-by-one'))
            return (
              <section key={status.id} className={over ? 'lane is-over' : 'lane'} aria-labelledby={`lane-${status.id}`}>
                <header className="lane-head">
                  <StatusIcon category={status.category} />
                  <h2 className="lane-title" id={`lane-${status.id}`}>
                    {status.name}
                  </h2>
                  {status.wipLimit !== null ? (
                    <span className={over ? 'lane-count wip-over' : 'lane-count'} title={`Limit: ${status.wipLimit}`}>
                      {issues.length} / {status.wipLimit}
                    </span>
                  ) : (
                    <span className="lane-count">{issues.length}</span>
                  )}
                  {points > 0 && (
                    <span className="lane-points" title="Total estimate">
                      {points} pts
                    </span>
                  )}
                  <span className="spacer" />
                  {editable && (
                    <button type="button" className="icon-btn icon-btn-sm" aria-label={`Add issue to ${status.name}`} onClick={() => setAdding(status.id)}>
                      <Icon name="plus" size={15} />
                    </button>
                  )}
                </header>
                <div className={drop?.statusId === status.id ? 'lane-body is-drop-target' : 'lane-body'} {...laneHandlers(status)}>
                  {issues.map((issue, i) => (
                    <div key={issue.id} className="card-slot">
                      {drop?.statusId === status.id && drop.index === i && dragRef !== issue.ref && <div className="drop-indicator" />}
                      <IssueCard
                        issue={issue}
                        draggable={editable}
                        dragging={dragRef === issue.ref}
                        onDragStart={() => setDragRef(issue.ref)}
                        onDragEnd={() => {
                          setDragRef(null)
                          setDrop(null)
                        }}
                      />
                    </div>
                  ))}
                  {drop?.statusId === status.id && drop.index >= issues.filter((x) => x.ref !== dragRef).length && <div className="drop-indicator" />}
                  {issues.length === 0 && !adding && <p className="lane-empty">No issues</p>}
                  {adding === status.id ? (
                    <QuickAdd statusName={status.name} onSubmit={(title) => create(title, status.id)} onClose={() => setAdding(null)} />
                  ) : (
                    editable && (
                      <button type="button" className="lane-add" onClick={() => setAdding(status.id)}>
                        <Icon name="plus" size={14} />
                        Add issue
                      </button>
                    )
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function IssueCard({
  issue,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  issue: Issue
  draggable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const shell = useShell()
  const { project } = useProject()
  const { userById } = useWorkspace()
  const labels = project.labels.filter((l) => issue.labelIds.includes(l.id))
  const done = project.statuses.find((s) => s.id === issue.statusId)?.category === 'done'
  const subDone = issue.subtasks.filter((s) => s.done).length

  return (
    <article
      className={dragging ? 'card is-dragging' : 'card'}
      data-card={issue.ref}
      draggable={draggable}
      tabIndex={0}
      role="button"
      aria-label={`${issue.ref}: ${issue.title}`}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', issue.ref)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={() => shell.openIssue(issue.ref)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          shell.openIssue(issue.ref)
        }
      }}
    >
      <div className="card-top">
        <span className="card-ref">{issue.ref}</span>
        <PriorityIcon priority={issue.priority} size={14} />
      </div>
      <p className="card-title">{issue.title}</p>
      {labels.length > 0 && (
        <div className="card-labels">
          {labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
          {labels.length > 2 && <span className="label-chip">+{labels.length - 2}</span>}
        </div>
      )}
      <div className="card-foot">
        <DueDate date={issue.dueDate} done={done} />
        {issue.subtasks.length > 0 && (
          <span className="card-subtasks" title="Sub-tasks done">
            <Icon name="check" size={12} />
            {subDone}/{issue.subtasks.length}
          </span>
        )}
        {issue.estimate !== null && (
          <span className="card-estimate" title="Estimate">
            {issue.estimate}
          </span>
        )}
        <span className="spacer" />
        <Avatar user={userById(issue.assigneeId)} size={22} />
      </div>
    </article>
  )
}

function QuickAdd({ statusName, onSubmit, onClose }: { statusName: string; onSubmit: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEscape(onClose)

  const submit = async () => {
    const value = title.trim()
    if (!value || busy) return
    setBusy(true)
    await onSubmit(value)
    setTitle('')
    setBusy(false)
  }

  return (
    <div className="quick-add">
      <textarea
        className="input"
        rows={2}
        autoFocus
        aria-label={`New issue in ${statusName}`}
        placeholder="Issue title"
        value={title}
        maxLength={200}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void submit()
          }
        }}
        onBlur={() => {
          if (!title.trim()) onClose()
        }}
      />
      <div className="inline-actions">
        <button type="button" className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={() => void submit()} disabled={!title.trim() || busy}>
          Add
        </button>
        <button type="button" className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
