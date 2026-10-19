import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { Label, Project } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { Icon } from '../components/icons.tsx'
import { ConfirmDialog } from '../components/Modal.tsx'
import { PROJECT_COLORS } from '../components/NewProjectWizard.tsx'
import { Avatar, Field, StatusIcon } from '../components/ui.tsx'
import { emit } from '../events.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { useProject } from './ProjectLayout.tsx'

const LABEL_COLORS = ['#c8372d', '#2453d6', '#7c4dcc', '#1d8a5a', '#b8860b', '#0e7490', '#b4489b', '#5b6577']

async function saveProject(key: string, body: Record<string, unknown>): Promise<Project> {
  const res = await api<{ project: Project }>(`/projects/${key}`, { method: 'PATCH', body })
  emit('projects-changed')
  return res.project
}

export function ProjectSettingsPage() {
  const { project } = useProject()
  const me = useMe()
  const editable = canEdit(me)
  return (
    <div className="settings-page project-settings">
      {!editable && <p className="banner">Viewers can see project settings but not change them.</p>}
      <GeneralSection project={project} editable={editable} />
      <ColumnsSection project={project} editable={editable} />
      <LabelsSection project={project} editable={editable} />
      <MembersSection project={project} editable={editable} />
      {me.role === 'admin' && <DangerSection project={project} />}
    </div>
  )
}

function GeneralSection({ project, editable }: { project: Project; editable: boolean }) {
  const toast = useToast()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [color, setColor] = useState(project.color)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setName(project.name)
    setDescription(project.description)
    setColor(project.color)
  }, [project.name, project.description, project.color])
  const dirty = name !== project.name || description !== project.description || color !== project.color

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await saveProject(project.key, { name, description, color })
      setErrors({})
      toast('Project saved')
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(apiErr.fields)
      if (!Object.keys(apiErr.fields).length) toast(apiErr.message, { kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="ps-general">
      <h2 id="ps-general">General</h2>
      <form className="form-grid narrow" onSubmit={submit} noValidate>
        <Field label="Project name" htmlFor="ps-name" error={errors.name}>
          <input id="ps-name" className="input" value={name} maxLength={60} disabled={!editable} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="ps-description" error={errors.description}>
          <textarea id="ps-description" className="input" rows={3} value={description} maxLength={500} disabled={!editable} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <fieldset className="field" disabled={!editable}>
          <legend>Color</legend>
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <label key={c} className="swatch" style={{ background: c }}>
                <input type="radio" name="ps-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={`Color ${c}`} />
                {color === c && <Icon name="check" size={14} />}
              </label>
            ))}
          </div>
        </fieldset>
        {editable && (
          <div>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </form>
    </section>
  )
}

