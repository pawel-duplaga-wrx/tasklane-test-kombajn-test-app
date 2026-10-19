import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Project, TemplateId } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { useMe } from '../auth.tsx'
import { emit } from '../events.ts'
import { suggestKey } from '../format.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'
import { Icon } from './icons.tsx'
import { Modal } from './Modal.tsx'
import { Avatar, Field } from './ui.tsx'

export const PROJECT_COLORS = ['#2453d6', '#1d8a5a', '#b4489b', '#c8372d', '#b8860b', '#0e7490', '#7c4dcc', '#5b6577']

const TEMPLATES: Array<{ id: TemplateId; name: string; description: string; lanes: string[] }> = [
  { id: 'software', name: 'Software', description: 'For product and engineering work, with a review step.', lanes: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'] },
  { id: 'marketing', name: 'Marketing', description: 'For campaigns and content, from idea to published.', lanes: ['Ideas', 'Planned', 'In Progress', 'Review', 'Published'] },
  { id: 'blank', name: 'Simple', description: 'Three columns. Add labels and limits later.', lanes: ['To do', 'Doing', 'Done'] },
]

const STEPS = ['Details', 'Template', 'Members', 'Review'] as const

export function NewProjectWizard({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const { users } = useWorkspace()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0]!)
  const [template, setTemplate] = useState<TemplateId>('software')
  const [memberIds, setMemberIds] = useState<string[]>([me.id])
  const [leadId, setLeadId] = useState(me.id)
  const [memberQuery, setMemberQuery] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const effectiveKey = keyTouched ? key : suggestKey(name)
  const members = users.filter((u) => memberIds.includes(u.id))
  const shownUsers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, memberQuery])
  const chosenTemplate = TEMPLATES.find((t) => t.id === template)!

  const validateDetails = (): boolean => {
    const next: Record<string, string> = {}
    if (name.trim().length < 3) next.name = 'Name must be at least 3 characters'
    if (!/^[A-Z][A-Z0-9]{1,4}$/.test(effectiveKey)) next.key = 'Use 2 to 5 letters or digits, starting with a letter'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const next = () => {
    if (step === 0 && !validateDetails()) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const toggleMember = (id: string) => {
    if (id === me.id) return
    setMemberIds((list) => {
      const nextList = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
      if (!nextList.includes(leadId)) setLeadId(me.id)
      return nextList
    })
  }

  const create = async () => {
    if (saving) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await api<{ project: Project }>('/projects', {
        method: 'POST',
        body: { name, key: effectiveKey, description, color, template, memberIds, leadId },
      })
      emit('projects-changed')
      toast(`Created project ${res.project.name}`)
      onClose()
      navigate(`/projects/${res.project.key}/board`)
    } catch (err) {
      const apiErr = toApiError(err)
      if (apiErr.fields.name || apiErr.fields.key || apiErr.fields.description) {
        setErrors(apiErr.fields)
        setStep(0)
      } else {
        setFormError(apiErr.message)
      }
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New project"
      onClose={onClose}
      size="lg"
      className="wizard"
      footer={
        <>
          <span className="wizard-step-label">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="spacer" />
          {step === 0 ? (
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={next}>
              Next
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={saving}>
              {saving ? 'Creating…' : 'Create project'}
            </button>
          )}
        </>
      }
    >
      <ol className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="stepper-num">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="stepper-label">{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="form-grid">
          <Field label="Project name" htmlFor="project-name" error={errors.name}>
            <input id="project-name" className="input" value={name} maxLength={60} placeholder="e.g. Customer Portal" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Key" htmlFor="project-key" error={errors.key} hint="Used in issue IDs, like WEB-12. 2 to 5 characters.">
            <input
              id="project-key"
              className="input input-key"
              value={effectiveKey}
              maxLength={5}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
              }}
            />
          </Field>
          <Field label="Description" htmlFor="project-description" error={errors.description} hint="Optional">
            <textarea id="project-description" className="input" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <fieldset className="field">
            <legend>Color</legend>
            <div className="swatches">
              {PROJECT_COLORS.map((c) => (
                <label key={c} className="swatch" style={{ background: c }}>
                  <input type="radio" name="project-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={`Color ${c}`} />
                  {color === c && <Icon name="check" size={14} />}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <fieldset className="template-options">
          <legend className="sr-only">Template</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className={template === t.id ? 'template-option is-selected' : 'template-option'}>
              <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} />
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.description}</span>
              <span className="template-lanes" aria-label={`Columns: ${t.lanes.join(', ')}`}>
                {t.lanes.map((lane) => (
                  <span key={lane} className="template-lane">
                    {lane}
                  </span>
                ))}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {step === 2 && (
        <div className="form-grid">
          <div className="search-field">
            <Icon name="search" size={15} />
            <input className="input input-sm" type="search" placeholder="Search people" aria-label="Search people" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} />
          </div>
          <ul className="member-options" aria-label="Members">
            {shownUsers.map((u) => (
              <li key={u.id}>
                <label className="member-option">
                  <input type="checkbox" checked={memberIds.includes(u.id)} disabled={u.id === me.id} onChange={() => toggleMember(u.id)} />
                  <Avatar user={u} size={28} />
                  <span className="member-option-text">
                    <span>
                      {u.name}
                      {u.id === me.id && <span className="muted"> (you)</span>}
                    </span>
                    <span className="muted">{u.title || u.email}</span>
                  </span>
                </label>
              </li>
            ))}
            {shownUsers.length === 0 && <li className="muted">No one matches "{memberQuery}"</li>}
          </ul>
          <Field label="Project lead" htmlFor="project-lead">
            <select id="project-lead" className="select" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              {members.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="review">
          <dl className="review-list">
            <dt>Name</dt>
            <dd>
              <span className="project-swatch" style={{ background: color }} /> {name.trim()}
            </dd>
            <dt>Key</dt>
            <dd>{effectiveKey}</dd>
            <dt>Description</dt>
            <dd>{description.trim() || <span className="muted">None</span>}</dd>
            <dt>Template</dt>
            <dd>
              {chosenTemplate.name}: {chosenTemplate.lanes.join(', ')}
            </dd>
            <dt>Members</dt>
            <dd>{members.map((u) => u.name).join(', ')}</dd>
            <dt>Lead</dt>
            <dd>{users.find((u) => u.id === leadId)?.name}</dd>
          </dl>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
