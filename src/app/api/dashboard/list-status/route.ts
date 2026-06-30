import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/dashboard/list-status?clientId=… — does the owner have a connected
 * email/text list? True when their latest email_list_snapshot has at least one
 * segment with people in it. The campaign builder uses this to gate the launch
 * "email + text" option: we only plan a launch email/SMS when there's actually
 * a list to send to, so we never promise a send the owner can't make.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ hasList: false })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ hasList: false })

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('email_list_snapshot')
      .select('segments')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()
    const segs = (data as { segments?: { count?: number }[] } | null)?.segments ?? []
    const hasList = segs.some((s) => s && typeof s.count === 'number' && s.count > 0)
    return NextResponse.json({ hasList })
  } catch {
    return NextResponse.json({ hasList: false })
  }
}
