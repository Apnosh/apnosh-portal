'use server'

/**
 * completeCreatorOnboarding — the finish of the guided freelancer setup. The person is already
 * signed in (they forked here from the role step, post-auth), so this turns that login into a
 * creator: a vendor with their skills, service area, bio, style tags, and portfolio links, plus
 * an optional first package. Reuses onboardCreatorCore (the one write path that wires the vendor +
 * creator_logins), then saves the first offering through the same package model the storefront uses.
 *
 * Guards a restaurant account from becoming a creator on the same login (the middleware routes
 * clients to /dashboard, so they'd never reach the creator app). Self-serve creators start pending
 * an admin review (bookable:false), same gate as the quick signup.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { onboardCreatorCore, type CreatorCraft } from '@/lib/marketplace/onboard-creator'
import { CREATOR_AGREEMENT_VERSION } from '@/lib/marketplace/creator-agreement'
import { dispatchForSkills } from '@/lib/marketplace/creator-skills'
import { saveMyPackage } from '@/lib/marketplace/creator-store-actions'
import { productById, packageFromProduct } from '@/lib/marketplace/creative-catalog'
import { slugify, type CreatorPackage, type PackageCategory } from '@/lib/marketplace/package'

const US_STATES = new Set(['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'])

export interface CreatorOnboardingInput {
  name: string
  skills: string[]
  serviceArea: string[]
  bio: string
  styleTags: string[]
  portfolioLinks: string[]
  /** The first offering to publish, or null to add packages later. */
  offer: { productId: string | null; customTitle: string; category: string; priceDollars: number } | null
  agreementVersion: string
}

/** Turn the chosen first offering into a valid single-price package, or null when it's incomplete
 *  (a blank/zero price just means "I'll add this later" — never an error). */
function buildOfferPackage(offer: NonNullable<CreatorOnboardingInput['offer']>): CreatorPackage | null {
  const priceCents = Math.round((offer.priceDollars || 0) * 100)
  if (!(priceCents > 0)) return null
  if (offer.productId) {
    const product = productById(offer.productId)
    if (!product) return null
    // Seed from the standard product (valid skeleton), flatten to one price for the first package.
    const base = packageFromProduct(product)
    const deliverables = base.deliverables.length ? base.deliverables : (product.tiers[0]?.scope ? [...product.tiers[0].scope] : [...product.deliverables])
    return { ...base, tiers: [], priceCents, deliverables: deliverables.length ? deliverables : [product.name], active: true }
  }
  const title = (offer.customTitle ?? '').trim()
  if (!title) return null
  return {
    slug: slugify(title), title, category: offer.category as PackageCategory, categories: [offer.category as PackageCategory],
    listingType: 'one_off', description: `${title} for restaurants.`,
    productId: null, priceCents, billingPeriod: 'one_time',
    deliverables: [title], tiers: [], options: [], turnaroundDays: null, revisions: null,
    photos: [], intake: [], bookingShape: 'scheduled', active: true,
  }
}

export async function completeCreatorOnboarding(input: CreatorOnboardingInput): Promise<{ ok: boolean; error?: string; slug?: string }> {
 try {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in again.' }

  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Add your name.' }
  const skills = (input.skills ?? []).filter(Boolean)
  if (!skills.length) return { ok: false, error: 'Pick at least one thing you do.' }
  const areas = (input.serviceArea ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (!areas.length) return { ok: false, error: 'Add where you work, like WA.' }
  const badArea = areas.find((a) => !US_STATES.has(a))
  if (badArea) return { ok: false, error: `"${badArea}" is not a state code. Use 2-letter codes like WA or OR.` }
  if (input.agreementVersion !== CREATOR_AGREEMENT_VERSION) return { ok: false, error: 'Please accept the Creator Agreement to continue.' }

  const admin = createAdminClient()
  const { data: cu } = await admin.from('client_users').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (cu) return { ok: false, error: 'This email is already a restaurant account. Sign up as a creator with a different email.' }

  const res = await onboardCreatorCore({
    name,
    email: user.email ?? '',
    craft: dispatchForSkills(skills) as CreatorCraft, // the coarse primary craft for campaign dispatch
    crafts: skills,
    serviceArea: areas,
    description: input.bio?.trim() || undefined,
    styleTags: (input.styleTags ?? []).filter(Boolean),
    portfolioLinks: (input.portfolioLinks ?? []).map((s) => s.trim()).filter(Boolean),
    personId: user.id,
    invite: false,
    bookable: false, // review gate: admin approves them into the store
    agreementVersion: CREATOR_AGREEMENT_VERSION,
  })
  if (!res.ok) return { ok: false, error: res.error ?? 'Could not finish setting up your creator account.' }

  // First offering — best-effort. onboardCreatorCore already linked the vendor to this login, so
  // saveMyPackage resolves it from the session. A bad/blank price never blocks finishing setup.
  const pkg = input.offer ? buildOfferPackage(input.offer) : null
  if (pkg) { try { await saveMyPackage(pkg) } catch { /* they can add packages in the storefront */ } }

  return { ok: true, slug: res.slug }
 } catch (e) {
  // Never throw to the client — a rejected server action would leave the "Setting up…" spinner stuck.
  return { ok: false, error: e instanceof Error ? e.message : 'Setup could not finish. Try again.' }
 }
}
