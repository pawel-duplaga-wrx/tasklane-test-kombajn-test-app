import { Navigate, Route, Routes } from 'react-router'
import { AuthProvider } from './auth.tsx'
import { PublicOnly, RequireAuth, ThemeSync } from './components/AppShell.tsx'
import { ForgotPasswordPage, LoginPage, SignupPage } from './pages/auth.tsx'
import { BoardPage } from './pages/Board.tsx'
import { DashboardPage } from './pages/Dashboard.tsx'
import { ListPage } from './pages/ListView.tsx'
import { MyIssuesPage } from './pages/MyIssues.tsx'
import { NotFoundPage } from './pages/NotFound.tsx'
import { ProjectLayout } from './pages/ProjectLayout.tsx'
import { ProjectsPage } from './pages/Projects.tsx'
import { ProjectSettingsPage } from './pages/ProjectSettings.tsx'
import { AccountSettings, PreferenceSettings, ProfileSettings, SettingsPage } from './pages/Settings.tsx'
import { TeamPage } from './pages/Team.tsx'
import { ToastProvider } from './toast.tsx'

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ThemeSync />
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />
            <Route path="my-issues" element={<MyIssuesPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:key" element={<ProjectLayout />}>
              <Route index element={<Navigate to="board" replace />} />
              <Route path="board" element={<BoardPage />} />
              <Route path="list" element={<ListPage />} />
              <Route path="settings" element={<ProjectSettingsPage />} />
            </Route>
            <Route path="team" element={<TeamPage />} />
            <Route path="settings" element={<SettingsPage />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<ProfileSettings />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="preferences" element={<PreferenceSettings />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}
