import type { Label, Status, StatusCategory, TemplateId } from '../shared/types.ts'

interface TemplateSpec {
  statuses: Array<[name: string, category: StatusCategory, wipLimit: number | null]>
  labels: Array<[name: string, color: string]>
}

export const TEMPLATES: Record<TemplateId, TemplateSpec> = {
  software: {
    statuses: [
      ['Backlog', 'backlog', null],
      ['Todo', 'unstarted', null],
      ['In Progress', 'started', 4],
      ['In Review', 'review', null],
      ['Done', 'done', null],
    ],
    labels: [
      ['Bug', '#c8372d'],
      ['Feature', '#2453d6'],
      ['Design', '#7c4dcc'],
      ['Tech debt', '#5b6577'],
      ['Accessibility', '#1d8a5a'],
    ],
  },
  marketing: {
    statuses: [
      ['Ideas', 'backlog', null],
      ['Planned', 'unstarted', null],
      ['In Progress', 'started', 3],
      ['Review', 'review', null],
      ['Published', 'done', null],
    ],
    labels: [
      ['Social', '#2453d6'],
      ['Email', '#b8860b'],
      ['Blog', '#1d8a5a'],
      ['Video', '#c8372d'],
      ['Paid', '#7c4dcc'],
    ],
  },
  blank: {
    statuses: [
      ['To do', 'unstarted', null],
      ['Doing', 'started', null],
      ['Done', 'done', null],
    ],
    labels: [['Important', '#c8372d']],
  },
}

export function buildStatuses(projectId: string, template: TemplateId): Status[] {
  return TEMPLATES[template].statuses.map(([name, category, wipLimit], i) => ({
    id: `${projectId}_s${i + 1}`,
    name,
    category,
    wipLimit,
  }))
}

export function buildLabels(projectId: string, template: TemplateId): Label[] {
  return TEMPLATES[template].labels.map(([name, color], i) => ({ id: `${projectId}_l${i + 1}`, name, color }))
}
