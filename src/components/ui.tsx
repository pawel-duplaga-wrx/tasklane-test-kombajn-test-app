import type { ReactNode } from 'react'
import type { Label, Priority, StatusCategory, User } from '../../shared/types.ts'
import type { ApiError } from '../api.ts'
import { dueState, formatDate, initials, PRIORITY_LABELS } from '../format.ts'
import { Icon } from './icons.tsx'

export function Spinner({ size = 18, label = 'Loading' }: { size?: number; label?: string }) {
  return <span className="spinner" style={{ width: size, height: size }} role="progressbar" aria-label={label} />
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size={28} label={label} />
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="empty-state error-state" role="alert">
      <h3>{error.status === 404 ? 'Not found' : "This didn't load"}</h3>
      <p>{error.message}</p>
      {onRetry && error.status !== 404 && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Skeleton({ width = '100%', height = 14 }: { width?: number | string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />
}

export function Avatar({ user, size = 24 }: { user: User | null | undefined; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  if (!user) {
    return (
      <span className="avatar avatar-empty" style={style} title="Unassigned" role="img" aria-label="Unassigned">
        <Icon name="user" size={Math.round(size * 0.6)} />
      </span>
    )
  }
  if (user.avatarUrl) {
    return <img className="avatar avatar-img" src={user.avatarUrl} alt={`${user.name}'s profile photo`} width={size} height={size} />
  }
  return (
    <span className="avatar" style={{ ...style, background: user.color }} title={user.name} role="img" aria-label={user.name}>
      {initials(user.name)}
    </span>
  )
}

export function AvatarStack({ users, max = 4, size = 24 }: { users: User[]; max?: number; size?: number }) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {rest > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
          +{rest}
        </span>
      )}
    </span>
  )
}

export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const label = PRIORITY_LABELS[priority]
  if (priority === 'urgent') {
    return (
      <svg className="priority priority-urgent" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label}>
        <title>{label}</title>
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4v5M8 11.5v.5" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  const bars = priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : 0
  return (
    <svg className={`priority priority-${priority}`} width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label}>
      <title>{label}</title>
      {[0, 1, 2].map((i) =>
        priority === 'none' ? (
          <rect key={i} x={2 + i * 4.5} y="7.25" width="3" height="1.5" rx="0.75" fill="currentColor" opacity="0.6" />
        ) : (
          <rect key={i} x={2 + i * 4.5} y={10 - i * 3.5} width="3" height={4 + i * 3.5} rx="1" fill="currentColor" opacity={i < bars ? 1 : 0.22} />
        ),
      )}
    </svg>
  )
}

export function StatusIcon({ category, size = 15 }: { category: StatusCategory; size?: number }) {
  const r = 6
  const c = 2 * Math.PI * r
  const fill = { backlog: 0, unstarted: 0, started: 0.5, review: 0.75, done: 1 }[category]
  return (
    <svg className={`status-icon status-${category}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={category === 'backlog' ? '2 2.2' : undefined} />
      {category === 'done' ? (
        <>
          <circle cx="8" cy="8" r={r} fill="currentColor" />
          <path d="m5.2 8.2 1.9 1.9 3.7-3.9" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        fill > 0 && (
          <circle
            cx="8"
            cy="8"
            r={r / 2}
            fill="none"
            stroke="currentColor"
            strokeWidth={r}
            strokeDasharray={`${(c / 2) * fill} ${c}`}
            transform="rotate(-90 8 8)"
          />
        )
      )}
    </svg>
  )
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="label-chip">
      <span className="label-dot" style={{ background: label.color }} />
      {label.name}
    </span>
  )
}

export function DueDate({ date, done }: { date: string | null; done: boolean }) {
  if (!date) return null
  const state = dueState(date, done)
  const title = state === 'overdue' ? `Overdue, was due ${formatDate(date)}` : state === 'today' ? 'Due today' : `Due ${formatDate(date)}`
  return (
    <span className={`due due-${state ?? 'done'}`} title={title}>
      <Icon name="calendar" size={13} />
      {state === 'today' ? 'Today' : formatDate(date)}
    </span>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={error ? 'field has-error' : 'field'}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  )
}

export function ProgressBar({ done, total, color }: { done: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% done`}>
      <span className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </span>
  )
}

export function RoleBadge({ role }: { role: User['role'] }) {
  return <span className={`badge badge-${role}`}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
}
