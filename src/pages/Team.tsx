import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ROLES, type Invite, type Role, type User } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { useMe } from '../auth.tsx'
import { Icon } from '../components/icons.tsx'
import { ConfirmDialog, Modal } from '../components/Modal.tsx'
import { Avatar, Field, RoleBadge } from '../components/ui.tsx'
import { emit } from '../events.ts'
import { formatDate, isoDate, relativeTime } from '../format.ts'
import { useAsync, useTitle } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'

const ROLE_HELP: Record<Role, string> = {
  admin: 'Manages members, projects and settings',
  member: 'Creates and edits projects and issues',
  viewer: 'Can see everything, changes nothing',
}

export function TeamPage() {
  useTitle('Team')
  const me = useMe()
  const admin = me.role === 'admin'
  const toast = useToast()
  const { users } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<User | null>(null)
  const invites = useAsync((signal) => (admin ? api<{ invites: Invite[] }>('/invites', { signal }) : Promise.resolve({ invites: [] })), [admin])
  const inviteOpen = admin && params.get('invite') === '1'

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, query])

  const changeRole = async (user: User, role: Role) => {
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { role } })
      emit('users-changed')
      toast(`${user.name} is now ${role === 'admin' ? 'an admin' : `a ${role}`}`)
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  const revoke = async (invite: Invite) => {
    try {
      await api(`/invites/${invite.id}`, { method: 'DELETE' })
      invites.reload()
      toast(`Revoked the invite for ${invite.email}`)
    } catch (err) {
      toast(toApiError(err).message, { kind: 'error' })
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p className="page-subtitle">{users.length} people in Acme Inc.</p>
        </div>
        {admin && (
          <button type="button" className="btn btn-primary" onClick={() => setParams({ invite: '1' })}>
            <Icon name="plus" size={16} />
            Invite member
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={15} />
          <input className="input input-sm" type="search" placeholder="Search people" aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-title-job">Job title</th>
              <th>Role</th>
              <th className="col-joined">Joined</th>
              {admin && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="person">
                    <Avatar user={u} size={30} />
                    <span className="person-text">
                      <span className="person-name">
                        {u.name}
                        {u.id === me.id && <span className="badge">You</span>}
                      </span>
                      <span className="muted">{u.email}</span>
                    </span>
                  </span>
                </td>
                <td className="col-title-job">{u.title || <span className="muted">Not set</span>}</td>
                <td>
                  {admin && u.id !== me.id ? (
                    <select className="select select-sm" aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => void changeRole(u, e.target.value as Role)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={u.role} />
                  )}
                </td>
                <td className="col-joined">{formatDate(isoDate(new Date(u.joinedAt)))}</td>
                {admin && (
                  <td className="col-actions">
                    {u.id !== me.id && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(u)}>
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={admin ? 5 : 4} className="muted">
                  No one matches "{query}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {admin && (
        <section className="panel invites" aria-labelledby="pending-invites">
          <div className="panel-head">
            <h2 id="pending-invites">Pending invites</h2>
          </div>
          {invites.data && invites.data.invites.length === 0 ? (
            <p className="muted">No pending invites.</p>
          ) : (
            <ul className="invite-list">
              {invites.data?.invites.map((inv) => (
                <li key={inv.id}>
                  <span className="invite-email">{inv.email}</span>
                  <RoleBadge role={inv.role} />
                  <span className="muted">Invited {relativeTime(inv.createdAt)}</span>
                  <span className="spacer" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void revoke(inv)}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {inviteOpen && (
        <InviteModal
          onClose={() => setParams({})}
          onInvited={(email) => {
            invites.reload()
            toast(`Invited ${email}`)
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message={<p>They lose access right away. Their issues stay, but become unassigned.</p>}
          confirmLabel="Remove member"
          danger
          onConfirm={async () => {
            await api(`/users/${removing.id}`, { method: 'DELETE' })
            emit('users-changed')
            emit('issues-changed')
            toast(`Removed ${removing.name}`)
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await api('/invites', { method: 'POST', body: { email, role } })
      onInvited(email.trim().toLowerCase())
      onClose()
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(Object.keys(apiErr.fields).length ? apiErr.fields : { email: apiErr.message })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Invite a member"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="invite-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </>
      }
    >
      <form id="invite-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="invite-email" error={errors.email}>
          <input id="invite-email" className="input" type="email" value={email} aria-invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <fieldset className="field">
          <legend>Role</legend>
          <div className="radio-cards">
            {ROLES.map((r) => (
              <label key={r} className={role === r ? 'radio-card is-selected' : 'radio-card'}>
                <input type="radio" name="invite-role" value={r} checked={role === r} onChange={() => setRole(r)} />
                <span className="radio-card-title">{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                <span className="radio-card-desc">{ROLE_HELP[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
