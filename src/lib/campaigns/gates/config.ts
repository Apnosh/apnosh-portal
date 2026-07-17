/**
 * Checkout Gates — per-campaign gate CONFIG (Phase 4a). Generalizes the gate machinery beyond the
 * auto shoot booking: an admin can, per campaign, turn the shoot gate off/required/optional AND add
 * their own pre-checkout AGREEMENT gates (must acknowledge) and INPUT gates (must answer). Stored in
 * catalog_content_overrides.gates (built-ins) / catalog_campaigns.gates (DB campaigns). Pure +
 * client-safe (imports only the pure derive + types).
 *
 * HONESTY: the config can only REMOVE or add gates, never invent a slot/date. Turning the shoot gate
 * off (the DIY-reel-beat over-trigger) simply skips it; the order still ships.
 */
import { draftNeedsShoot } from './derive'
import { draftSourceCatalogIds } from '../data/catalog-availability'
import type { CampaignDraft } from '../types'

/** How the auto shoot booking gate is treated for this campaign. */
export type ShootGateMode = 'auto' | 'off' | 'required' | 'optional'

/** An admin-authored pre-checkout gate (not the booking gate): acknowledge (agreement) or answer (input). */
export interface CustomGate {
  id: string
  kind: 'agreement' | 'input'
  title: string
  why?: string
  required: boolean
  /** input gates only. */
  inputType?: 'text' | 'textarea' | 'select'
  /** input+select only. */
  options?: string[]
  /** select gates only (asset checks): choosing this option BLOCKS the purchase — the store
   *  must never sell work the buyer cannot receive. */
  blockOn?: string
  /** Owner-facing reason shown when blocked. Plain words; always paired with a reroute. */
  blockMessage?: string
  /** The honest detour when blocked (never a dead end). */
  rerouteHref?: string
  rerouteLabel?: string
}

export interface CampaignGatesConfig {
  /** Override the auto shoot booking gate. Absent/'auto' = smart default. */
  shoot?: ShootGateMode
  /** Extra agreement/input gates the client must clear before paying. */
  custom?: CustomGate[]
}

/** The resolved, ready-to-enforce gates for a specific composed draft. */
export interface ResolvedGates {
  /** The pre-checkout booking gate (shoot), or null when none applies. */
  booking: { gateKind: string; required: boolean } | null
  /** Agreement/input gates to clear before paying. */
  custom: CustomGate[]
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)

/** Sanitize a stored gates config; undefined when nothing well-formed remains. */
export function cleanGatesConfig(v: unknown): CampaignGatesConfig | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const out: CampaignGatesConfig = {}
  if (r.shoot === 'off' || r.shoot === 'required' || r.shoot === 'optional' || r.shoot === 'auto') {
    if (r.shoot !== 'auto') out.shoot = r.shoot
  }
  if (Array.isArray(r.custom)) {
    const custom: CustomGate[] = []
    const seen = new Set<string>()
    for (const raw of r.custom) {
      if (!raw || typeof raw !== 'object') continue
      const c = raw as Record<string, unknown>
      const kind = c.kind === 'input' ? 'input' : c.kind === 'agreement' ? 'agreement' : null
      if (!kind) continue
      const title = typeof c.title === 'string' ? c.title.trim() : ''
      if (!title) continue
      let id = typeof c.id === 'string' && c.id.trim() ? slugify(c.id) : `gate-${slugify(title)}`
      if (!id) id = 'gate'
      if (seen.has(id)) id = `${id}-${custom.length + 1}`
      seen.add(id)
      const g: CustomGate = { id, kind, title: title.slice(0, 120), required: c.required !== false }
      const why = typeof c.why === 'string' ? c.why.trim() : ''
      if (why) g.why = why.slice(0, 240)
      if (kind === 'input') {
        g.inputType = ['text', 'textarea', 'select'].includes(c.inputType as string) ? (c.inputType as CustomGate['inputType']) : 'text'
        if (g.inputType === 'select' && Array.isArray(c.options)) {
          const opts = (c.options as unknown[]).filter((o): o is string => typeof o === 'string' && !!o.trim()).map((o) => o.trim()).slice(0, 8)
          if (opts.length) g.options = opts
        }
      }
      custom.push(g)
      if (custom.length >= 10) break
    }
    if (custom.length) out.custom = custom
  }
  return out.shoot || out.custom ? out : undefined
}

