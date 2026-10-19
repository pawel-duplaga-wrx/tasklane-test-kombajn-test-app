import { NavLink, Outlet, useOutletContext, useParams } from 'react-router'
import type { Project } from '../../shared/types.ts'
import { api } from '../api.ts'
import { useCanCreateIssue, useShell } from '../components/AppShell.tsx'
import { Icon } from '../components/icons.tsx'
import { AvatarStack, ErrorState, PageLoader } from '../components/ui.tsx'
import { useEvent } from '../events.ts'
import { useAsync, useTitle } from '../hooks.ts'
import { useWorkspace } from '../workspace.tsx'

interface ProjectContext {
  project: Project
  reloadProject: () => void
}

export function useProject(): ProjectContext {
  return useOutletContext<ProjectContext>()
}

export function ProjectLayout() {
  const { key = '' } = useParams()
  const shell = useShell()
  const canCreate = useCanCreateIssue()
  const { users } = useWorkspace()
  const { data, error, reload } = useAsync((signal) => api<{ project: Project }>(`/projects/${encodeURIComponent(key)}`, { signal }), [key])
  useEvent('projects-changed', reload)
  useEvent('issues-changed', reload)
  const project = data?.project.key === key.toUpperCase() ? data.project : undefined
  useTitle(project?.name ?? 'Project')

  if (error && !project) {
    return (
      <div className="page">
        <ErrorState error={error.status === 404 ? Object.assign(error, { message: `There's no project with the key ${key.toUpperCase()}.` }) : error} onRetry={reload} />
      </div>
    )
  }
  if (!project) return <PageLoader />

  const members = users.filter((u) => project.memberIds.includes(u.id))
  return (
    <div className="project-page">
      <div className="project-header">
        <div className="project-title-row">
          <span className="project-swatch project-swatch-lg" style={{ background: project.color }} />
          <h1>{project.name}</h1>
          <span className="project-key">{project.key}</span>
          {project.archived && <span className="badge">Archived</span>}
          <span className="spacer" />
          <AvatarStack users={members} max={5} size={26} />
          {canCreate && !project.archived && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shell.openNewIssue({ projectKey: project.key })}>
              <Icon name="plus" size={15} />
              New issue
            </button>
          )}
        </div>
        {project.archived && <p className="banner">This project is archived. Its board is read-only.</p>}
        <nav className="tabs project-tabs" aria-label="Project views">
          <NavLink to="board" className="tab">
            <Icon name="board" size={15} />
            Board
          </NavLink>
          <NavLink to="list" className="tab">
            <Icon name="list" size={15} />
            List
          </NavLink>
          <NavLink to="settings" className="tab">
            <Icon name="settings" size={15} />
            Settings
          </NavLink>
        </nav>
      </div>
      <Outlet context={{ project, reloadProject: reload } satisfies ProjectContext} />
    </div>
  )
}
