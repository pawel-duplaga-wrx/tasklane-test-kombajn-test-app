import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, toApiError } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { BrandMark } from '../components/AppShell.tsx'
import { Icon } from '../components/icons.tsx'
import { Field } from '../components/ui.tsx'
import { passwordStrength } from '../format.ts'
import { useTitle } from '../hooks.ts'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-panel">
        <Link to="/login" className="brand auth-brand" aria-label="Tasklane">
          <BrandMark size={28} />
          <span>Tasklane</span>
        </Link>
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
        {footer && <p className="auth-footer">{footer}</p>}
      </div>
      <div className="auth-art" aria-hidden="true">
        <LaneArt />
        <p className="auth-art-caption">Issues, boards and releases for teams that ship every week.</p>
      </div>
    </div>
  )
}

function LaneArt() {
  const lanes = [
    { name: 'Todo', cards: [72, 54, 64] },
    { name: 'In Progress', cards: [60, 80] },
    { name: 'In Review', cards: [68] },
    { name: 'Done', cards: [58, 74, 50] },
  ]
  return (
    <div className="lane-art">
      {lanes.map((lane) => (
        <div key={lane.name} className="lane-art-lane">
          <span className="lane-art-name">{lane.name}</span>
          {lane.cards.map((w, i) => (
            <span key={i} className="lane-art-card">
              <span style={{ width: `${w}%` }} />
              <span style={{ width: `${w - 25}%` }} />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  invalid?: boolean
  describedBy?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="password-field">
      <input
        id={id}
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="icon-btn icon-btn-sm" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  )
}

export function LoginPage() {
  useTitle('Log in')
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockedFor, setLockedFor] = useState(0)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (lockedFor <= 0) return
    const id = setTimeout(() => setLockedFor((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [lockedFor])

  useEffect(() => {
    if (lockedFor === 0 && formError?.startsWith('Too many')) setFormError(null)
  }, [lockedFor, formError])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || lockedFor > 0) return
    const next: Record<string, string> = {}
    if (!email.trim()) next.email = 'Enter your email'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length > 0) {
      if (next.email) emailRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      await login(email.trim(), password, remember)
    } catch (err) {
      const apiErr = toApiError(err)
      if (apiErr.status === 429 && apiErr.retryAfter) setLockedFor(apiErr.retryAfter)
      setErrors(apiErr.fields)
      setFormError(apiErr.status === 429 ? 'Too many failed attempts.' : Object.keys(apiErr.fields).length ? null : apiErr.message)
      setPassword('')
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Log in to Tasklane"
      subtitle="Use your work email."
      footer={
        <>
          New to Tasklane? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className="form-grid" onSubmit={submit} noValidate>
        {formError && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>
              {formError}
              {lockedFor > 0 && ` Try again in ${lockedFor} s.`}
            </span>
          </div>
        )}
        <Field label="Email" htmlFor="login-email" error={errors.email}>
          <input
            ref={emailRef}
            id="login-email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <div className="field-with-link">
          <Field label="Password" htmlFor="login-password" error={errors.password}>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={!!errors.password}
              describedBy={errors.password ? 'login-password-error' : undefined}
            />
          </Field>
          <Link to="/forgot-password" className="field-link">
            Forgot password?
          </Link>
        </div>
        <label className="checkbox-inline">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Keep me logged in for 30 days
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || lockedFor > 0}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  useTitle('Create an account')
  const { signup } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [terms, setTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const strength = passwordStrength(password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Enter your full name'
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address'
    if (password.length < 8) next.password = 'Use at least 8 characters'
    else if (!/[a-z]/i.test(password) || !/\d/.test(password)) next.password = 'Use at least one letter and one number'
    if (confirm !== password) next.confirm = "Passwords don't match"
    if (!terms) next.terms = 'Accept the terms to continue'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      await signup(name.trim(), email.trim(), password)
    } catch (err) {
      const apiErr = toApiError(err)
      setErrors(Object.keys(apiErr.fields).length ? apiErr.fields : { form: apiErr.message })
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You'll join the Acme Inc workspace as a member."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="form-grid" onSubmit={submit} noValidate>
        {errors.form && (
          <div className="alert alert-error" role="alert">
            {errors.form}
          </div>
        )}
        <Field label="Full name" htmlFor="signup-name" error={errors.name}>
          <input id="signup-name" className="input" autoComplete="name" value={name} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Work email" htmlFor="signup-email" error={errors.email}>
          <input id="signup-email" className="input" type="email" autoComplete="email" value={email} aria-invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label="Password"
          htmlFor="signup-password"
          error={errors.password}
          hint={
            strength ? (
              <span className={`strength strength-${strength}`}>
                <span className="strength-bar" />
                Password strength: {strength}
              </span>
            ) : (
              'At least 8 characters, with a letter and a number.'
            )
          }
        >
          <PasswordInput id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={!!errors.password} />
        </Field>
        <Field label="Confirm password" htmlFor="signup-confirm" error={errors.confirm}>
          <PasswordInput id="signup-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={!!errors.confirm} />
        </Field>
        <div className={errors.terms ? 'field has-error' : 'field'}>
          <label className="checkbox-inline">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={!!errors.terms} />
            I agree to the Terms of Service and Privacy Policy
          </label>
          {errors.terms && <p className="field-error">{errors.terms}</p>}
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  useTitle('Reset your password')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api('/auth/forgot', { method: 'POST', body: { email: email.trim() } })
      setSentTo(email.trim())
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your inbox" footer={<Link to="/login">Back to log in</Link>}>
        <p className="auth-text">
          If an account exists for <strong>{sentTo}</strong>, we sent a link to reset the password. The link works for one hour.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter the email you use for Tasklane and we'll send you a reset link." footer={<Link to="/login">Back to log in</Link>}>
      <form className="form-grid" onSubmit={submit} noValidate>
        <Field label="Email" htmlFor="forgot-email" error={error ?? undefined}>
          <input id="forgot-email" className="input" type="email" autoComplete="email" value={email} aria-invalid={!!error} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  )
}
