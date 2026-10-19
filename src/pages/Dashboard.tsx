import { Link } from 'react-router'
import type { DashboardData, Issue, Project } from '../../shared/types.ts'
import { api } from '../api.ts'
import { useMe } from '../auth.tsx'
import { useShell } from '../components/AppShell.tsx'
import { Avatar, DueDate, EmptyState, ErrorState, PriorityIcon, ProgressBar, Skeleton, StatusIcon } from '../components/ui.tsx'
import { useEvent } from '../events.ts'
import { greeting, relativeTime } from '../format.ts'
import { useAsync, useTitle } from '../hooks.ts'
import { useWorkspace } from '../workspace.tsx'

export function DashboardPage() {
  useTitle('Dashboard')
  const me = useMe()
  const { data, error, reload } = useAsync((signal) => api<DashboardData>('/dashboard', { signal }), [])
  useEvent('issues-changed', reload)
  useEvent('projects-changed', reload)
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {greeting()}, {me.name.split(' ')[0]}
          </h1>
          <p className="page-subtitle">{today}</p>
        </div>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <section className="stats" aria-label="Your numbers">
            <Stat label="Open issues assigned to you" value={data?.stats.assignedOpen} to="/my-issues" />
            <Stat label="Due in the next 7 days" value={data?.stats.dueSoon} to="/my-issues" />
            <Stat label="Overdue" value={data?.stats.overdue} to="/my-issues" tone={data && data.stats.overdue > 0 ? 'danger' : undefined} />
            <Stat label="Completed in the last 7 days" value={data?.stats.completedRecently} to="/my-issues?tab=assigned" />
          </section>

          <div className="dash-grid">
            <section className="panel" aria-labelledby="dash-my-issues">
              <div className="panel-head">
                <h2 id="dash-my-issues">Your open issues</h2>
                <Link to="/my-issues" className="panel-link">
                  View all
                </Link>
              </div>
              {!data ? (
                <RowsSkeleton rows={5} />
              ) : data.myIssues.length === 0 ? (
                <EmptyState title="Nothing assigned to you">Pick something from a project board, or ask your lead what's next.</EmptyState>
              ) : (
                <IssueRows issues={data.myIssues} projects={data.projects} />
              )}
            </section>

            <div className="dash-side">
              <section className="panel" aria-labelledby="dash-projects">
                <div className="panel-head">
                  <h2 id="dash-projects">Projects</h2>
                  <Link to="/projects" className="panel-link">
                    All projects
                  </Link>
                </div>
                {!data ? (
                  <RowsSkeleton rows={3} />
                ) : (
                  <ul className="project-progress-list">
                    {data.projects.map((p) => (
                      <li key={p.id}>
                        <Link to={`/projects/${p.key}/board`} className="project-progress">
                          <span className="project-progress-name">
                            <span className="project-swatch" style={{ background: p.color }} />
                            {p.name}
                          </span>
                          <ProgressBar done={p.stats.done} total={p.stats.total} color={p.color} />
                          <span className="project-progress-count">
                            {p.stats.done} of {p.stats.total} done
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel" aria-labelledby="dash-activity">
                <div className="panel-head">
                  <h2 id="dash-activity">Recent activity</h2>
                </div>
                {!data ? <RowsSkeleton rows={6} /> : <ActivityFeed items={data.activity} />}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, to, tone }: { label: string; value: number | undefined; to: string; tone?: 'danger' }) {
  return (
    <Link to={to} className={tone ? `stat stat-${tone}` : 'stat'}>
      <span className="stat-value">{value ?? <Skeleton width={28} height={26} />}</span>
      <span className="stat-label">{label}</span>
    </Link>
  )
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rows-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={18} width={`${90 - (i % 3) * 15}%`} />
      ))}
    </div>
  )
}

export function IssueRows({ issues, projects }: { issues: Issue[]; projects: Project[] }) {
  const shell = useShell()
  const { userById } = useWorkspace()
  return (
    <ul className="issue-rows">
      {issues.map((issue) => {
        const project = projects.find((p) => p.id === issue.projectId)
        const status = project?.statuses.find((s) => s.id === issue.statusId)
        return (
          <li key={issue.id}>
            <button type="button" className="issue-row" onClick={() => shell.openIssue(issue.ref)}>
              <PriorityIcon priority={issue.priority} />
              <span className="issue-row-ref">{issue.ref}</span>
              {status && (
                <span className="issue-row-status" title={status.name}>
                  <StatusIcon category={status.category} />
                </span>
              )}
              <span className="issue-row-title">{issue.title}</span>
              <DueDate date={issue.dueDate} done={status?.category === 'done'} />
              <Avatar user={userById(issue.assigneeId)} size={22} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ActivityFeed({ items }: { items: DashboardData['activity'] }) {
  const { userById } = useWorkspace()
  const shell = useShell()
  if (items.length === 0) return <p className="muted">No activity yet.</p>
  return (
    <ul className="activity-list">
      {items.map((a) => {
        const actor = userById(a.actorId)
        return (
          <li key={a.id} className="activity-item">
            <Avatar user={actor} size={22} />
            <span>
              <strong>{actor?.name ?? 'A former member'}</strong>{' '}
              {a.issueRef && a.text.includes(a.issueRef) ? (
                <>
                  {a.text.slice(0, a.text.indexOf(a.issueRef))}
                  <button type="button" className="link-btn" onClick={() => shell.openIssue(a.issueRef!)}>
                    {a.issueRef}
                  </button>
                  {a.text.slice(a.text.indexOf(a.issueRef) + a.issueRef.length)}
                </>
              ) : (
                a.text
              )}
            </span>
            <time dateTime={a.createdAt}>{relativeTime(a.createdAt)}</time>
          </li>
        )
      })}
    </ul>
  )
}
