import { useState, type FormEvent } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import type { Density, Preferences, Theme, User } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { useAuth, useMe } from '../auth.tsx'
import { PROJECT_COLORS } from '../components/NewProjectWizard.tsx'
import { Icon } from '../components/icons.tsx'
import { ConfirmDialog } from '../components/Modal.tsx'
import { Avatar, Field, RoleBadge, Switch } from '../components/ui.tsx'
import { emit } from '../events.ts'
import { passwordStrength } from '../format.ts'
import { useTitle } from '../hooks.ts'
import { useToast } from '../toast.tsx'

export function SettingsPage() {
  useTitle('Settings')
  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <nav className="tabs" aria-label="Settings sections">
        <NavLink to="profile" className="tab">
          Profile
        </NavLink>
        <NavLink to="account" className="tab">
          Account
        </NavLink>
        <NavLink to="preferences" className="tab">
          Preferences
        </NavLink>
      </nav>
      <div className="settings-page">
        <Outlet />
      </div>
    </div>
  )
}

export function ProfileSettings() {
  const me = useMe()
  const { setUser } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(me.name)
  const [title, setTitle] = useState(me.title)
  const [color, setColor] = useState(me.color)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const dirty = name !== me.name || title !== me.title || color !== me.color

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!dirty || saving) return
    setSaving(true)
    try {
      const res = await api<{ user: User }>('/me', { method: 'PATCH', body: { name, title, color } })
      setUser(res.user)
      setName(res.user.name)
      setTitle(res.user.title)
      setErrors({})
      emit('users-changed')
      toast('Profile saved')
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(apiErr.fields)
      if (!Object.keys(apiErr.fields).length) toast(apiErr.message, { kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      <div className="profile-preview">
        <Avatar user={{ ...me, name: name || me.name, color, avatarUrl: me.avatarUrl }} size={56} />
        <div>
          <strong>{name || me.name}</strong>
          <p className="muted">{me.email}</p>
          <RoleBadge role={me.role} />
        </div>
      </div>
      <form className="form-grid narrow" onSubmit={submit} noValidate>
        <Field label="Full name" htmlFor="profile-name" error={errors.name}>
          <input id="profile-name" className="input" value={name} maxLength={50} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Job title" htmlFor="profile-title" error={errors.title} hint="Shown on the Team page.">
          <input id="profile-title" className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="Ask an admin to change your email.">
          <input id="profile-email" className="input" value={me.email} readOnly disabled />
        </Field>
        <fieldset className="field">
          <legend>Avatar color</legend>
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <label key={c} className="swatch" style={{ background: c }}>
                <input type="radio" name="avatar-color" value={c} checked={color === c} onChange={() => setColor(c)} aria-label={`Color ${c}`} />
                {color === c && <Icon name="check" size={14} />}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  )
}

export function AccountSettings() {
  const { setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const strength = passwordStrength(next)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const local: Record<string, string> = {}
    if (!current) local.currentPassword = 'Enter your current password'
    if (!next) local.newPassword = 'Enter a new password'
    if (next && confirm !== next) local.confirm = "Passwords don't match"
    setErrors(local)
    if (Object.keys(local).length) return
    setSaving(true)
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } })
      setCurrent('')
      setNext('')
      setConfirm('')
      toast('Password changed. Other sessions were logged out.')
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(Object.keys(apiErr.fields).length ? apiErr.fields : { form: apiErr.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="settings-section" aria-labelledby="password-title">
        <h2 id="password-title">Change password</h2>
        <form className="form-grid narrow" onSubmit={submit} noValidate>
          {errors.form && (
            <p className="form-error" role="alert">
              {errors.form}
            </p>
          )}
          <Field label="Current password" htmlFor="pw-current" error={errors.currentPassword}>
            <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field
            label="New password"
            htmlFor="pw-new"
            error={errors.newPassword}
            hint={strength ? <span className={`strength strength-${strength}`}><span className="strength-bar" />Password strength: {strength}</span> : 'At least 8 characters, with a letter and a number.'}
          >
            <input id="pw-new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm}>
            <input id="pw-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
      <section className="settings-section" aria-labelledby="sessions-title">
        <h2 id="sessions-title">Sessions</h2>
        <p className="section-hint">Log out on every browser and device, including this one.</p>
        <button type="button" className="btn" onClick={() => setConfirmLogout(true)}>
          <Icon name="logout" size={15} />
          Log out everywhere
        </button>
      </section>
      {confirmLogout && (
        <ConfirmDialog
          title="Log out everywhere?"
          message={<p>You'll need to log in again on every device.</p>}
          confirmLabel="Log out everywhere"
          onConfirm={async () => {
            await api('/me/logout-everywhere', { method: 'POST' })
            setUser(null)
            navigate('/login')
          }}
          onClose={() => setConfirmLogout(false)}
        />
      )}
    </>
  )
}

export function PreferenceSettings() {
  const me = useMe()
  const { setUser } = useAuth()
  const toast = useToast()
  const prefs = me.preferences

  const save = async (patch: Partial<Preferences>) => {
    setUser({ ...me, preferences: { ...prefs, ...patch } })
    try {
      const res = await api<{ user: User }>('/me/preferences', { method: 'PATCH', body: patch })
      setUser(res.user)
      toast('Preferences saved')
    } catch (err) {
      setUser(me)
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  const themes: Array<{ id: Theme; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'Match system' },
  ]
  const densities: Array<{ id: Density; label: string; desc: string }> = [
    { id: 'comfortable', label: 'Comfortable', desc: 'More space around cards and rows' },
    { id: 'compact', label: 'Compact', desc: 'Fits more on the screen' },
  ]

  return (
    <>
      <section className="settings-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">Appearance</h2>
        <fieldset className="field">
          <legend>Theme</legend>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={prefs.theme === t.id} className="segment" onClick={() => void save({ theme: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Density</legend>
          <div className="radio-cards radio-cards-row">
            {densities.map((d) => (
              <label key={d.id} className={prefs.density === d.id ? 'radio-card is-selected' : 'radio-card'}>
                <input type="radio" name="density" value={d.id} checked={prefs.density === d.id} onChange={() => void save({ density: d.id })} />
                <span className="radio-card-title">{d.label}</span>
                <span className="radio-card-desc">{d.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <section className="settings-section" aria-labelledby="email-title">
        <h2 id="email-title">Email notifications</h2>
        <ul className="switch-list narrow">
          <SwitchRow label="Someone assigns me an issue" checked={prefs.notifyAssigned} onChange={(v) => void save({ notifyAssigned: v })} />
          <SwitchRow label="Someone comments on my issues" checked={prefs.notifyComments} onChange={(v) => void save({ notifyComments: v })} />
          <SwitchRow label="Weekly summary every Monday" checked={prefs.weeklyDigest} onChange={(v) => void save({ weeklyDigest: v })} />
        </ul>
      </section>
    </>
  )
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="switch-row">
      <span>{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </li>
  )
}
