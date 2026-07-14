/**
 * /api/admin/catalog-content/:id — the admin CMS's read/write for ONE campaign's
 * content override (Phase C1). :id is a CreateCatalogId; the in-code
 * CAMPAIGN_CONTENT record stays the canonical default and is never written.
 *
 *   GET    -> { override }  the sparse edited fields ({} when nothing is edited)
 *   PUT    -> replaces the whole override row from the form state. An empty/absent
 *             field means "use the code default" (stored NULL); if EVERY field is
 *             empty the row is deleted so untouched campaigns leave no row behind.
 *   DELETE -> removes the row (reset the whole campaign to code defaults)
 *
 * Copy guard: em dashes are rejected (the same rule scripts/verify-catalog-ids.ts
 * enforces on the code records), so the CMS cannot smuggle one into the store.
 * Admin-only: same role check as the other /api/admin routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CAMPAIGN_CONTENT } from '@/lib/campaigns/data/campaign-content'
import { rowToOverride, cleanStages, type ContentOverrideRow } from '@/lib/campaigns/content-overrides-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return { userId: user.id }
}

const knownId = (id: string): boolean => id in CAMPAIGN_CONTENT

/** Missing-table errors read as a setup problem, not a crash. PostgREST reports the
 *  un-applied table as PGRST205 ("Could not find the table ... in the schema cache");
 *  raw Postgres says 42P01 ("relation ... does not exist"). Match both. */
function tableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  return !!err.message && /could not find the table|relation .* does not exist/i.test(err.message)
}
const SETUP_MSG = 'The overrides table is not set up yet. Apply migration 203 in the Supabase SQL editor first.'

const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!knownId(id)) return NextResponse.json({ error: 'unknown campaign id' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('catalog_content_overrides').select('*').eq('item_id', id).maybeSingle()
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ override: {} })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ override: data ? rowToOverride(data as ContentOverrideRow) : {} })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!knownId(id)) return NextResponse.json({ error: 'unknown campaign id' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const b = body as Record<string, unknown>
  const faqRaw = Array.isArray(b.faq) ? (b.faq as { q?: unknown; a?: unknown }[]) : []
  const faq = faqRaw
    .filter((f) => f && typeof f.q === 'string' && f.q.trim() && typeof f.a === 'string' && f.a.trim())
    .map((f) => ({ q: (f.q as string).trim(), a: (f.a as string).trim() }))

  const stages = cleanStages(b.stages)
  const row = {
    title: clean(b.title),
    tagline: clean(b.tagline),
    description: clean(b.description),
    promise: clean(b.promise),
    why: clean(b.why),
    expectation: clean(b.expectation),
    hero_image: clean(b.heroImage),
    best_for: clean(b.bestFor),
    faq: faq.length ? faq : null,
    stages: stages.length ? stages : null,
  }

  // Same copy rule the code records live under: no em dashes reach the store.
  const emDashFields = Object.entries(row)
    .filter(([k, v]) => k !== 'faq' && typeof v === 'string' && v.includes('—'))
    .map(([k]) => k)
  if (faq.some((f) => f.q.includes('—') || f.a.includes('—'))) emDashFields.push('faq')
  if (emDashFields.length) {
    return NextResponse.json({ error: `Use a comma or period instead of an em dash (${emDashFields.join(', ')}).` }, { status: 400 })
  }

  const admin = createAdminClient()
  const empty = Object.values(row).every((v) => v === null)
  if (empty) {
    const { error } = await admin.from('catalog_content_overrides').delete().eq('item_id', id)
    if (error && !tableMissing(error)) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ override: {}, deleted: true })
  }

  const payload = { item_id: id, ...row, updated_at: new Date().toISOString(), updated_by: auth.userId }
  let { data, error } = await admin.from('catalog_content_overrides').upsert(payload).select('*').maybeSingle()
  // If migration 210 (the `stages` column) is not applied yet, save everything else so the CMS
  // still works — the tags just won't persist until the owner runs the migration.
  if (error && (error.code === '42703' || /column .*stages|stages.* does not exist/i.test(error.message || ''))) {
    const { stages: _stages, ...noStages } = payload
    void _stages
    ;({ data, error } = await admin.from('catalog_content_overrides').upsert(noStages).select('*').maybeSingle())
  }
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ error: SETUP_MSG }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ override: data ? rowToOverride(data as ContentOverrideRow) : {} })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!knownId(id)) return NextResponse.json({ error: 'unknown campaign id' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin.from('catalog_content_overrides').delete().eq('item_id', id)
  if (error && !tableMissing(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: {}, deleted: true })
}
