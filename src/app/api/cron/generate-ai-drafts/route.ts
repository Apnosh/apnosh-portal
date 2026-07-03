/**
 * /api/cron/generate-ai-drafts — write REAL first drafts for campaign AI-lane pieces.
 *
 * materializeCampaignDrafts mints 'ai' pieces as content_drafts rows with
 * status 'idea' + media_brief.producer='ai' (and no caption). This cron picks
 * them up oldest-first and generates a grounded, ready-to-review caption via
 * generateAiFirstDraft, flipping each row to status 'draft' for staff QA in
 * /work/drafts. The judge gate and the owner sign-off gate downstream are
 * untouched — nothing here can publish anything.
 *
 * Idempotency: the generator's success write is conditional (status still
 * 'idea' AND caption still null), and failed generations bump
 * media_brief.ai_attempts so a piece stops retrying after MAX_AI_ATTEMPTS and
 * stays in the staff-authored lane. Small batch per tick — each item is one
 * model call — sized well inside maxDuration.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAiFirstDraft, type AiDraftRow, type AiDraftResult } from '@/lib/campaigns/ai-first-draft'
import { readApiKey } from '@/lib/campaigns/planning/anthropic'
import { notifyStaffForClient } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET
const BATCH = 5

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // No key -> nothing can generate; make that visible instead of failing per-row.
  if (!readApiKey()) return NextResponse.json({ ok: true, considered: 0, skipped: 'no anthropic key' })

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('content_drafts')
    .select('id, client_id, campaign_id, idea, caption, status, target_platforms, target_publish_date, media_brief')
    .eq('status', 'idea')
    .is('caption', null)
    .not('campaign_id', 'is', null)
    .eq('media_brief->>producer', 'ai')
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const outcomes: { draftId: string; result: AiDraftResult | 'error' }[] = []
  const generatedByClient = new Map<string, number>()

  for (const row of rows ?? []) {
    try {
      const result = await generateAiFirstDraft(row as AiDraftRow)
      outcomes.push({ draftId: row.id as string, result })
      if (result === 'generated') {
        const cid = row.client_id as string
        generatedByClient.set(cid, (generatedByClient.get(cid) ?? 0) + 1)
      }
    } catch {
      outcomes.push({ draftId: row.id as string, result: 'error' })
    }
  }

  // Staff QA ping — one per client per tick, never throws.
  for (const [clientId, n] of generatedByClient) {
    await notifyStaffForClient(clientId, ['strategist', 'copywriter', 'community_mgr'], {
      kind: 'ai_drafts_ready',
      title: n > 1 ? `${n} AI first drafts ready to review` : 'An AI first draft is ready to review',
      body: 'Campaign pieces drafted by AI are waiting for your QA before the owner sees them.',
      link: '/work/drafts',
    }).catch(() => ({ notified: 0 }))
  }

  return NextResponse.json({ ok: true, considered: rows?.length ?? 0, outcomes })
}
