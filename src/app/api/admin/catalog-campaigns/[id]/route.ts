/**
 * /api/admin/catalog-campaigns/:id — read/update/delete ONE admin-created catalog
 * campaign (Phase C2). Built-in campaign ids 404 here on purpose: they live in code,
 * cannot be deleted, and their content edits go through /api/admin/catalog-content.
 *
 *   GET    -> { campaign }
 *   PUT    -> full update from the form state (same validation as create). The id
 *             itself never changes (deep links + saved drafts key on it).
 *             Unpublish = PUT with status 'draft'.
 *   DELETE -> removes the row. Owner-side, the card simply stops being served; any
 *             campaign an owner already shipped from it is untouched (its draft holds
 *             real service line items, not a reference).
 *
 * Admin-only: same role check as the other /api/admin routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBuiltinCampaignId, isValidCampaignSlug } from '@/lib/campaigns/data/db-campaigns'
import { rowToDbCampaign, type CatalogCampaignRow } from '@/lib/campaigns/catalog-campaigns-server'
import { validateCampaignBody, tableMissing, SETUP_MSG } from '../validate'

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

/** DB campaign ids only: a built-in or malformed id can never be read/written here. */
const dbCampaignId = (id: string): boolean => isValidCampaignSlug(id) && !isBuiltinCampaignId(id)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!dbCampaignId(id)) return NextResponse.json({ error: 'not an admin-created campaign id' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('catalog_campaigns').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ error: SETUP_MSG }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const campaign = data ? rowToDbCampaign(data as CatalogCampaignRow) : null
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  return NextResponse.json({ campaign })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!dbCampaignId(id)) return NextResponse.json({ error: 'not an admin-created campaign id' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const payload = validateCampaignBody(body)
  if ('error' in payload) return NextResponse.json({ error: payload.error }, { status: 400 })

  const admin = createAdminClient()
  const full = { ...payload, updated_at: new Date().toISOString(), updated_by: auth.userId }
  let { data, error } = await admin.from('catalog_campaigns').update(full).eq('id', id).select('*').maybeSingle()
  // gates (218) / needs (220) columns may not be applied yet — save the rest so the CMS still works.
  // A missing column surfaces as 42703 or PGRST204 ("Could not find the 'X' column …") — catch both.
  if (error && (error.code === '42703' || error.code === 'PGRST204' || /could not find the '?(gates|needs)'? column|(gates|needs).* does not exist/i.test(error.message || ''))) {
    const { gates: _g, needs: _n, ...rest } = full
    void _g; void _n
    ;({ data, error } = await admin.from('catalog_campaigns').update(rest).eq('id', id).select('*').maybeSingle())
  }
  if (error) {
    if (tableMissing(error)) return NextResponse.json({ error: SETUP_MSG }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  return NextResponse.json({ campaign: rowToDbCampaign(data as CatalogCampaignRow) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!dbCampaignId(id)) return NextResponse.json({ error: 'not an admin-created campaign id' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin.from('catalog_campaigns').delete().eq('id', id)
  if (error && !tableMissing(error)) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
