/**
 * The words for how long a team line takes, from the turnaround table the campaign builder
 * already keeps (service-turnaround.ts). A "with the team" line that says nothing about time is
 * a promise with no shape; this gives each one the shape we actually work to.
 */
import { SERVICE_TURNAROUND } from '@/lib/campaigns/data/service-turnaround'

/** plan line key → the service whose clock it runs on */
const KEY_TO_SERVICE: Record<string, string> = {
  graphic: 'graphic', video: 'video-single', shoot: 'photo-library', nextshoot: 'photo-library',
  menus: 'site-menu', ordering: 'ordering-setup', pos: 'ordering-setup', email: 'email-found',
  print: 'capture-kit', fbevent: 'fb-event', sitepage: 'landing-page', banner: 'landing-page', website: 'landing-page',
  creators: 'creator-collab', gattr: 'channel-connect', ghours: 'channel-connect',
}

export function turnaroundWords(key: string): string | null {
  const id = KEY_TO_SERVICE[key]
  if (!id) return null
  const t = SERVICE_TURNAROUND[id]
  if (!t) return null
  const range = t.class === 'recurring' ? t.startsWithin : t.business
  if (!range) return null
  const days = range.min === range.max ? `${range.min}` : `${range.min} to ${range.max}`
  const shoot = t.class === 'creative' && t.needsShoot ? ', after the shoot day' : ''
  const gate = t.class === 'setup' && t.gate?.kind === 'print' ? ', plus printing and shipping' : ''
  return `Usually ${days} business days${shoot}${gate}`
}

/** append the words to every line the team holds, once */
export function withTurnaround<L extends { key: string; status: string; detail: string }>(plan: L[]): L[] {
  return plan.map((l) => {
    if (l.status !== 'with_team') return l
    const w = turnaroundWords(l.key)
    if (!w || l.detail.includes('business days')) return l
    return { ...l, detail: `${l.detail}. ${w}` }
  })
}
