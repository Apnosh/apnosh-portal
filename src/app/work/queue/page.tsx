/**
 * /work/queue — designer's visual brief queue.
 *
 * Filtered view of content_drafts focused on what NEEDS visual
 * direction: drafts where the media_brief is empty or thin.
 * Designer fleshes the brief (composition, lighting, props, mood,
 * shot list); shoots are then bookable against it.
 *
 * Accessible to strategist + copywriter + designer per the additive
 * role model. Same data, different lens.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { createClient as createServerClient } from '@/lib/supabase/server'
import QueueView from './queue-view'
import type { DraftRow } from '@/lib/work/get-drafts'

export const dynamic = 'force-dynamic'

export default async function VisualQueuePage() {
  await requireAnyCapability(['strategist', 'copywriter', 'designer'])

  const supabase = await createServerClient()
  // Fetch drafts in flight (not yet published or rejected). RLS scopes
  // these to the user's book.
  const { data } = await supabase
    .from('content_drafts')
    .select('id, client_id, source_theme_id, service_line, status, idea, caption, proposed_by, proposed_via, target_platforms, target_publish_date, revision_count, approved_by, approved_at, rejection_reason, ai_generation_ids, published_post_id, created_at, updated_at, media_brief, hashtags')
    .in('status', ['idea', 'draft', 'revising', 'approved'])
    .order('updated_at', { ascending: false })
    .limit(100)

  // Enrich with client name + theme name (RLS will hide rows we can't see)
  const drafts = data ?? []
  const clientIds = Array.from(new Set(drafts.map(d => d.client_id as string)))
  const themeIds = Array.from(new Set(drafts.map(d => d.source_theme_id as string).filter(Boolean)))

  const [clientsRes, themesRes] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('clients').select('id, name, slug').in('id', clientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; slug: string }> }),
    themeIds.length > 0
      ? supabase.from('editorial_themes').select('id, theme_name').in('id', themeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; theme_name: string | null }> }),
  ])

  const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id as string, c]))
  const themeMap = new Map((themesRes.data ?? []).map(t => [t.id as string, t]))

  // Project to DraftRow shape, plus expose media_brief separately so
  // the queue view can decide which drafts need attention.
  const projected: Array<DraftRow & { mediaBrief: Record<string, unknown> }> = drafts.map(d => {
    const c = clientMap.get(d.client_id as string)
    const t = d.source_theme_id ? themeMap.get(d.source_theme_id as string) : undefined
    return {
      id: d.id as string,
      clientId: d.client_id as string,
      clientName: (c?.name as string) ?? null,
      clientSlug: (c?.slug as string) ?? null,
      sourceThemeId: (d.source_theme_id as string) ?? null,
      themeName: (t?.theme_name as string) ?? null,
      serviceLine: (d.service_line as string) ?? 'social',
      status: d.status as DraftRow['status'],
      idea: (d.idea as string) ?? '',
      caption: (d.caption as string) ?? null,
      proposedBy: (d.proposed_by as string) ?? null,
      proposedVia: (d.proposed_via as string) ?? 'strategist',
      targetPlatforms: Array.isArray(d.target_platforms) ? (d.target_platforms as string[]) : [],
      targetPublishDate: (d.target_publish_date as string) ?? null,
      revisionCount: Number(d.revision_count ?? 0),
      approvedBy: (d.approved_by as string) ?? null,
      approvedAt: (d.approved_at as string) ?? null,
      rejectionReason: (d.rejection_reason as string) ?? null,
      aiGenerationCount: Array.isArray(d.ai_generation_ids) ? (d.ai_generation_ids as unknown[]).length : 0,
      publishedPostId: (d.published_post_id as string) ?? null,
      createdAt: (d.created_at as string) ?? new Date().toISOString(),
      updatedAt: (d.updated_at as string) ?? new Date().toISOString(),
      mediaBrief: (d.media_brief as Record<string, unknown>) ?? {},
    }
  })

  return <QueueView initialDrafts={projected} />
}
