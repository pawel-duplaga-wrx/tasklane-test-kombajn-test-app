import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ESTIMATES, PRIORITIES, type Comment, type Issue, type IssueDetail } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { emit } from '../events.ts'
import { hasBug } from '../flags.ts'
import { formatDateTime, PRIORITY_LABELS, relativeTime, shiftIsoDate } from '../format.ts'
import { useAsync, useEscape } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { Icon } from './icons.tsx'
import { Menu } from './Menu.tsx'
import { ConfirmDialog } from './Modal.tsx'
import { AssigneePicker, LabelPicker } from './pickers.tsx'
import { Avatar, ErrorState, PriorityIcon, ProgressBar, Skeleton, StatusIcon } from './ui.tsx'

type IssuePatch = Partial<Pick<Issue, 'title' | 'description' | 'statusId' | 'priority' | 'assigneeId' | 'labelIds' | 'dueDate' | 'estimate' | 'subtasks'>>

/** The property fields (status, priority, assignee, labels, due date, estimate): edited as a draft and saved with the Save button. */
type PropsDraft = Partial<Pick<Issue, 'statusId' | 'priority' | 'assigneeId' | 'labelIds' | 'dueDate' | 'estimate'>>

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** The draft with one field set; a field set back to the saved value leaves the draft. */
function setDraftField<K extends keyof PropsDraft>(draft: PropsDraft, issue: Issue, key: K, value: PropsDraft[K]): PropsDraft {
  const next = { ...draft }
  if (sameValue(issue[key], value)) delete next[key]
  else next[key] = value
  return next
}

