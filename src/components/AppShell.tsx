import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { Notification } from '../../shared/types.ts'
import { api } from '../api.ts'
import { canEdit, useAuth, useMe } from '../auth.tsx'
import { emit, useEvent } from '../events.ts'
import { hasBug } from '../flags.ts'
import { relativeTime } from '../format.ts'
import { useEscape, useMediaQuery, useOutsideClick } from '../hooks.ts'
import { useToast } from '../toast.tsx'
import { useWorkspace, WorkspaceProvider } from '../workspace.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { Icon } from './icons.tsx'
import { IssueDrawer } from './IssueDrawer.tsx'
import { Menu } from './Menu.tsx'
import { NewIssueModal, type NewIssueDefaults } from './NewIssueModal.tsx'
import { NewProjectWizard } from './NewProjectWizard.tsx'
import { Avatar, PageLoader, Spinner } from './ui.tsx'

interface ShellValue {
  openIssue: (ref: string) => void
  openNewIssue: (defaults?: NewIssueDefaults) => void
  openNewProject: () => void
  openPalette: () => void
}

const ShellContext = createContext<ShellValue | null>(null)

export function useShell(): ShellValue {
  const value = useContext(ShellContext)
  if (!value) throw new Error('useShell needs <AppShell>')
  return value
}

/** Can this user create issues? Viewers can't, unless the planted permission bug is on. */
export function useCanCreateIssue(): boolean {
  const me = useMe()
  return canEdit(me) || hasBug('viewer-can-create')
}

function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function RequireAuth() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <PageLoader />
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  )
}

export function PublicOnly() {
  const { user, ready } = useAuth()
  const [params] = useSearchParams()
  if (!ready) return <PageLoader />
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}

