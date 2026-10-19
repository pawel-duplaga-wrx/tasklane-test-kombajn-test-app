import { useEffect, useRef } from 'react'

export type AppEvent = 'issues-changed' | 'projects-changed' | 'users-changed' | 'notifications-changed' | 'session-expired'

const bus = new EventTarget()

export function emit(name: AppEvent): void {
  bus.dispatchEvent(new Event(name))
}

export function useEvent(name: AppEvent, handler: () => void): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = () => ref.current()
    bus.addEventListener(name, listener)
    return () => bus.removeEventListener(name, listener)
  }, [name])
}
