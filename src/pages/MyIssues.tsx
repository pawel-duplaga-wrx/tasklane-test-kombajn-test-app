import { useSearchParams } from 'react-router'
import type { Issue, Project, StatusCategory } from '../../shared/types.ts'
import { api } from '../api.ts'
import { EmptyState, ErrorState, PageLoader } from '../components/ui.tsx'
import { useEvent } from '../events.ts'
import { useAsync, useTitle } from '../hooks.ts'
import { IssueRows } from './Dashboard.tsx'

const GROUPS: Array<{ title: string; categories: StatusCategory[] }> = [
  { title: 'In progress', categories: ['started', 'review'] },
  { title: 'To do', categories: ['unstarted', 'backlog'] },
  { title: 'Done', categories: ['done'] },
]

export function MyIssuesPage() {
  useTitle('My issues')
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'created' ? 'created' : 'assigned'
  const { data, error, reload } = useAsync((signal) => api<{ issues: Issue[]; projects: Project[] }>(`/my-issues?tab=${tab}`, { signal }), [tab])
  useEvent('issues-changed', reload)

  const categoryOf = (issue: Issue) => data?.projects.find((p) => p.id === issue.projectId)?.statuses.find((s) => s.id === issue.statusId)?.category

  return (
    <div className="page">
      <div className="page-header">
        <h1>My issues</h1>
      </div>
      <div className="tabs" role="tablist" aria-label="Which issues">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'assigned'} onClick={() => setParams({})}>
          Assigned to me
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'created'} onClick={() => setParams({ tab: 'created' })}>
          Created by me
        </button>
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <PageLoader />
      ) : data.issues.length === 0 ? (
        <EmptyState title={tab === 'assigned' ? 'Nothing assigned to you' : "You haven't created any issues"}>
          {tab === 'assigned' ? 'When someone assigns you an issue, it shows up here.' : 'Issues you create in any project show up here.'}
        </EmptyState>
      ) : (
        GROUPS.map((group) => {
          const issues = data.issues.filter((i) => group.categories.includes(categoryOf(i) ?? 'backlog'))
          if (issues.length === 0) return null
          const content = <IssueRows issues={issues} projects={data.projects} />
          return group.title === 'Done' ? (
            <details key={group.title} className="issue-group">
              <summary>
                <h2>{group.title}</h2>
                <span className="count">{issues.length}</span>
              </summary>
              {content}
            </details>
          ) : (
            <section key={group.title} className="issue-group" aria-label={group.title}>
              <div className="issue-group-head">
                <h2>{group.title}</h2>
                <span className="count">{issues.length}</span>
              </div>
              {content}
            </section>
          )
        })
      )}
    </div>
  )
}
