/**
 * /api/audience — the client's guest list (owner side).
 *
 * GET: the list, newest first, with an unsubscribed flag per guest.
 * POST: import contacts. Server-validated (real email shapes only, capped,
 * deduped by (client, lower(email)) via the unique index) so a hand-rolled
 * call cannot land garbage. Importing asserts the owner collected these
 * addresses with permission — the UI says so in plain words.
 * DELETE: remove one guest entirely.
 *
 * Failure honesty: before migration 237 the table is missing; reads degrade
 * to an empty list and writes say "still setting up".
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_IMPORT = 2000
const SETUP_MSG = 'We are still setting this up. Try again in a bit.'

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

const isMissingTable = (msg: string | undefined) =>
  Boolean(msg && (msg.includes('guest_contacts') || msg.includes('42P01') || msg.toLowerCase().includes('does not exist')))

async function requireClient(): Promise<{ clientId: string } | { error: NextResponse }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const clientId = await resolveClientId(user.id)
  if (!clientId) return { error: NextResponse.json({ error: 'No client context' }, { status: 403 }) }
  return { clientId }
}

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('guest_contacts')
    .select('id, email, name, unsubscribed_at, created_at')
    .eq('client_id', auth.clientId)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ contacts: [] })
    return NextResponse.json({ error: 'Could not load your guest list' }, { status: 500 })
  }
  return NextResponse.json({ contacts: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error

  let body: { contacts?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }
  if (!Array.isArray(body.contacts)) {
    return NextResponse.json({ error: 'contacts must be a list' }, { status: 400 })
  }

  // Validate + dedupe within the request; the DB unique index handles the rest.
  const seen = new Set<string>()
  const clean: { client_id: string; email: string; name: string | null; source: string }[] = []
  for (const item of body.contacts.slice(0, MAX_IMPORT)) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const email = (typeof o.email === 'string' ? o.email.trim().toLowerCase() : '').slice(0, 254)
    if (!EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    const name = (typeof o.name === 'string' ? o.name.trim() : '').slice(0, 120) || null
    clean.push({ client_id: auth.clientId, email, name, source: 'import' })
  }
  if (clean.length === 0) {
    return NextResponse.json({ error: 'No real email addresses in that list.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('guest_contacts')
    .upsert(clean, { onConflict: 'client_id,email', ignoreDuplicates: true })
    .select('id')
  if (error) {
    // The unique index is on lower(email); the expression conflict target can
    // vary by PostgREST version — fall back to per-row inserts that skip dupes.
    if (isMissingTable(error.message)) return NextResponse.json({ error: SETUP_MSG }, { status: 500 })
    let added = 0
    for (const row of clean) {
      const { error: e2 } = await admin.from('guest_contacts').insert(row)
      if (!e2) added++
      else if ((e2 as { code?: string }).code !== '23505') {
        return NextResponse.json({ error: 'Could not save the list. Try again.' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true, added, considered: clean.length })
  }
  return NextResponse.json({ ok: true, added: data?.length ?? 0, considered: clean.length })
}

export async function DELETE(req: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const admin = createAdminClient()
  const { error } = await admin
    .from('guest_contacts')
    .delete()
    .eq('id', body.id)
    .eq('client_id', auth.clientId)
  if (error) return NextResponse.json({ error: 'Could not remove that guest.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