/** What we already know about the buyer, so asset gates never re-ask what's on file. */
export interface AssetFacts {
  /** The business has a website on file — skip the "do you have a website?" check. */
  hasWebsite?: boolean
  /** A Google Business Profile connection is active — skip the listing question. */
  gbpConnected?: boolean
}

/**
 * Pre-checkout ASSET checks (smart defaults) — the store must never sell work the buyer cannot
 * receive, and never checked before ($814 of Aisha's money went to repairing a website she does
 * not have; Maria hit a dead end on a Google profile that does not exist).
 *
 *  - 'website' (site tune-up): needs an existing site. "No website yet" BLOCKS with a reroute.
 *  - 'friction' (ordering buttons): needs a working online-ordering page. Same block + reroute.
 *  - 'gbp': NEVER blocks — the team playbook claims or creates the listing. The answer just
 *    routes the work (claim vs create) and saves days.
 */
export function assetGatesForDraft(draft: Pick<CampaignDraft, 'sourceCatalogId' | 'sourceCatalogIds'>, facts: AssetFacts = {}): CustomGate[] {
  const ids = new Set(draftSourceCatalogIds(draft))
  const out: CustomGate[] = []
  if (ids.has('website') && !facts.hasWebsite) {
    out.push({
      id: 'asset-website', kind: 'input', inputType: 'select', required: true,
      title: 'Do you have a website?',
      why: 'This fixes a website you already have. It cannot build a new one.',
      options: ['Yes, I have a website', 'No website yet'],
      blockOn: 'No website yet',
      blockMessage: 'This fix needs a website that already exists, so we did not charge you. Ask your team about getting a site first.',
      rerouteHref: '/dashboard/messages?to=strategist', rerouteLabel: 'Ask about a new site',
    })
  }
  if (ids.has('friction')) {
    out.push({
      id: 'asset-ordering', kind: 'input', inputType: 'select', required: true,
      title: 'Do you take online orders today?',
      why: 'This wires your Google buttons to your ordering page. It needs one that already works.',
      options: ['Yes, we take online orders', 'No online ordering yet'],
      blockOn: 'No online ordering yet',
      blockMessage: 'This needs an online ordering page that already works, so we did not charge you. Ask your team about setting up ordering first.',
      rerouteHref: '/dashboard/messages?to=strategist', rerouteLabel: 'Ask about online ordering',
    })
  }
  if (ids.has('gbp') && !facts.gbpConnected) {
    out.push({
      id: 'asset-gbp', kind: 'input', inputType: 'select', required: true,
      title: 'Where is your Google listing today?',
      why: 'Any answer works. If there is no listing, or you cannot get in, your team claims or creates it for you.',
      options: ['I have it and can log in', 'There is a listing but I cannot get in', 'No listing yet', 'Not sure'],
    })
  }
  return out
}

/**
 * Resolve the enforceable pre-checkout gates for a composed draft under a campaign's config.
 * Booking: present iff the draft needs a shoot AND config didn't turn it off — OR config forces it
 * ('required'). 'optional' keeps the gate but doesn't block. Custom: the smart-default asset checks
 * (skipping what `facts` already knows) followed by the config's agreement/input gates; an admin
 * gate with the same id replaces the default.
 */
export function resolveGates(draft: Pick<CampaignDraft, 'items' | 'brief' | 'sourceCatalogId' | 'sourceCatalogIds'>, config?: CampaignGatesConfig | null, facts: AssetFacts = {}): ResolvedGates {
  const mode: ShootGateMode = config?.shoot ?? 'auto'
  let booking: ResolvedGates['booking'] = null
  if (mode !== 'off') {
    const auto = draftNeedsShoot(draft)
    if (auto || mode === 'required') booking = { gateKind: 'shoot', required: mode !== 'optional' }
  }
  const adminCustom = (config?.custom ?? []).filter((g) => g.kind === 'agreement' || g.kind === 'input')
  const assets = assetGatesForDraft(draft, facts).filter((a) => !adminCustom.some((c) => c.id === a.id))
  return { booking, custom: [...assets, ...adminCustom] }
}
