/**
 * Debug endpoint — what does getLocalSeoView actually return?
 */
import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getLocalSeoView } from '@/lib/dashboard/get-local-seo-view'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'no user' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'no client', user: user.email }, { status: 403 })

  const admin = createAdminClient()

  /* Match the exact query getLocalSeoView runs */
  const yearAgo = new Date()
  yearAgo.setDate(yearAgo.getDate() - 365)
  const yearAgoStr = yearAgo.toISOString().slice(0, 10)

  const yearQuery = await admin
    .from('gbp_metrics')
    .select('date, directions, calls, website_clicks, search_views, search_views_maps, search_views_search, photo_views', { count: 'exact' })
    .eq('client_id', clientId)
    .gte('date', yearAgoStr)
    .order('date', { ascending: true })
    .limit(10000)

  const last30 = await admin
    .from('gbp_metrics')
    .select('date', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))

  const view = await getLocalSeoView(clientId)

  return NextResponse.json({
    user: user.email,
    clientId,
    yearAgoStr,
    yearQueryRowCount: yearQuery.count,
    yearQueryReturnedRows: yearQuery.data?.length,
    yearQueryError: yearQuery.error?.message ?? null,
    last30dRowCount: last30.count,
    sampleFirst: yearQuery.data?.slice(0, 2),
    sampleLast: yearQuery.data?.slice(-2),
    viewNum: view?.num,
  })
}
