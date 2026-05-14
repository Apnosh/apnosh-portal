/**
 * Webhook endpoint for accepting form submissions from any client
 * site. The client (or their form provider) POSTs JSON here, keyed
 * by slug:
 *
 *   POST /api/forms/submit/apnosh
 *   Content-Type: application/json
 *   { "name": "Jane", "email": "jane@x.com", "message": "..." }
 *
 * No auth required — the slug identifies the client. We normalize
 * the payload, extract a few display fields, and store the rest as
 * jsonb. Native HTML forms can POST form-encoded too; we accept
 * both content types.
 *
 * Type-of-form: pass ?kind=catering (or contact / reservation /
 * newsletter / feedback / job_inquiry) on the URL to categorize.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_KINDS = new Set([
  'contact', 'catering', 'reservation', 'newsletter',
  'feedback', 'job_inquiry', 'other',
])

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const admin = createAdminClient()

  /* Resolve client by slug. Public endpoint so we can't trust caller-
     supplied ids; slug is the contract. */
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Unknown client' }, { status: 404 })

  const url = new URL(req.url)
  const kindParam = (url.searchParams.get('kind') || 'other').toLowerCase()
  const kind = VALID_KINDS.has(kindParam) ? kindParam : 'other'

  /* Accept JSON or form-encoded; normalize to a flat object. */
  let fields: Record<string, string> = {}
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json() as Record<string, unknown>
      for (const [k, v] of Object.entries(body ?? {})) {
        fields[k] = String(v ?? '').slice(0, 5000)
      }
    } else {
      const form = await req.formData()
      for (const [k, v] of form.entries()) {
        fields[k] = String(v ?? '').slice(0, 5000)
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  /* Best-effort display extraction. Tries common field-name variants. */
  const displayName  = pickField(fields, ['name', 'full_name', 'fullName', 'first_name'])
  const displayEmail = pickField(fields, ['email', 'email_address', 'e-mail'])
  const displayPhone = pickField(fields, ['phone', 'phone_number', 'tel', 'mobile'])
  const sourceUrl    = pickField(fields, ['_source', 'page_url', 'source_url', 'referer'])
    || req.headers.get('referer')
    || null

  const { data: row, error } = await admin.from('form_submissions').insert({
    client_id: client.id,
    kind,
    display_name: displayName,
    display_email: displayEmail,
    display_phone: displayPhone,
    source_url: sourceUrl,
    fields,
  }).select('id').single()
  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  /* Notify the business owner + any admin/strategists. Owner gets
     the in-portal bell ding; cron/digest features later. */
  try {
    const { data: owners } = await admin
      .from('businesses')
      .select('owner_id')
      .eq('client_id', client.id)
    const ownerIds = (owners ?? []).map(o => o.owner_id as string).filter(Boolean)
    const niceKind = niceLabel(kind)
    const title = `New ${niceKind} submission`
    const body = `${displayName ?? 'Someone'} via ${niceKind} form`
    for (const userId of ownerIds) {
      await createNotification({
        userId, kind: 'client_request', title, body,
        link: `/dashboard/website/forms?id=${row.id}`,
      })
    }
  } catch { /* never block the webhook response on notification errors */ }

  return NextResponse.json({ ok: true, id: row.id })
}

function pickField(fields: Record<string, string>, candidates: string[]): string | null {
  for (const key of candidates) {
    /* Case-insensitive lookup. */
    const found = Object.keys(fields).find(k => k.toLowerCase() === key.toLowerCase())
    if (found && fields[found].trim()) return fields[found].trim().slice(0, 200)
  }
  return null
}

function niceLabel(kind: string): string {
  return kind === 'job_inquiry' ? 'Careers' : kind.charAt(0).toUpperCase() + kind.slice(1)
}
