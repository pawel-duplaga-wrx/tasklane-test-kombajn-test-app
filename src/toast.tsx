import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon } from './components/icons.tsx'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface ToastOptions {
  kind?: ToastKind
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'duration'>> {
  id: number
  message: string
  action?: ToastOptions['action']
}

type ToastFn = (message: string, options?: ToastOptions) => void

const ToastContext = createContext<ToastFn>(() => {})

export function useToast(): ToastFn {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback<ToastFn>(
    (message, options = {}) => {
      const item: ToastItem = {
        id: nextId.current++,
        message,
        kind: options.kind ?? 'success',
        duration: options.duration ?? (options.action ? 6000 : 4000),
        action: options.action,
      }
      setItems((list) => [...list.slice(-3), item])
      setTimeout(() => dismiss(item.id), item.duration)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'info' ? 'info' : 'alert'} size={16} />
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="icon-btn toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
