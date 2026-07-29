import 'server-only'

/**
 * THE VAULT BRIDGE — where completion signals become vault rows, and where surfaces read the
 * whole held picture (law 5: the vault genuinely fills, so campaign #2 asks less than #1).
 *
 * ── DERIVED vs WRITTEN ─────────────────────────────────────────────────────────────────────────
 * Connections are DERIVED at read, never written: heldRequirementsUnion computes
 * GOOGLE/META/MENU/NAP/HOURS from the live tables with the SAME predicates readiness.ts trusts
 * (channel_connections status='active', social_connections sync_status='active', menu_items
 * count, businesses columns). A disconnected account stops counting on the next read — no
 * backfill, no breakRequirement wiring, no rot surface. The vault stores only what actions
 * alone can know: the DNS probe passed, the place-action links were applied and read back, the
 * owner typed their links/photos on the ready page.
 *
 * ── THE WRITE RULES ────────────────────────────────────────────────────────────────────────────
 * recordSignal is AWAITED at every call site (fire-and-forget writes were measured dropping all
 * rows when the lambda ended) but NEVER throws — a PATCH save or an apply route must not fail
 * because a vault insert did. It also never downgrades: a LINKS row proved 'our-side' by the
 * GBP apply is not overwritten by a later owner-typed 'owner-word'.
 *
 * Pre-migration (client_requirements absent) every function degrades to empty/no-op with one
 * console.warn — today's behavior byte-for-byte.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { satisfyRequirement, getHeldRequirements, type HeldRequirement } from './vault'
import type { RequirementProof } from './requirements'

export type VaultSignal =
  | { kind: 'links'; ordering?: string; booking?: string; via: 'owner-typed' | 'gbp-applied' }
  | { kind: 'photos'; urls: string }
  | { kind: 'dns-verified'; domain: string }

/** Signal → (requirement, proof). Exported for the sim's vocabulary pins. The 'links' proof
 *  depends on `via`; the value here is the owner-typed floor. */
export const SIGNAL_MAP: Record<VaultSignal['kind'], { requirement: string; proof: RequirementProof }> = {
  links: { requirement: 'LINKS', proof: 'owner-word' },
  photos: { requirement: 'PHOTOS', proof: 'owner-word' },
  'dns-verified': { requirement: 'DNS', proof: 'probe' },
}

/** Execution field → fact requirement, the write-back AND seed vocabulary. Every execField must
 *  be in the PATCH whitelist (route KNOWN set); every requirement must be fact:true. Sim-pinned. */
export const EXEC_FACT_MAP = [
  { execField: 'orderingLink', requirement: 'LINKS' },
  { execField: 'bookingLink', requirement: 'LINKS' },
  { execField: 'photoUrls', requirement: 'PHOTOS' },
] as const

const RANK: Record<RequirementProof, number> = { 'owner-word': 0, 'our-side': 1, probe: 2, token: 3 }

export async function recordSignal(clientId: string, signal: VaultSignal): Promise<void> {
  try {
    const held = await getHeldRequirements(clientId)
    const write = async (requirement: string, proof: RequirementProof, value: unknown, evidence: string) => {
      const existing = held.find((h) => h.requirement === requirement)
      if (existing && RANK[existing.proof] > RANK[proof]) return // never downgrade
      const res = await satisfyRequirement({ clientId, requirement, proof, value, evidence })
      if (!res.ok) console.warn(`[vault-bridge] ${requirement} not recorded: ${res.error}`)
    }
    switch (signal.kind) {
      case 'links': {
        const value = { ...(signal.ordering ? { ordering: signal.ordering } : {}), ...(signal.booking ? { booking: signal.booking } : {}) }
        if (!Object.keys(value).length) return
        const proof: RequirementProof = signal.via === 'gbp-applied' ? 'our-side' : 'owner-word'
        const evidence = signal.via === 'gbp-applied'
          ? 'place-action links applied via GBP and read back'
          : 'owner typed on the campaign ready page'
        await write('LINKS', proof, value, evidence)
        return
      }
      case 'photos': {
        if (!signal.urls.trim()) return
        await write('PHOTOS', 'owner-word', signal.urls, 'owner provided photo links on the campaign ready page')
        return
      }
      case 'dns-verified': {
        await write('DNS', 'probe', undefined, `SPF/DMARC lookups passed on ${signal.domain}`)
        return
      }
    }
  } catch (e) {
    console.warn('[vault-bridge] recordSignal failed (vault unavailable?):', e instanceof Error ? e.message : e)
  }
}

/* ── the derived half ────────────────────────────────────────────────────────────────────────── */

/** The live-table requirements, computed fresh every read. Predicates deliberately mirror
 *  src/lib/campaigns/readiness.ts (doneSetup derivation) — one truth, a second reader. */
export async function deriveHeldFromTables(clientId: string): Promise<HeldRequirement[]> {
  try {
    const admin = createAdminClient()
    const [chan, social, menu, biz] = await Promise.all([
      admin.from('channel_connections').select('channel, status').eq('client_id', clientId).eq('status', 'active'),
      admin.from('social_connections').select('platform, sync_status').eq('client_id', clientId).eq('sync_status', 'active'),
      admin.from('menu_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      admin.from('businesses').select('address, phone, hours').eq('client_id', clientId).maybeSingle(),
    ])
    const now = new Date().toISOString()
    const out: HeldRequirement[] = []
    const hold = (requirement: string, proof: RequirementProof, evidence: string) =>
      out.push({ requirement, proof, value: null, evidence, satisfiedAt: now, hollow: proof === 'owner-word' })

    const channels = new Set((chan.data ?? []).map((r) => r.channel as string))
    if (channels.has('google_business_profile')) hold('GOOGLE', 'token', 'live Google Business connection')
    if ((social.data ?? []).length > 0) hold('META', 'token', 'live social connection')
    if ((menu.count ?? 0) > 0) hold('MENU', 'owner-word', `${menu.count} menu items on file`)
    const b = biz.data as { address?: string | null; phone?: string | null; hours?: unknown } | null
    if (b?.address && b?.phone) hold('NAP', 'owner-word', 'name, address and phone on the business record')
    if (b?.hours) hold('HOURS', 'owner-word', 'hours on the business record')
    return out
  } catch {
    return []
  }
}

/** The ONE read surfaces use: derived ∪ vault, higher proof rank wins per requirement. */
export async function heldRequirementsUnion(clientId: string): Promise<HeldRequirement[]> {
  const [derived, vault] = await Promise.all([deriveHeldFromTables(clientId), getHeldRequirements(clientId)])
  const byId = new Map<string, HeldRequirement>()
  for (const h of [...derived, ...vault]) {
    const cur = byId.get(h.requirement)
    if (!cur || RANK[h.proof] > RANK[cur.proof]) byId.set(h.requirement, h)
  }
  return [...byId.values()]
}

/** The fact values a new campaign's execution can be seeded from — what makes campaign #2's
 *  asks genuinely pre-answered (value in the pipe, not a green light over an empty one). */
export async function vaultFactSeeds(clientId: string): Promise<Record<string, string>> {
  try {
    const held = await getHeldRequirements(clientId)
    const out: Record<string, string> = {}
    const links = held.find((h) => h.requirement === 'LINKS')?.value as { ordering?: string; booking?: string } | null
    if (links?.ordering) out.orderingLink = links.ordering
    if (links?.booking) out.bookingLink = links.booking
    const photos = held.find((h) => h.requirement === 'PHOTOS')?.value
    if (typeof photos === 'string' && photos.trim()) out.photoUrls = photos
    return out
  } catch {
    return {}
  }
}
