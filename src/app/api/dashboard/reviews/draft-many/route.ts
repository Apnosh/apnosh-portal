/**
 * POST /api/dashboard/reviews/draft-many — { clientId, reviewIds: string[], tone? }
 *
 * The Reply now sheet's batch: up to eight reviews drafted at once, each a real call in the
 * owner's voice, each kept in client_cache for a week under reply-draft:<reviewId>:<tone> so a
 * second open, the inbox feed and the single-draft route all show the same words. A review that
 * fails to draft comes back missing, never as a canned line.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { draftReviewReply, isTone } from '@/lib/reviews/draft-reply'
import { readCache, writeCache } from '@/lib/client-cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 30
const MAX = 8
const FRESH_MS = 7 * 24 * 60 * 60_000

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; reviewIds?: unknown; tone?: unknown; fresh?: boolean }
  const clientId = body.clientId
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const tone = isTone(body.tone) ? body.tone : 'thankful'
  const ids = (Array.isArray(body.reviewIds) ? body.reviewIds : []).filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX)
  if (!ids.length) return NextResponse.json({ drafts: {} })

  const admin = createAdminClient()
  const drafts: Record<string, string> = {}
  await Promise.all(ids.map(async (id) => {
    const key = `reply-draft:${id}:${tone}`
    if (!body.fresh) {
      const hit = await readCache<{ reply?: string }>(clientId, key)
      if (hit && hit.ageMs < FRESH_MS && typeof hit.payload.reply === 'string' && hit.payload.reply.trim()) { drafts[id] = hit.payload.reply; return }
    }
    const out = await draftReviewReply(admin, id, tone, { clientId })
    if ('error' in out) return
    drafts[id] = out.reply
    writeCache(clientId, key, { reply: out.reply }).catch(() => {})
  }))
  return NextResponse.json({ drafts, tone })
}
