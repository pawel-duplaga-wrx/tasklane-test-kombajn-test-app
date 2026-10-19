import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Project } from '../../shared/types.ts'
import { api, toApiError } from '../api.ts'
import { canEdit, useMe } from '../auth.tsx'
import { useShell } from '../components/AppShell.tsx'
import { Icon } from '../components/icons.tsx'
import { Menu } from '../components/Menu.tsx'
import { ConfirmDialog } from '../components/Modal.tsx'
import { AvatarStack, EmptyState, ErrorState, PageLoader, ProgressBar } from '../components/ui.tsx'
import { emit, useEvent } from '../events.ts'
import { useAsync, useTitle } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace } from '../workspace.tsx'

type Filter = 'active' | 'archived' | 'all'

export function ProjectsPage() {
  useTitle('Projects')
  const me = useMe()
  const shell = useShell()
  const [params, setParams] = useSearchParams()
  const filter = (['active', 'archived', 'all'].includes(params.get('filter') ?? '') ? params.get('filter') : 'active') as Filter
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('tasklane.projectsView') === 'list' ? 'list' : 'grid'))
  const { data, error, reload } = useAsync((signal) => api<{ projects: Project[] }>(`/projects?filter=${filter}`, { signal }), [filter])
  useEvent('projects-changed', reload)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
  }, [data, query])

  const changeView = (next: 'grid' | 'list') => {
    setView(next)
    localStorage.setItem('tasklane.projectsView', next)
  }

  return (
    <div className="page projects-page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Every project in Acme Inc.</p>
        </div>
        {canEdit(me) && (
          <button type="button" className="btn btn-primary" onClick={shell.openNewProject}>
            <Icon name="plus" size={16} />
            New project
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={15} />
          <input className="input input-sm" type="search" placeholder="Search projects" aria-label="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="segmented" role="radiogroup" aria-label="Show">
          {(['active', 'archived', 'all'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} className="segment" onClick={() => setParams(f === 'active' ? {} : { filter: f })}>
              {f === 'active' ? 'Active' : f === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div className="segmented" role="radiogroup" aria-label="Layout">
          <button type="button" role="radio" aria-checked={view === 'grid'} className="segment" aria-label="Grid" onClick={() => changeView('grid')}>
            <Icon name="board" size={15} />
          </button>
          <button type="button" role="radio" aria-checked={view === 'list'} className="segment" aria-label="List" onClick={() => changeView('list')}>
            <Icon name="list" size={15} />
          </button>
        </div>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageLoader />
      ) : shown.length === 0 ? (
        query ? (
          <EmptyState
            title={`No projects match "${query}"`}
            action={
              <button type="button" className="btn" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        ) : filter === 'archived' ? (
          <EmptyState title="No archived projects">Archived projects show up here. You can unarchive them at any time.</EmptyState>
        ) : (
          <EmptyState
            title="No projects yet"
            action={
              canEdit(me) && (
                <button type="button" className="btn btn-primary" onClick={shell.openNewProject}>
                  Create a project
                </button>
              )
            }
          >
            Projects hold your issues and boards.
          </EmptyState>
        )
      ) : (
        <ul className={view === 'grid' ? 'project-grid' : 'project-list'}>
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const { users, userById } = useWorkspace()
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const members = users.filter((u) => project.memberIds.includes(u.id))
  const lead = userById(project.leadId)
  const admin = me.role === 'admin'

  const setArchived = async (archived: boolean) => {
    await api(`/projects/${project.key}`, { method: 'PATCH', body: { archived } })
    emit('projects-changed')
    toast(archived ? `Archived ${project.name}` : `Unarchived ${project.name}`)
  }

  return (
    <li className={project.archived ? 'project-card is-archived' : 'project-card'}>
      <span className="project-card-bar" style={{ background: project.color }} />
      <div className="project-card-head">
        <Link to={`/projects/${project.key}/board`} className="project-card-title">
          {project.name}
        </Link>
        <span className="project-key">{project.key}</span>
        {project.archived && <span className="badge">Archived</span>}
        <span className="spacer" />
        <Menu
          label={`Actions for ${project.name}`}
          button={<Icon name="more" />}
          items={[
            { label: 'Open board', icon: <Icon name="board" size={15} />, onSelect: () => navigate(`/projects/${project.key}/board`) },
            { label: 'Project settings', icon: <Icon name="settings" size={15} />, onSelect: () => navigate(`/projects/${project.key}/settings`) },
            {
              label: project.archived ? 'Unarchive' : 'Archive',
              icon: <Icon name="archive" size={15} />,
              hidden: !admin,
              onSelect: () => {
                if (project.archived) void setArchived(false).catch((err: unknown) => toast(toApiError(err).message, { kind: 'error' }))
                else setConfirm('archive')
              },
            },
            { label: 'Delete project', icon: <Icon name="trash" size={15} />, danger: true, hidden: !admin, onSelect: () => setConfirm('delete') },
          ]}
        />
      </div>
      <p className="project-card-desc">{project.description || <span className="muted">No description</span>}</p>
      <div className="project-card-progress">
        <ProgressBar done={project.stats.done} total={project.stats.total} color={project.color} />
        <span>
          {project.stats.done} of {project.stats.total} done
        </span>
      </div>
      <div className="project-card-foot">
        <AvatarStack users={members} max={4} size={24} />
        <span className="muted">Lead: {lead?.name ?? 'None'}</span>
      </div>
      {confirm === 'archive' && (
        <ConfirmDialog
          title={`Archive ${project.name}?`}
          message={<p>The board becomes read-only and the project leaves the sidebar. You can unarchive it later.</p>}
          confirmLabel="Archive project"
          onConfirm={() => setArchived(true)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          title={`Delete ${project.name}?`}
          message={<p>This deletes the project and all {project.stats.total} of its issues. You can't undo this.</p>}
          confirmLabel="Delete project"
          danger
          requireText={project.key}
          onConfirm={async () => {
            await api(`/projects/${project.key}`, { method: 'DELETE' })
            emit('projects-changed')
            toast(`Deleted ${project.name}`)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </li>
  )
}
