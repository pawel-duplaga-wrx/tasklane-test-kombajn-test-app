export type Role = 'admin' | 'member' | 'viewer'
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type StatusCategory = 'backlog' | 'unstarted' | 'started' | 'review' | 'done'
export type TemplateId = 'software' | 'marketing' | 'blank'
export type Theme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

export const ROLES: Role[] = ['admin', 'member', 'viewer']
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']
export const ESTIMATES = [1, 2, 3, 5, 8, 13]

export interface Preferences {
  theme: Theme
  density: Density
  notifyAssigned: boolean
  notifyComments: boolean
  weeklyDigest: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  title: string
  color: string
  avatarUrl: string | null
  joinedAt: string
  preferences: Preferences
}

export interface Status {
  id: string
  name: string
  category: StatusCategory
  wipLimit: number | null
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface ProjectStats {
  total: number
  done: number
  open: number
}

export interface Project {
  id: string
  key: string
  name: string
  description: string
  color: string
  template: TemplateId
  statuses: Status[]
  labels: Label[]
  memberIds: string[]
  leadId: string
  archived: boolean
  createdAt: string
  stats: ProjectStats
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Issue {
  id: string
  ref: string
  projectId: string
  projectKey: string
  number: number
  title: string
  description: string
  statusId: string
  priority: Priority
  assigneeId: string | null
  reporterId: string
  labelIds: string[]
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string | null
  estimate: number | null
  subtasks: Subtask[]
  order: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface Comment {
  id: string
  issueId: string
  authorId: string
  body: string
  createdAt: string
  editedAt: string | null
}

/** `text` has no subject; the UI shows the actor's name in front of it. */
export interface Activity {
  id: string
  issueRef: string | null
  projectKey: string
  actorId: string
  text: string
  createdAt: string
}

export interface Notification {
  id: string
  text: string
  issueRef: string | null
  projectKey: string | null
  read: boolean
  createdAt: string
}

export interface Invite {
  id: string
  email: string
  role: Role
  invitedById: string
  createdAt: string
}

export interface IssueDetail {
  issue: Issue
  project: Project
  comments: Comment[]
  activity: Activity[]
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardData {
  stats: {
    assignedOpen: number
    dueSoon: number
    overdue: number
    completedRecently: number
  }
  myIssues: Issue[]
  activity: Activity[]
  projects: Project[]
}

export interface SearchResults {
  projects: Project[]
  issues: Issue[]
}

export interface ApiErrorBody {
  error: string
  fields?: Record<string, string>
  retryAfter?: number
}

export interface Meta {
  name: string
  version: string
  flags: string[]
}
