import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '../shared/types.ts'
import { api } from './api.ts'
import { useEvent } from './events.ts'
import { useToast } from './toast.tsx'

interface AuthContextValue {
  user: User | null
  ready: boolean
  login: (email: string, password: string, remember: boolean) => Promise<User>
  signup: (name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth needs <AuthProvider>')
  return value
}

/** The signed-in user. Only use inside the logged-in part of the app. */
export function useMe(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useMe needs a signed-in user')
  return user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  useEvent('session-expired', () => {
    if (!user) return
    setUser(null)
    toast('Your session has ended. Log in again.', { kind: 'info' })
  })

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const res = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password, remember } })
    setUser(res.user)
    return res.user
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const res = await api<{ user: User }>('/auth/signup', { method: 'POST', body: { name, email, password } })
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, login, signup, logout, setUser }), [user, ready, login, signup, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function canEdit(user: User): boolean {
  return user.role !== 'viewer'
}