export function IssueDrawer({ issueRef, onClose }: { issueRef: string; onClose: () => void }) {
  const me = useMe()
  const editable = canEdit(me)
  const toast = useToast()
  const { data, error, loading, setData, reload } = useAsync((signal) => api<IssueDetail>(`/issues/${encodeURIComponent(issueRef)}`, { signal }), [issueRef])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState<PropsDraft>({})
  const [saving, setSaving] = useState(false)
  const dirty = Object.keys(draft).length > 0
  const panelRef = useRef<HTMLElement>(null)
  useEscape(onClose)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => setDraft({}), [issueRef])

  const update = async (patch: IssuePatch): Promise<boolean> => {
    if (!data) return false
    let body: IssuePatch = patch
    // Planted bug: the date sent to the server is one day early.
    if (patch.dueDate && hasBug('due-date-shifts')) body = { ...patch, dueDate: shiftIsoDate(patch.dueDate, -1) }
    const previous = data.issue
    setData((d) => d && { ...d, issue: { ...d.issue, ...patch } })
    try {
      await api<{ issue: Issue }>(`/issues/${data.issue.ref}`, { method: 'PATCH', body })
      reload()
      emit('issues-changed')
      return true
    } catch (err) {
      setData((d) => d && { ...d, issue: previous })
      toast(toApiError(err).message, { kind: 'error' })
      return false
    }
  }

  const saveDraft = async () => {
    if (!dirty || saving) return
    setSaving(true)
    const saved = await update(draft)
    setSaving(false)
    if (saved) {
      setDraft({})
      toast('Changes saved')
    }
  }

  const remove = async () => {
    if (!data) return
    const ref = data.issue.ref
    await api(`/issues/${ref}`, { method: 'DELETE' })
    onClose()
    emit('issues-changed')
    toast(`Deleted ${ref}`, {
      action: {
        label: 'Undo',
        onClick: () => {
          // Planted bug: says it restored the issue without asking the server.
          if (hasBug('undo-delete-noop')) {
            toast(`Restored ${ref}`)
            return
          }
          api(`/issues/${ref}/restore`, { method: 'POST' })
            .then(() => {
              emit('issues-changed')
              toast(`Restored ${ref}`)
            })
            .catch((err: unknown) => toast(toApiError(err).message, { kind: 'error' }))
        },
      },
    })
  }

  const copyLink = async () => {
    if (!data) return
    const url = `${window.location.origin}/projects/${data.project.key}/board?issue=${data.issue.ref}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast("Couldn't copy the link. Copy it from the address bar instead.", { kind: 'error' })
    }
  }

  return createPortal(
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-label={`Issue ${issueRef}`} tabIndex={-1}>
        <header className="drawer-header">
          <div className="drawer-crumb">
            {data && <span className="project-swatch" style={{ background: data.project.color }} />}
            <span>{data ? data.project.name : 'Issue'}</span>
            <Icon name="chevron-right" size={14} />
            <span className="drawer-ref">{issueRef.toUpperCase()}</span>
          </div>
          <div className="drawer-actions">
            <button type="button" className="icon-btn" aria-label="Copy link" title="Copy link" onClick={copyLink} disabled={!data}>
              <Icon name="link" />
            </button>
            {editable && data && (
              <Menu
                label="Issue actions"
                button={<Icon name="more" />}
                items={[{ label: 'Delete issue', icon: <Icon name="trash" size={15} />, danger: true, onSelect: () => setConfirmDelete(true) }]}
              />
            )}
            <button type="button" className="icon-btn" aria-label="Close issue" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
        </header>
        <div className="drawer-body">
          {error && !data ? (
            <ErrorState error={error.status === 404 ? Object.assign(error, { message: "This issue doesn't exist or was deleted." }) : error} onRetry={reload} />
          ) : !data ? (
            <DrawerSkeleton />
          ) : (
            <IssueContent
              detail={data}
              editable={editable}
              busy={loading}
              draft={draft}
              onDraftChange={(key, value) => setDraft((d) => setDraftField(d, data.issue, key, value))}
              onUpdate={update}
              onCommentsChange={(comments) => setData((d) => d && { ...d, comments })}
              reload={reload}
            />
          )}
        </div>
        {editable && data && (
          <footer className="drawer-footer">
            <span className="drawer-footer-note">{dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}</span>
            <button type="button" className="btn btn-sm" disabled={!dirty || saving} onClick={() => setDraft({})}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={() => void saveDraft()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        )}
      </aside>
      {confirmDelete && data && (
        <ConfirmDialog
          title={`Delete ${data.issue.ref}?`}
          message={
            <p>
              "{data.issue.title}" and its comments will be deleted. You can undo this for a few seconds afterwards.
            </p>
          }
          confirmLabel="Delete issue"
          danger
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>,
    document.body,
  )
}

function DrawerSkeleton() {
  return (
    <div className="drawer-skeleton" aria-busy="true" aria-label="Loading issue">
      <Skeleton height={26} width="80%" />
      <Skeleton height={14} width="40%" />
      <div className="props">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
      <Skeleton height={80} />
    </div>
  )
}

function IssueContent({
  detail,
  editable,
  busy,
  draft,
  onDraftChange,
  onUpdate,
  onCommentsChange,
  reload,
}: {
  detail: IssueDetail
  editable: boolean
  busy: boolean
  draft: PropsDraft
  onDraftChange: <K extends keyof PropsDraft>(key: K, value: PropsDraft[K]) => void
  onUpdate: (patch: IssuePatch) => Promise<boolean>
  onCommentsChange: (comments: Comment[]) => void
  reload: () => void
}) {
  const { project } = detail
  const saved = detail.issue
  // The property fields show the draft; everything else shows what is saved.
  const issue = { ...saved, ...draft }
  const { users, userById } = useWorkspace()
  const status = project.statuses.find((s) => s.id === issue.statusId)
  const reporter = userById(issue.reporterId)
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')

  return (
    <div className="issue" aria-busy={busy}>
      <TitleEditor value={issue.title} editable={editable} onSave={async (title) => void (await onUpdate({ title }))} />
      <p className="issue-meta">
        Opened by {reporter?.name ?? 'a former member'} {relativeTime(issue.createdAt)}, updated {relativeTime(issue.updatedAt)}
      </p>

      <dl className="props">
        <dt>
          <label htmlFor="issue-status">Status</label>
        </dt>
        <dd className="prop-with-icon">
          {status && <StatusIcon category={status.category} />}
          <select id="issue-status" className="select select-sm" value={issue.statusId} disabled={!editable} onChange={(e) => onDraftChange('statusId', e.target.value)}>
            {project.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </dd>
        <dt>
          <label htmlFor="issue-priority">Priority</label>
        </dt>
        <dd className="prop-with-icon">
          <PriorityIcon priority={issue.priority} />
          <select id="issue-priority" className="select select-sm" value={issue.priority} disabled={!editable} onChange={(e) => onDraftChange('priority', e.target.value as Issue['priority'])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </dd>
        <dt>
          <label htmlFor="issue-assignee">Assignee</label>
        </dt>
        <dd>
          <AssigneePicker id="issue-assignee" value={issue.assigneeId} users={users} disabled={!editable} onChange={(assigneeId) => onDraftChange('assigneeId', assigneeId)} />
        </dd>
        <dt>
          <label htmlFor="issue-labels">Labels</label>
        </dt>
        <dd>
          <LabelPicker id="issue-labels" value={issue.labelIds} labels={project.labels} disabled={!editable} onChange={(labelIds) => onDraftChange('labelIds', labelIds)} />
        </dd>
        <dt>
          <label htmlFor="issue-due">Due date</label>
        </dt>
        <dd>
          <DueDateInput value={issue.dueDate} disabled={!editable} onChange={(dueDate) => onDraftChange('dueDate', dueDate)} />
        </dd>
        <dt>
          <label htmlFor="issue-estimate">Estimate</label>
        </dt>
        <dd>
          <select
            id="issue-estimate"
            className="select select-sm"
            value={issue.estimate ?? ''}
            disabled={!editable}
            onChange={(e) => onDraftChange('estimate', e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">No estimate</option>
            {[...new Set([...ESTIMATES, ...(issue.estimate !== null ? [issue.estimate] : [])])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'point' : 'points'}
                </option>
              ))}
          </select>
        </dd>
      </dl>

      <DescriptionEditor value={saved.description} editable={editable} onSave={async (description) => void (await onUpdate({ description }))} />
      <Subtasks issue={saved} editable={editable} onSave={async (subtasks) => void (await onUpdate({ subtasks }))} />

      <section className="issue-section">
        <div className="tabs" role="tablist" aria-label="Issue history">
          <button type="button" role="tab" aria-selected={tab === 'comments'} className="tab" onClick={() => setTab('comments')}>
            Comments <span className="tab-count">{detail.comments.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'activity'} className="tab" onClick={() => setTab('activity')}>
            Activity
          </button>
        </div>
        {tab === 'comments' ? (
          <Comments issueRef={issue.ref} comments={detail.comments} onChange={onCommentsChange} reload={reload} />
        ) : (
          <ul className="activity-list">
            {detail.activity.map((a) => (
              <li key={a.id} className="activity-item">
                <Avatar user={userById(a.actorId)} size={20} />
                <span>
                  <strong>{userById(a.actorId)?.name ?? 'A former member'}</strong> {a.text}
                </span>
                <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                  {relativeTime(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function TitleEditor({ value, editable, onSave }: { value: string; editable: boolean; onSave: (title: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEscape(() => setEditing(false), editing)

  const save = () => {
    const title = draft.trim()
    setEditing(false)
    if (title && title !== value) void onSave(title)
  }

  if (!editable) return <h2 className="issue-title">{value}</h2>
  if (!editing) {
    return (
      <h2 className="issue-title">
        <button
          type="button"
          className="title-button"
          title="Edit title"
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
        >
          {value}
        </button>
      </h2>
    )
  }
  return (
    <textarea
      className="input title-input"
      aria-label="Issue title"
      value={draft}
      autoFocus
      rows={2}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        }
      }}
    />
  )
}

function DueDateInput({ value, disabled, onChange }: { value: string | null; disabled: boolean; onChange: (date: string | null) => void }) {
  return (
    <div className="due-input">
      <input id="issue-due" type="date" className="input input-sm" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
      {value && !disabled && (
        <button type="button" className="icon-btn icon-btn-sm" aria-label="Clear due date" onClick={() => onChange(null)}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}

function DescriptionEditor({ value, editable, onSave }: { value: string; editable: boolean; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEscape(() => setEditing(false), editing)

  const save = () => {
    setEditing(false)
    if (draft !== value) void onSave(draft)
  }

  return (
    <section className="issue-section">
      <div className="section-head">
        <h3>Description</h3>
        {editable && value && !editing && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setDraft(value)
              setEditing(true)
            }}
          >
            <Icon name="edit" size={14} />
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            className="input"
            aria-label="Description"
            rows={7}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
            }}
          />
          <div className="inline-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Save
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : value ? (
        <div className="description">
          {value.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      ) : editable ? (
        <button
          type="button"
          className="placeholder-button"
          onClick={() => {
            setDraft('')
            setEditing(true)
          }}
        >
          Add a description
        </button>
      ) : (
        <p className="muted">No description.</p>
      )}
    </section>
  )
}

function Subtasks({ issue, editable, onSave }: { issue: Issue; editable: boolean; onSave: (subtasks: Issue['subtasks']) => Promise<void> }) {
  const [draft, setDraft] = useState('')
  const done = issue.subtasks.filter((s) => s.done).length

  const add = () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    void onSave([...issue.subtasks, { id: '', title, done: false }])
  }

  return (
    <section className="issue-section">
      <div className="section-head">
        <h3>Sub-tasks</h3>
        {issue.subtasks.length > 0 && (
          <span className="subtask-progress">
            {done} of {issue.subtasks.length} done
            <ProgressBar done={done} total={issue.subtasks.length} />
          </span>
        )}
      </div>
      {issue.subtasks.length > 0 && (
        <ul className="subtasks">
          {issue.subtasks.map((s) => (
            <li key={s.id} className={s.done ? 'subtask is-done' : 'subtask'}>
              <label>
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={!editable}
                  onChange={() => void onSave(issue.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                />
                <span>{s.title}</span>
              </label>
              {editable && (
                <button
                  type="button"
                  className="icon-btn icon-btn-sm subtask-remove"
                  aria-label={`Remove sub-task: ${s.title}`}
                  onClick={() => void onSave(issue.subtasks.filter((x) => x.id !== s.id))}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="subtask-add">
          <input
            className="input input-sm"
            placeholder="Add a sub-task"
            aria-label="New sub-task"
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
          <button type="button" className="btn btn-sm" onClick={add} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      )}
      {!editable && issue.subtasks.length === 0 && <p className="muted">No sub-tasks.</p>}
    </section>
  )
}

function Comments({ issueRef, comments, onChange, reload }: { issueRef: string; comments: Comment[]; onChange: (c: Comment[]) => void; reload: () => void }) {
  const me = useMe()
  const toast = useToast()
  const { userById } = useWorkspace()
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  useEscape(() => setEditingId(null), editingId !== null)

  const post = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    setError(null)
    try {
      const res = await api<{ comment: Comment }>(`/issues/${issueRef}/comments`, { method: 'POST', body: { body } })
      setDraft('')
      // Planted bug: the new comment is added to the thread twice.
      onChange(hasBug('comment-posted-twice') ? [...comments, res.comment, { ...res.comment, id: `${res.comment.id}-copy` }] : [...comments, res.comment])
      emit('issues-changed')
    } catch (err) {
      const e = toApiError(err)
      setError(e.fields.body ?? e.message)
    } finally {
      setPosting(false)
    }
  }

  const saveEdit = async (comment: Comment) => {
    const body = editDraft.trim()
    if (!body) return
    try {
      const res = await api<{ comment: Comment }>(`/comments/${comment.id}`, { method: 'PATCH', body: { body } })
      onChange(comments.map((c) => (c.id === comment.id ? res.comment : c)))
      setEditingId(null)
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  const remove = async (comment: Comment) => {
    try {
      await api(`/comments/${comment.id}`, { method: 'DELETE' })
      reload()
      toast('Comment deleted')
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  return (
    <div className="comments">
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      <ul className="comment-list">
        {comments.map((c) => {
          const author = userById(c.authorId)
          const mine = c.authorId === me.id
          return (
            <li key={c.id} className="comment">
              <Avatar user={author} size={28} />
              <div className="comment-main">
                <div className="comment-head">
                  <strong>{author?.name ?? 'A former member'}</strong>
                  <time dateTime={c.createdAt} title={formatDateTime(c.createdAt)}>
                    {relativeTime(c.createdAt)}
                  </time>
                  {c.editedAt && <span className="muted">(edited)</span>}
                  {(mine || me.role === 'admin') && editingId !== c.id && (
                    <span className="comment-actions">
                      {mine && (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setEditingId(c.id)
                            setEditDraft(c.body)
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button type="button" className="link-btn link-btn-danger" onClick={() => void remove(c)}>
                        Delete
                      </button>
                    </span>
                  )}
                </div>
                {editingId === c.id ? (
                  <div className="comment-edit">
                    <textarea className="input" aria-label="Edit comment" rows={3} autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                    <div className="inline-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveEdit(c)} disabled={!editDraft.trim()}>
                        Save
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="comment-body">{c.body}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {canEdit(me) ? (
        <div className="composer">
          <textarea
            className={error ? 'input has-error' : 'input'}
            aria-label="Write a comment"
            placeholder="Write a comment"
            rows={3}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void post()
            }}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="composer-actions">
            <span className="field-hint">Ctrl + Enter to send</span>
            <button type="button" className="btn btn-primary btn-sm" disabled={!draft.trim() || posting} onClick={() => void post()}>
              {posting ? 'Sending…' : 'Comment'}
            </button>
          </div>
        </div>
      ) : (
        <p className="readonly-note">Viewers can't comment. Ask an admin for member access.</p>
      )}
    </div>
  )
}
