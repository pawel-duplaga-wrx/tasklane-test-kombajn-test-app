import type { Issue } from '../shared/types.ts'

/** Sum of estimates shown in a lane header. */
export function lanePoints(issues: Pick<Issue, 'estimate'>[], offByOne = false): number {
  // Planted bug: the last card in the lane is left out.
  const counted = offByOne ? issues.slice(0, -1) : issues
  return counted.reduce((sum, i) => sum + (i.estimate ?? 0), 0)
}

/** Order value for a card dropped at `index` among `lane` (which excludes the dragged card). */
export function orderAt(lane: Pick<Issue, 'order'>[], index: number): number {
  const before = lane[index - 1]
  const after = lane[index]
  if (before && after) return (before.order + after.order) / 2
  if (before) return before.order + 1000
  if (after) return after.order - 1000
  return 1000
}
