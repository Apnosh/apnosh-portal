/**
 * "When you'll have it" timeline steps for a campaign, ported from apnosh-campaign.jsx
 * (configTimeline) so the admin preview matches the live product page. Returns steps with a
 * day offset (whenDays) rather than a formatted date, so the caller formats "by around
 * <date>" at render time with the viewer's locale. CLIENT-SAFE: pure data + catalog reads.
 */
import { SERVICE_TURNAROUND, etaLabelFor } from './service-turnaround'
import { serviceById, plainNameOf } from '../catalog'

export interface TimelineStep {
  text: string
  /** Business days from approval; the caller renders "by around <today + whenDays>". */
  whenDays?: number
  sub?: string
}

/** The done-for-you timeline. `itemId` picks the gbp special-case; otherwise the steps derive
 *  from the picked services' real turnarounds as a critical PATH (max, never a sum). */
export function campaignTimelineSteps(itemId: string | null, serviceIds: string[]): TimelineStep[] {
  const steps: TimelineStep[] = []

  if (itemId === 'gbp') {
    const t = SERVICE_TURNAROUND['gbp-setup']
    const workMax = t && t.class === 'setup' ? t.business.max : 7
    steps.push({ text: 'Most of your profile is fixed', whenDays: workMax, sub: `About ${etaLabelFor('gbp-setup')} after you approve.` })
    if (t && t.class === 'setup' && t.gate?.addDays) {
      steps.push({ text: 'Fully live, once Google finishes checking', whenDays: workMax + t.gate.addDays.max, sub: t.gate.note })
    }
    return steps
  }

  let workMax = 0
  let gate: { addDays: { min: number; max: number }; note: string } | null = null
  const recurring: string[] = []
  for (const id of serviceIds) {
    const t = SERVICE_TURNAROUND[id]
    if (!t) continue
    if (t.class === 'setup') {
      workMax = Math.max(workMax, t.business.max)
      if (t.gate?.addDays && (!gate || t.gate.addDays.max > gate.addDays.max)) gate = t.gate
    } else if (t.class === 'creative') {
      workMax = Math.max(workMax, t.business.max)
    } else if (t.class === 'recurring') {
      recurring.push(id)
    }
  }
  if (workMax > 0) {
    steps.push({ text: 'The work is done', whenDays: workMax, sub: 'After you approve.' })
    if (gate) steps.push({ text: 'Fully live', whenDays: workMax + gate.addDays.max, sub: gate.note })
  }
  for (const id of recurring) {
    const s = serviceById(id)
    const t = SERVICE_TURNAROUND[id]
    if (s && t && t.class === 'recurring') steps.push({ text: `${plainNameOf(s)} starts within ${t.startsWithin.min} to ${t.startsWithin.max} days, then keeps running.` })
  }
  if (!steps.length) steps.push({ text: 'About 1 to 2 weeks after you approve.' })
  return steps
}
