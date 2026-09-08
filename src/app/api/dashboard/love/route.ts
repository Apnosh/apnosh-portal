/**
 * GET /api/dashboard/love?clientId=…  →  { weeksActiveOfLast4, winsOpenedOfLast30, sentence, line }
 *
 * The love read: does this owner come back, do the wins we fire get looked at, and what is the
 * one true sentence about their week. Read always; every part is best-effort underneath, so a
 * missing table answers 0 / null instead of an error.
 *
 * `?with=sentence` asks for the week's line ONLY, and skips the two staff metrics. Home calls it
 * that way: the sentence sits under the funnel on every load, and the two metrics behind it are a
 * table scan each that no owner-facing screen ever draws.
 *
 * `line` is the sentence in pieces — the i18n key and the two raw numbers — so Home can draw it in
 * the owner's language. `sentence` is the same thing already written out in English, kept for the
 * staff table. Both, so neither caller has to know about the other.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { userMayReadClient } from '@/lib/auth/client-access'
import { weeksActiveOfLast4, winsOpenedOfLast30 } from '@/lib/love/metrics'
import { weeklyLine } from '@/lib/love/sentence'
import { t } from '@/lib/i18n/t'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const clientId = params.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const sentenceOnly = params.get('with') === 'sentence'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = !!profile && ['admin', 'super_admin'].includes((profile as { role: string }).role)
  if (!isAdmin && !(await userMayReadClient(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const [weeks, wins, line] = await Promise.all([
    sentenceOnly ? Promise.resolve(0) : weeksActiveOfLast4(clientId),
    sentenceOnly ? Promise.resolve(null) : winsOpenedOfLast30(clientId),
    weeklyLine(clientId).catch(() => null),
  ])
  const sentence = line
    ? t(line.key, 'en', { n: line.vars.n.toLocaleString('en-US'), prev: line.vars.prev.toLocaleString('en-US') })
    : null
  return NextResponse.json(
    sentenceOnly
      ? { line, sentence }
      : { weeksActiveOfLast4: weeks, winsOpenedOfLast30: wins, sentence, line },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
