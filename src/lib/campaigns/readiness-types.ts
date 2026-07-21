/**
 * Client-safe readiness types + constants. Kept OUT of readiness.ts (which is 'server-only') so the
 * /ready page can import GROUP_ORDER + the item shape without pulling the server data layer into the
 * client bundle.
 */
import type { CampaignExecution } from './view'

/** The section a need falls under, so the page groups by what it is (not input-vs-action). */
export type NeedGroup = 'Scheduling' | 'Access' | 'Shoot' | 'Content' | 'Info' | 'Links' | 'From you' | 'Anything else'
export const GROUP_ORDER: NeedGroup[] = ['Scheduling', 'Access', 'Shoot', 'Content', 'Info', 'Links', 'From you', 'Anything else']

export interface ReadinessItem {
  id: string
  kind: 'input' | 'action'
  /** Which section it renders under. */
  group: NeedGroup
  title: string
  why: string
  done: boolean
  optional?: boolean
  /** An action the owner can defer ("Skip for now") — e.g. connect an account, add brand details.
   *  Real in-campaign work (approve concepts / review pieces) is NOT skippable. */
  skippable?: boolean
  /** Execution field this action stamps when the owner marks it done themselves. Present only
   *  on self-serve actions, where the owner's word IS the completion signal. */
  markDoneField?: string
  /** True when the owner has deferred this action; it drops out of the required count but stays
   *  visible to undo. */
  skipped?: boolean
  // input — a CampaignExecution key, 'go_live', or an owner custom-ask id ('custom-…').
  field?: keyof CampaignExecution | 'go_live' | string
  inputType?: 'text' | 'textarea' | 'select' | 'date' | 'upload'
  /** For inputType 'select' — the choices (e.g. Yes / Ask first / No). */
  options?: string[]
  /** Where the value saves. Default 'execution'; 'target_date' for the go-live date. */
  saveTo?: 'execution' | 'target_date'
  placeholder?: string
  value?: string
  // action
  actionLabel?: string
  href?: string
}

export interface ReadinessReport {
  campaignName: string
  items: ReadinessItem[]
  done: number
  total: number   // required (non-optional) items
  /** setup already in place (Google connected, socials linked...) — kept out of the journey's setup
   *  band + the go-live estimate so the owner is never re-quoted work that's done. */
  doneSetupIds: string[]
  /** True when every live line is owner-run (producer 'diy'). No team is doing anything on
   *  this plan, so any copy promising one would be a plain lie. Computed server-side so the
   *  page never has to re-derive it from line items it does not have. */
  ownerRunOnly: boolean
}

/** In-campaign WORK actions (approve concepts / review pieces) — real owner to-dos, but not setup:
 *  the detail page narrates them as approvals, never under "Finish setup". */
export const WORK_ACTION_IDS = new Set(['concepts', 'review'])

/** The setup the owner still owes — what "Finish setup" means. Excludes optional nice-to-haves (they
 *  never block anything) and the work actions above. Matches the /ready page's required count, so the
 *  card, the timeline, and the setup page always agree. */
export function setupOwed(report: ReadinessReport | null): ReadinessItem[] {
  return (report?.items ?? []).filter((i) => !i.done && !i.skipped && !i.optional && !WORK_ACTION_IDS.has(i.id))
}
