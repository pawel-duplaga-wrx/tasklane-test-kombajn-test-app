import { describe, expect, it } from 'vitest'
import { lanePoints, orderAt } from '../src/board-logic.ts'
import { dueState, formatDate, initials, passwordStrength, relativeTime, shiftIsoDate, suggestKey } from '../src/format.ts'

describe('board logic', () => {
  it('sums lane points, and drops the last card with the planted bug', () => {
    const lane = [{ estimate: 3 }, { estimate: null }, { estimate: 5 }]
    expect(lanePoints(lane)).toBe(8)
    expect(lanePoints(lane, true)).toBe(3)
    expect(lanePoints([])).toBe(0)
  })

  it('places a dropped card between, before or after its neighbours', () => {
    const lane = [{ order: 1000 }, { order: 2000 }]
    expect(orderAt(lane, 0)).toBe(0)
    expect(orderAt(lane, 1)).toBe(1500)
    expect(orderAt(lane, 2)).toBe(3000)
    expect(orderAt([], 0)).toBe(1000)
  })
})

describe('format helpers', () => {
  const now = new Date(2026, 9, 14, 10, 0)

  it('suggests project keys from names', () => {
    expect(suggestKey('Website Redesign')).toBe('WR')
    expect(suggestKey('Q4 Launch Campaign')).toBe('QLC')
    expect(suggestKey('Billing')).toBe('BIL')
    expect(suggestKey('  ')).toBe('')
    expect(suggestKey('One Two Three Four Five Six')).toBe('OTTFF')
  })

  it('classifies due dates', () => {
    expect(dueState('2026-10-13', false, now)).toBe('overdue')
    expect(dueState('2026-10-13', true, now)).toBeNull()
    expect(dueState('2026-10-14', false, now)).toBe('today')
    expect(dueState('2026-10-16', false, now)).toBe('soon')
    expect(dueState('2026-10-30', false, now)).toBe('later')
    expect(dueState(null, false, now)).toBeNull()
  })

  it('formats dates and relative times', () => {
    expect(formatDate('2026-10-05', now)).toBe('Oct 5')
    expect(formatDate('2025-12-21', now)).toBe('Dec 21, 2025')
    expect(shiftIsoDate('2026-11-01', -1)).toBe('2026-10-31')
    expect(relativeTime(new Date(now.getTime() - 30_000).toISOString(), now)).toBe('just now')
    expect(relativeTime(new Date(now.getTime() - 5 * 3_600_000).toISOString(), now)).toBe('5 h ago')
    expect(relativeTime(new Date(now.getTime() - 30 * 3_600_000).toISOString(), now)).toBe('yesterday')
  })

  it('makes initials and rates passwords', () => {
    expect(initials('Ada Park')).toBe('AP')
    expect(initials('Cher')).toBe('C')
    expect(initials('Victor van der Lindqvist')).toBe('VL')
    expect(passwordStrength('')).toBeNull()
    expect(passwordStrength('abc')).toBe('weak')
    expect(passwordStrength('abcdefg1')).toBe('weak')
    expect(passwordStrength('Abcdefg1')).toBe('fair')
    expect(passwordStrength('Abcdefgh123!')).toBe('strong')
  })
})
