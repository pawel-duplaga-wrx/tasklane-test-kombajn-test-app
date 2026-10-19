import { Link } from 'react-router'
import { EmptyState } from '../components/ui.tsx'
import { useTitle } from '../hooks.ts'

export function NotFoundPage() {
  useTitle('Page not found')
  return (
    <div className="page">
      <EmptyState
        title="Page not found"
        action={
          <Link to="/" className="btn btn-primary">
            Go to the dashboard
          </Link>
        }
      >
        The address may be mistyped, or the page was moved.
      </EmptyState>
    </div>
  )
}
