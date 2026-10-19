import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { toApiError, type ApiError } from './api.ts'

interface AsyncState<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
}

/** Runs `fn` when `deps` change. Keeps the old data while reloading so lists don't flash. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, loading: true })
  const [version, setVersion] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true }))
    fnRef.current(ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setState({ data, error: null, loading: false })
      },
      (err: unknown) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, error: toApiError(err), loading: false }))
      },
    )
    return () => ctrl.abort()
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((update: T | ((prev: T | undefined) => T | undefined)) => {
    setState((s) => ({ ...s, data: typeof update === 'function' ? (update as (p: T | undefined) => T | undefined)(s.data) : update }))
  }, [])
  return { ...state, reload, setData }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function useOutsideClick(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean): void {
  const handler = useRef(onOutside)
  handler.current = onOutside
  useEffect(() => {
    if (!active) return
    const listener = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler.current()
    }
    document.addEventListener('pointerdown', listener)
    return () => document.removeEventListener('pointerdown', listener)
  }, [ref, active])
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const listener = () => setMatches(mql.matches)
    listener()
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [query])
  return matches
}

export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} – Tasklane` : 'Tasklane'
  }, [title])
}

// Only the top-most layer (modal, drawer, menu) reacts to Escape.
const escapeStack: Array<{ current: () => void }> = []
let escapeListening = false

export function useEscape(onEscape: () => void, active = true): void {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    if (!active) return
    if (!escapeListening) {
      escapeListening = true
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && escapeStack.length > 0) {
          e.preventDefault()
          escapeStack[escapeStack.length - 1]!.current()
        }
      })
    }
    escapeStack.push(ref)
    return () => {
      const i = escapeStack.lastIndexOf(ref)
      if (i >= 0) escapeStack.splice(i, 1)
    }
  }, [active])
}
