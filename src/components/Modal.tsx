import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toApiError } from '../api.ts'
import { useEscape } from '../hooks.ts'
import { Icon } from './icons.tsx'

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  className,
  initialFocus = 'first-field',
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  initialFocus?: 'first-field' | 'dialog'
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEscape(onClose)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const field = initialFocus === 'first-field' ? root?.querySelector<HTMLElement>('.modal-body input, .modal-body textarea, .modal-body select') : null
    ;(field ?? root)?.focus()
    return () => previous?.focus?.()
  }, [initialFocus])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        className={`modal modal-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  requireText,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  /** The user must type this exactly before confirming. */
  requireText?: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const blocked = requireText !== undefined && typed.trim() !== requireText

  const confirm = async () => {
    if (blocked || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      initialFocus={requireText ? 'first-field' : 'dialog'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={blocked || busy} onClick={confirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
      {requireText !== undefined && (
        <div className="field">
          <label htmlFor={inputId}>
            Type <strong>{requireText}</strong> to confirm
          </label>
          <input
            id={inputId}
            className="input"
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void confirm()
            }}
          />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
