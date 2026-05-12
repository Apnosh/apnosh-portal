/**
 * Server-side reads for /work/drafts (the strategist's editorial
 * workflow ledger). RLS scopes the result; admins see all, strategists
 * see their assigned book.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type DraftStatus =
  | 'idea' | 'draft' | 'revising' | 'approved' | 'rejected'
  | 'produced' | 'scheduled' | 'published'

export interface DraftRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  sourceThemeId: string | null
  themeName: string | null
  serviceLine: string
  status: DraftStatus
  idea: string
  caption: string | null
  proposedBy: string | null
  proposedVia: string
  targetPlatforms: string[]
  targetPublishDate: string | null
  revisionCount: number
  approvedBy: string | null
  approvedAt: string | null
  rejectionReason: string | null
  aiGenerationCount: number
  publishedPostId: string | null
  createdAt: string
  updatedAt: string
}

export async function getMyDrafts(opts: { status?: DraftStatus[] } = {}): Promise<DraftRow[]> {
  const supabase = await createServerClient()

  let q = supabase
    .from('content_drafts')
    .select('id, client_id, source_theme_id, service_line, status, idea, caption, proposed_by, proposed_via, target_platforms, target_publish_date, revision_count, approved_by, approved_at, rejection_reason, ai_generation_ids, published_post_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (opts.status && opts.status.length > 0) {
    q = q.in('status', opts.status)
  }

  const { data, error } = await q
  if (error || !data || data.length === 0) return []

  const clientIds = Array.from(new Set(data.map(d => d.client_id as string)))
  const themeIds  = Array.from(new Set(data.map(d => d.source_theme_id as string).filter(Boolean)))

  const [clientsRes, themesRes] = await Promise.all([
    supabase.from('clients').select('id, name, slug').in('id', clientIds),
    themeIds.length > 0
      ? supabase.from('editorial_themes').select('id, theme_name').in('id', themeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; theme_name: string | null }> }),
  ])

  const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id as string, c]))
  const themeMap  = new Map((themesRes.data ?? []).map(t => [t.id as string, t]))

  return data.map(d => {
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
      status: d.status as DraftStatus,
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
    }
  })
}
