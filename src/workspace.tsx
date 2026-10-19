import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Project, User } from '../shared/types.ts'
import { api } from './api.ts'
import { PageLoader } from './components/ui.tsx'
import { useEvent } from './events.ts'
import { hasBug } from './flags.ts'

interface WorkspaceValue {
  users: User[]
  userById: (id: string | null | undefined) => User | undefined
  /** Active projects, for the sidebar and pickers. */
  projects: Project[]
  ready: boolean
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace needs <WorkspaceProvider>')
  return value
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [ready, setReady] = useState(false)

  const loadUsers = useCallback(() => api<{ users: User[] }>('/users').then((r) => setUsers(r.users)), [])
  const loadProjects = useCallback(() => api<{ projects: Project[] }>('/projects').then((r) => setProjects(r.projects)), [])

  useEffect(() => {
    Promise.all([loadUsers(), loadProjects()])
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [loadUsers, loadProjects])

  useEvent('users-changed', () => void loadUsers().catch(() => undefined))
  useEvent('projects-changed', () => {
    // Planted bug: the sidebar keeps its first list until the page reloads.
    if (hasBug('sidebar-stale-projects')) return
    void loadProjects().catch(() => undefined)
  })

  const value = useMemo<WorkspaceValue>(() => {
    const map = new Map(users.map((u) => [u.id, u]))
    return { users, projects, ready, userById: (id) => (id ? map.get(id) : undefined) }
  }, [users, projects, ready])

  return <WorkspaceContext.Provider value={value}>{ready ? children : <PageLoader />}</WorkspaceContext.Provider>
}