export function ThemeSync() {
  const { user } = useAuth()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const theme = user?.preferences.theme ?? 'light'
  const density = user?.preferences.density ?? 'comfortable'
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
    root.dataset.density = density
  }, [theme, density, systemDark])
  return null
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [navOpen, setNavOpen] = useState(false)
  const [newIssue, setNewIssue] = useState<NewIssueDefaults | null>(null)
  const [newProject, setNewProject] = useState(false)
  const [palette, setPalette] = useState(false)
  const issueRef = params.get('issue')

  useEffect(() => setNavOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openIssue = useCallback(
    (ref: string) => {
      const next = new URLSearchParams(location.search)
      next.set('issue', ref)
      navigate({ pathname: location.pathname, search: `?${next}` })
    },
    [location, navigate],
  )

  const closeIssue = useCallback(() => {
    const next = new URLSearchParams(location.search)
    next.delete('issue')
    const search = next.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' })
  }, [location, navigate])

  const shell = useMemo<ShellValue>(
    () => ({
      openIssue,
      openNewIssue: (defaults = {}) => setNewIssue(defaults),
      openNewProject: () => setNewProject(true),
      openPalette: () => setPalette(true),
    }),
    [openIssue],
  )

  return (
    <ShellContext.Provider value={shell}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="main">
          <Topbar onMenu={() => setNavOpen(true)} />
          <main className="content" id="main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
      {issueRef && <IssueDrawer key={issueRef} issueRef={issueRef} onClose={closeIssue} />}
      {newIssue && <NewIssueModal defaults={newIssue} onClose={() => setNewIssue(null)} />}
      {newProject && <NewProjectWizard onClose={() => setNewProject(false)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </ShellContext.Provider>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe()
  const { projects } = useWorkspace()
  const compact = useMediaQuery('(max-width: 900px)')
  useEscape(onClose, open && compact)

  return (
    <>
      {open && compact && <div className="sidebar-backdrop" onClick={onClose} />}
      <nav className={open ? 'sidebar is-open' : 'sidebar'} aria-label="Main">
        <div className="sidebar-brand">
          <Link to="/" className="brand" aria-label="Tasklane home">
            <BrandMark />
            <span>Tasklane</span>
          </Link>
          {compact && (
            <button type="button" className="icon-btn" aria-label="Close menu" onClick={onClose}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="workspace-name">Acme Inc</div>
        <ul className="nav-list">
          <NavItem to="/" icon="home" label="Dashboard" end />
          <NavItem to="/my-issues" icon="inbox" label="My issues" />
          <NavItem to="/projects" icon="folder" label="Projects" />
          <NavItem to="/team" icon="users" label="Team" />
          <NavItem to="/settings" icon="settings" label="Settings" />
        </ul>
        <div className="nav-section">
          <span className="nav-section-title" id="sidebar-projects">
            Your projects
          </span>
          <ul className="nav-list" aria-labelledby="sidebar-projects">
            {projects.map((p) => (
              <li key={p.id}>
                <NavLink to={`/projects/${p.key}`} className="nav-link nav-project">
                  <span className="project-swatch" style={{ background: p.color }} />
                  <span className="nav-label">{p.name}</span>
                </NavLink>
              </li>
            ))}
            {projects.length === 0 && <li className="nav-empty">No active projects</li>}
          </ul>
        </div>
        {me.role === 'admin' && (
          <Link to="/team?invite=1" className="sidebar-invite">
            <Icon name="plus" size={15} />
            Invite people
          </Link>
        )}
      </nav>
    </>
  )
}

function NavItem({ to, icon, label, end }: { to: string; icon: 'home' | 'inbox' | 'folder' | 'users' | 'settings'; label: string; end?: boolean }) {
  return (
    <li>
      <NavLink to={to} end={end} className="nav-link">
        <Icon name={icon} size={17} />
        <span className="nav-label">{label}</span>
      </NavLink>
    </li>
  )
}

export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      <rect x="7" y="7" width="4" height="18" rx="2" fill="#fff" />
      <rect x="14" y="7" width="4" height="12" rx="2" fill="#fff" />
      <rect x="21" y="7" width="4" height="8" rx="2" fill="var(--signal)" />
    </svg>
  )
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const me = useMe()
  const { logout, setUser } = useAuth()
  const shell = useShell()
  const navigate = useNavigate()
  const toast = useToast()
  const canCreate = useCanCreateIssue()
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const dark = me.preferences.theme === 'dark' || (me.preferences.theme === 'system' && systemDark)

  const toggleTheme = async () => {
    try {
      const res = await api<{ user: typeof me }>('/me/preferences', { method: 'PATCH', body: { theme: dark ? 'light' : 'dark' } })
      setUser(res.user)
    } catch {
      toast("Couldn't change the theme. Try again.", { kind: 'error' })
    }
  }

  return (
    <header className="topbar">
      <button type="button" className="icon-btn topbar-menu" aria-label="Open menu" onClick={onMenu}>
        <Icon name="menu" />
      </button>
      <button type="button" className="search-trigger" onClick={shell.openPalette}>
        <Icon name="search" size={16} />
        <span className="search-trigger-text">Search or jump to</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        {canCreate && (
          <button type="button" className="btn btn-primary btn-sm topbar-new" onClick={() => shell.openNewIssue()}>
            <Icon name="plus" size={15} />
            <span>New issue</span>
          </button>
        )}
        <NotificationsButton />
        <Menu
          label="Account menu"
          className="avatar-btn"
          button={<Avatar user={me} size={28} />}
          items={[
            { label: 'Profile', icon: <Icon name="user" size={15} />, onSelect: () => navigate('/settings/profile') },
            { label: 'Settings', icon: <Icon name="settings" size={15} />, onSelect: () => navigate('/settings') },
            { label: dark ? 'Light theme' : 'Dark theme', icon: <Icon name={dark ? 'sun' : 'moon'} size={15} />, onSelect: () => void toggleTheme() },
            {
              label: 'Log out',
              icon: <Icon name="logout" size={15} />,
              onSelect: () => {
                void logout().then(() => navigate('/login'))
              },
            },
          ]}
        />
      </div>
    </header>
  )
}

function NotificationsButton() {
  const shell = useShell()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[] | null>(null)
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClick(ref, () => setOpen(false), open)
  useEscape(() => setOpen(false), open)

  const load = useCallback(() => {
    api<{ items: Notification[]; unread: number }>('/notifications')
      .then((res) => {
        setItems(res.items)
        setUnread(res.unread)
      })
      .catch(() => undefined)
  }, [])

  useEffect(load, [load])
  useEvent('notifications-changed', load)

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined)
    emit('notifications-changed')
  }

  const openItem = async (n: Notification) => {
    setOpen(false)
    if (!n.read) {
      await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined)
      emit('notifications-changed')
    }
    if (n.issueRef) shell.openIssue(n.issueRef)
  }

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="icon-btn notif-btn"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) load()
        }}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {open && (
        <div className="popover notif-popover" role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <h2>Notifications</h2>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}>
                Mark all as read
              </button>
            )}
          </div>
          {items === null ? (
            <div className="notif-loading">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="notif-empty">You're all caught up.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.read ? 'notif-item' : 'notif-item is-unread'} onClick={() => void openItem(n)}>
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text">{n.text}</span>
                    <span className="notif-time">{relativeTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
