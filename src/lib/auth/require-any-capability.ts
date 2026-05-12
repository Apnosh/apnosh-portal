/**
 * Additive-capability gate. Replaces the old single-capability
 * requireCapability() pattern for surfaces accessible to multiple
 * role types.
 *
 * Roles in Apnosh are additive: holding more capabilities = seeing
 * MORE in the same workspace, not switching between workspaces. So
 * a page should accept ANY of a list of capabilities, not require
 * one specific one.
 *
 * Admins implicitly pass any cap check.
 *
 * Example:
 *   /work/drafts accepts strategist OR copywriter — both have a
 *   reason to view the drafts ledger (strategist judges, copywriter
 *   polishes). Use:
 *     await requireAnyCapability(['strategist', 'copywriter'])
 */

import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getMyCapabilities, type RoleCapability } from '@/lib/auth/capabilities'

/**
 * Server gate that passes if the user holds ANY of the listed
 * capabilities (or is admin). Redirects to /login if signed out, or
 * to the user's primary lens otherwise.
 */
export async function requireAnyCapability(caps: RoleCapability[]): Promise<void> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const held = await getMyCapabilities()
  const heldSet = new Set(held.map(c => c.role))
  if (heldSet.has('admin')) return  // admin passes any check
  if (caps.some(c => heldSet.has(c))) return

  // No match — drop them on their primary lens.
  const landing = held[0]?.landingPath ?? '/dashboard'
  redirect(landing)
}

/**
 * Pure boolean check — does the current user hold ANY of these caps?
 * Use in render-time decisions (show this nav item, hide that
 * button). Admin always returns true.
 */
export async function isCapable(caps: RoleCapability[]): Promise<boolean> {
  const held = await getMyCapabilities()
  const heldSet = new Set(held.map(c => c.role))
  if (heldSet.has('admin')) return true
  return caps.some(c => heldSet.has(c))
}

/**
 * Returns the SET of all capabilities the current user holds.
 * Use for fine-grained UI branching: "if user has copywriter,
 * show the Briefs nav item".
 */
export async function getCapabilitySet(): Promise<Set<RoleCapability>> {
  const held = await getMyCapabilities()
  return new Set(held.map(c => c.role))
}
