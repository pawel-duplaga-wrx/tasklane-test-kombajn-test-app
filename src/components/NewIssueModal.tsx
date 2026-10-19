import { useId, useRef, useState, type FormEvent } from 'react'
import { ESTIMATES, PRIORITIES, type Issue, type Priority } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { emit } from '../events.ts'
import { PRIORITY_LABELS } from '../format.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { useShell } from './AppShell.tsx'
import { Modal } from './Modal.tsx'
import { AssigneePicker, LabelPicker } from './pickers.tsx'
import { Field } from './ui.tsx'

export interface NewIssueDefaults {
  projectKey?: string
  statusId?: string
}

export function NewIssueModal({ defaults, onClose }: { defaults: NewIssueDefaults; onClose: () => void }) {
  const { projects, users } = useWorkspace()
  const shell = useShell()
  const toast = useToast()
  const formId = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const [projectKey, setProjectKey] = useState(defaults.projectKey ?? projects[0]?.key ?? '')
  const project = projects.find((p) => p.key === projectKey)
  const firstOpen = project?.statuses.find((s) => s.category === 'unstarted') ?? project?.statuses[0]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [statusId, setStatusId] = useState(defaults.statusId ?? firstOpen?.id ?? '')
  const [priority, setPriority] = useState<Priority>('none')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [estimate, setEstimate] = useState('')
  const [createMore, setCreateMore] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const changeProject = (key: string) => {
    const next = projects.find((p) => p.key === key)
    setProjectKey(key)
    setStatusId((next?.statuses.find((s) => s.category === 'unstarted') ?? next?.statuses[0])?.id ?? '')
    setLabelIds([])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving || !project) return
    if (!title.trim()) {
      setErrors({ title: 'Enter a title' })
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await api<{ issue: Issue }>(`/projects/${project.key}/issues`, {
        method: 'POST',
        body: {
          title,
          description,
          statusId,
          priority,
          assigneeId,
          labelIds,
          dueDate: dueDate || null,
          estimate: estimate === '' ? null : Number(estimate),
        },
      })
      emit('issues-changed')
      emit('notifications-changed')
      const ref = res.issue.ref
      toast(`Created ${ref}`, { action: { label: 'Open', onClick: () => shell.openIssue(ref) } })
      if (createMore) {
        setTitle('')
        setDescription('')
        titleRef.current?.focus()
      } else {
        onClose()
      }
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(apiErr.fields)
      setFormError(Object.keys(apiErr.fields).length ? null : apiErr.message)
    } finally {
      setSaving(false)
    }
  }

  if (!project) {
    return (
      <Modal title="New issue" onClose={onClose} size="sm">
        <p>Create a project first. Issues always belong to a project.</p>
      </Modal>
    )
  }

  return (
    <Modal
      title="New issue"
      onClose={onClose}
      size="lg"
      footer={
        <>
          <label className="checkbox-inline">
            <input type="checkbox" checked={createMore} onChange={(e) => setCreateMore(e.target.checked)} />
            Create another
          </label>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create issue'}
          </button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit} noValidate>
        <Field label="Project" htmlFor="new-issue-project">
          <select id="new-issue-project" className="select" value={projectKey} onChange={(e) => changeProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} ({p.key})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" htmlFor="new-issue-title" error={errors.title}>
          <input
            ref={titleRef}
            id="new-issue-title"
            className="input"
            value={title}
            maxLength={200}
            placeholder="What needs to be done?"
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'new-issue-title-error' : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="new-issue-description" error={errors.description}>
          <textarea id="new-issue-description" className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Status" htmlFor="new-issue-status" error={errors.statusId}>
            <select id="new-issue-status" className="select" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
              {project.statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority" htmlFor="new-issue-priority">
            <select id="new-issue-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Assignee" htmlFor="new-issue-assignee" error={errors.assigneeId}>
            <AssigneePicker id="new-issue-assignee" value={assigneeId} users={users} onChange={setAssigneeId} />
          </Field>
          <Field label="Labels" htmlFor="new-issue-labels">
            <LabelPicker id="new-issue-labels" value={labelIds} labels={project.labels} onChange={setLabelIds} />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Due date" htmlFor="new-issue-due" error={errors.dueDate}>
            <input id="new-issue-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Estimate" htmlFor="new-issue-estimate" error={errors.estimate}>
            <select id="new-issue-estimate" className="select" value={estimate} onChange={(e) => setEstimate(e.target.value)}>
              <option value="">No estimate</option>
              {ESTIMATES.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'point' : 'points'}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
