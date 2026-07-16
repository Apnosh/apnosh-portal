/**
 * /api/admin/catalog-campaigns — the admin CMS's list/create for admin-created
 * catalog campaigns (Phase C2). Built-in campaigns are NOT served here (they live in
 * code and are content-edited via /api/admin/catalog-content).
 *
 *   GET  -> { campaigns } every DB campaign, drafts included, newest first
 *   POST -> create one; body carries the slug id + content + composition. Validation
 *           (validate.ts): slug format, built-in collision, real service ids, closed
 *           vocab sets, em-dash guard, live-requires-content. An id that already
 *           exists returns 409.
 *
 * Admin-only: same role check as the other /api/admin routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAllDbCampaigns, rowToDbCampaign, type CatalogCampaignRow } from '@/lib/campaigns/catalog-campaigns-server'
import { validateCampaignBody, validateCampaignId, tableMissing, SETUP_MSG } from './validate'

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

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const campaigns = await getAllDbCampaigns()
  return NextResponse.json({ campaigns }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const id = validateCampaignId((body as Record<string, unknown>).id)
  if (typeof id !== 'string') return NextResponse.json({ error: id.error }, { status: 400 })

  const payload = validateCampaignBody(body)
  if ('error' in payload) return NextResponse.json({ error: payload.error }, { status: 400 })

  const admin = createAdminClient()
  const full = { id, ...payload, updated_at: new Date().toISOString(), updated_by: auth.userId }
  let { data, error } = await admin.from('catalog_campaigns').insert(full).select('*').maybeSingle()
  // gates (218) / needs (220) columns may not be applied yet — save the rest so the CMS still works.
  // A missing column surfaces as 42703 (Postgres) or PGRST204 ("Could not find the 'X' column … in
  // the schema cache") depending on the path — catch both.
  if (error && (error.code === '42703' || error.code === 'PGRST204' || /could not find the '?(gates|needs)'? column|(gates|needs).* does not exist/i.test(error.message || ''))) {
    const { gates: _g, needs: _n, ...rest } = full
    void _g; void _n
    ;({ data, error } = await admin.from('catalog_campaigns').insert(rest).select('*').maybeSingle())
  }
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `a campaign with the id "${id}" already exists` }, { status: 409 })
    if (tableMissing(error)) return NextResponse.json({ error: SETUP_MSG }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const campaign = data ? rowToDbCampaign(data as CatalogCampaignRow) : null
  return NextResponse.json({ campaign }, { status: 201 })
}