function ColumnsSection({ project, editable }: { project: Project; editable: boolean }) {
  const toast = useToast()
  const initial = () => Object.fromEntries(project.statuses.map((s) => [s.id, s.wipLimit === null ? '' : String(s.wipLimit)]))
  const [limits, setLimits] = useState<Record<string, string>>(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setLimits(initial()), [project.statuses])
  const dirty = project.statuses.some((s) => (s.wipLimit === null ? '' : String(s.wipLimit)) !== (limits[s.id] ?? ''))

  const save = async () => {
    const statuses = project.statuses.map((s) => {
      const raw = (limits[s.id] ?? '').trim()
      return { id: s.id, wipLimit: raw === '' ? null : Number(raw) }
    })
    if (statuses.some((s) => s.wipLimit !== null && (!Number.isInteger(s.wipLimit) || s.wipLimit < 1 || s.wipLimit > 50))) {
      setError('Limits must be whole numbers from 1 to 50, or empty')
      return
    }
    try {
      await saveProject(project.key, { statuses })
      setError(null)
      toast('Column limits saved')
    } catch (err) {
      const apiErr = toApiError(err)
      setError(apiErr.fields.statuses ?? apiErr.message)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="ps-columns">
      <h2 id="ps-columns">Columns</h2>
      <p className="section-hint">A limit highlights a column when it holds more issues than it should. Leave it empty for no limit.</p>
      <table className="table table-compact narrow">
        <thead>
          <tr>
            <th>Column</th>
            <th>Limit</th>
          </tr>
        </thead>
        <tbody>
          {project.statuses.map((s) => (
            <tr key={s.id}>
              <td>
                <span className="cell-icon">
                  <StatusIcon category={s.category} />
                  {s.name}
                </span>
              </td>
              <td>
                <input
                  className="input input-sm input-number"
                  type="number"
                  min={1}
                  max={50}
                  aria-label={`Limit for ${s.name}`}
                  value={limits[s.id] ?? ''}
                  disabled={!editable}
                  onChange={(e) => setLimits((l) => ({ ...l, [s.id]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {editable && (
        <button type="button" className="btn" disabled={!dirty} onClick={() => void save()}>
          Save limits
        </button>
      )}
    </section>
  )
}

function LabelsSection({ project, editable }: { project: Project; editable: boolean }) {
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]!)
  const [error, setError] = useState<string | null>(null)

  const save = async (labels: Array<Partial<Label>>, message: string) => {
    try {
      await saveProject(project.key, { labels })
      setError(null)
      toast(message)
      return true
    } catch (err) {
      const apiErr = toApiError(err)
      setError(apiErr.fields.labels ?? apiErr.message)
      return false
    }
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) {
      setError('Enter a label name')
      return
    }
    if (await save([...project.labels, { name, color: newColor }], `Added label ${name}`)) setNewName('')
  }

  return (
    <section className="settings-section" aria-labelledby="ps-labels">
      <h2 id="ps-labels">Labels</h2>
      <ul className="label-list narrow">
        {project.labels.map((l) => (
          <li key={l.id}>
            <span className="label-dot" style={{ background: l.color }} />
            <span>{l.name}</span>
            <span className="spacer" />
            {editable && (
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label={`Remove label ${l.name}`}
                onClick={() => void save(project.labels.filter((x) => x.id !== l.id), `Removed label ${l.name}`)}
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </li>
        ))}
        {project.labels.length === 0 && <li className="muted">No labels yet.</li>}
      </ul>
      {editable && (
        <form className="label-add narrow" onSubmit={add} noValidate>
          <input className="input input-sm" placeholder="New label" aria-label="New label name" value={newName} maxLength={30} onChange={(e) => setNewName(e.target.value)} />
          <select className="select select-sm" aria-label="New label color" value={newColor} onChange={(e) => setNewColor(e.target.value)}>
            {LABEL_COLORS.map((c, i) => (
              <option key={c} value={c}>
                {['Red', 'Blue', 'Purple', 'Green', 'Amber', 'Teal', 'Pink', 'Gray'][i]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm">
            Add label
          </button>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function MembersSection({ project, editable }: { project: Project; editable: boolean }) {
  const toast = useToast()
  const { users } = useWorkspace()
  const [memberIds, setMemberIds] = useState(project.memberIds)
  const [leadId, setLeadId] = useState(project.leadId)
  useEffect(() => {
    setMemberIds(project.memberIds)
    setLeadId(project.leadId)
  }, [project.memberIds, project.leadId])
  const dirty = leadId !== project.leadId || memberIds.length !== project.memberIds.length || memberIds.some((id) => !project.memberIds.includes(id))

  const save = async () => {
    try {
      await saveProject(project.key, { memberIds, leadId })
      toast('Members saved')
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  return (
    <section className="settings-section" aria-labelledby="ps-members">
      <h2 id="ps-members">Members</h2>
      <ul className="member-options narrow">
        {users.map((u) => (
          <li key={u.id}>
            <label className="member-option">
              <input
                type="checkbox"
                checked={memberIds.includes(u.id)}
                disabled={!editable || u.id === leadId}
                onChange={() => setMemberIds((ids) => (ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]))}
              />
              <Avatar user={u} size={26} />
              <span className="member-option-text">
                <span>
                  {u.name}
                  {u.id === leadId && <span className="muted"> (lead)</span>}
                </span>
                <span className="muted">{u.title || u.email}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="form-grid narrow">
        <Field label="Project lead" htmlFor="ps-lead">
          <select id="ps-lead" className="select" value={leadId} disabled={!editable} onChange={(e) => setLeadId(e.target.value)}>
            {users
              .filter((u) => memberIds.includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        {editable && (
          <div>
            <button type="button" className="btn" disabled={!dirty} onClick={() => void save()}>
              Save members
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function DangerSection({ project }: { project: Project }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)

  return (
    <section className="settings-section danger-zone" aria-labelledby="ps-danger">
      <h2 id="ps-danger">Danger zone</h2>
      <div className="danger-row">
        <div>
          <strong>{project.archived ? 'Unarchive this project' : 'Archive this project'}</strong>
          <p className="section-hint">{project.archived ? 'The board becomes editable again.' : 'The board becomes read-only and the project leaves the sidebar.'}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (project.archived) {
              void saveProject(project.key, { archived: false }).then(
                () => toast(`Unarchived ${project.name}`),
                (err: unknown) => toast(toApiError(err).message, { kind: 'error' }),
              )
            } else setConfirm('archive')
          }}
        >
          {project.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>
      <div className="danger-row">
        <div>
          <strong>Delete this project</strong>
          <p className="section-hint">Deletes the project and all of its issues. You can't undo this.</p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>
          Delete project
        </button>
      </div>
      {confirm === 'archive' && (
        <ConfirmDialog
          title={`Archive ${project.name}?`}
          message={<p>The board becomes read-only and the project leaves the sidebar. You can unarchive it later.</p>}
          confirmLabel="Archive project"
          onConfirm={async () => {
            await saveProject(project.key, { archived: true })
            toast(`Archived ${project.name}`)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${project.name}?`}
          message={<p>This deletes the project and all {project.stats.total} of its issues. You can't undo this.</p>}
          confirmLabel="Delete project"
          danger
          requireText={project.key}
          onConfirm={async () => {
            await api(`/projects/${project.key}`, { method: 'DELETE' })
            navigate('/projects')
            emit('projects-changed')
            toast(`Deleted ${project.name}`)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </section>
  )
}
