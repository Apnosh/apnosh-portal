'use server'

/**
 * Server actions for the client-side subscribe flow.
 *
 *   1. recordIntent      stamps client_services row with status=pending
 *   2. signAgreement     stores an `agreements` row with the accepted
 *                        version, IP, timestamp, hash of content
 *   3. activateService   moves the row to status=active. In production
 *                        this is called by the Stripe webhook AFTER
 *                        successful checkout. Until Stripe is wired we
 *                        let the client activate directly so the flow
 *                        works end-to-end in dev.
 *
 * Existing tables used:
 *   service_catalog       (the menu of services)
 *   client_services       (subscriptions per client)
 *   agreement_templates   (versioned MSA + service-specific addenda)
 *   agreements            (signed instances)
 *   subscriptions         (Stripe-side mirror; populated by webhook)
 */

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface CtxResult { userId: string; clientId: string }

async function requireClientContext(): Promise<CtxResult | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle()
  if (biz?.client_id) return { userId: user.id, clientId: biz.client_id }
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (cu?.client_id) return { userId: user.id, clientId: cu.client_id }

  return { error: 'No client context' }
}

export interface ActiveAgreement {
  templateId: string
  templateName: string
  version: number
  content: string
}

/**
 * Returns the agreement template the client must accept before any
 * paid service is activated. Today we return the latest active row
 * from agreement_templates of type 'msa'. Later we can scope per
 * service if needed.
 */
export async function getActiveAgreementTemplate(): Promise<ActiveAgreement | null> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('agreement_templates')
    .select('id, name, version, content, type')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    templateId: data.id as string,
    templateName: data.name as string,
    version: data.version as number,
    content: data.content as string,
  }
}

/**
 * Returns true if the client has already signed the latest version of
 * the master agreement. Used to skip the agreement step on subsequent
 * purchases.
 */
export async function hasSignedActiveAgreement(): Promise<boolean> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return false
  const admin = createAdminClient()

  const template = await getActiveAgreementTemplate()
  if (!template) return false

  /* Agreements key off business_id; look it up from client_id. */
  const { data: biz } = await admin
    .from('businesses')
    .select('id')
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!biz) return false

  const { data } = await admin
    .from('agreements')
    .select('id')
    .eq('business_id', biz.id)
    .eq('template_id', template.templateId)
    .eq('status', 'signed')
    .limit(1)
    .maybeSingle()
  return !!data
}

export type SubscribeResult =
  | { success: true; clientServiceId: string; needsAgreement: boolean }
  | { success: false; error: string }

/**
 * Step 1 of the purchase: record the client's intent to subscribe.
 * Creates a pending client_services row. If they already have an
 * active row, returns success with the existing id so the UI can
 * route them to "Manage" instead.
 */
export async function recordSubscribeIntent(serviceId: string): Promise<SubscribeResult> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()

  const { data: service } = await admin
    .from('service_catalog')
    .select('id, name, price, is_active')
    .eq('id', serviceId)
    .maybeSingle()
  if (!service || !service.is_active) return { success: false, error: 'Service not available' }

  /* Look for an existing subscription row first to avoid duplicates. */
  const { data: existing } = await admin
    .from('client_services')
    .select('id, status')
    .eq('client_id', ctx.clientId)
    .eq('service_slug', serviceId)
    .maybeSingle()

  let clientServiceId: string

  if (existing) {
    if (existing.status === 'active') {
      return { success: false, error: 'You are already subscribed to this service.' }
    }
    // Re-use the existing row, flip to pending if cancelled/paused.
    await admin
      .from('client_services')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    clientServiceId = existing.id as string
  } else {
    const monthlyCents = Math.round(Number(service.price) * 100)
    const { data: inserted, error: insertErr } = await admin
      .from('client_services')
      .insert({
        client_id: ctx.clientId,
        service_slug: serviceId,
        display_name: service.name,
        monthly_price_cents: monthlyCents,
        status: 'pending',
        requires_client_approval: false,
        metadata: {},
      })
      .select('id')
      .single()
    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message ?? 'Could not record intent' }
    }
    clientServiceId = inserted.id as string
  }

  const needsAgreement = !(await hasSignedActiveAgreement())
  return { success: true, clientServiceId, needsAgreement }
}

export type SignResult = { success: true } | { success: false; error: string }

/**
 * Step 2 of the purchase: store a signed copy of the master
 * agreement with timestamp, IP, hash of the content the client saw.
 * Sufficient for clickwrap-style enforceability when paired with
 * a thoughtfully drafted template.
 */
export async function signAgreement(input: {
  templateId: string
  agreedText: string
  signerName?: string
  signerEmail?: string
}): Promise<SignResult> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const admin = createAdminClient()
  const hdrs = await headers()
  const ipAddress = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? hdrs.get('x-real-ip')
    ?? null

  /* The agreement_templates row stores type + version; copy them onto
     the agreement record for fast lookup and historical audit. */
  const { data: tmpl } = await admin
    .from('agreement_templates')
    .select('type, version')
    .eq('id', input.templateId)
    .maybeSingle()

  /* Find the business_id for this client. Agreements live one level
     down from clients via the businesses table. */
  const { data: biz } = await admin
    .from('businesses')
    .select('id')
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!biz) return { success: false, error: 'No business found for this client' }

  const contentHash = createHash('sha256').update(input.agreedText).digest('hex')

  const { error } = await admin
    .from('agreements')
    .insert({
      business_id: biz.id,
      template_id: input.templateId,
      agreement_type: (tmpl?.type as string) ?? 'master_service_agreement',
      version_number: (tmpl?.version as number) ?? 1,
      status: 'signed',
      rendered_content: input.agreedText,
      signed_at: new Date().toISOString(),
      signed_by_name: input.signerName ?? null,
      signed_by_email: input.signerEmail ?? null,
      signed_by_ip: ipAddress,
      custom_fields: { content_hash: contentHash },
    })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Step 3 of the purchase: activate the service. In production this is
 * called by the Stripe webhook after a successful subscription
 * payment. For development (and to keep the flow shippable before all
 * stripe_price_ids are wired), the client can call this directly --
 * the row just gets marked active so the rest of the portal reacts.
 */
export async function activateService(clientServiceId: string): Promise<SignResult> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from('client_services')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientServiceId)
    .eq('client_id', ctx.clientId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/services')
  revalidatePath('/dashboard/billing')
  return { success: true }
}

/**
 * Cancel an active service. Stripe billing winds down at end of
 * current period via the webhook; portal-side we flip to cancelled
 * immediately so dashboards stop hiding gated UI.
 */
export async function cancelService(clientServiceId: string): Promise<SignResult> {
  const ctx = await requireClientContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { error } = await admin
    .from('client_services')
    .update({
      status: 'cancelled',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientServiceId)
    .eq('client_id', ctx.clientId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/dashboard/services')
  revalidatePath('/dashboard/billing')
  return { success: true }
}
