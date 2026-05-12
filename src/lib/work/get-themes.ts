/**
 * Server-side reads for /work/themes. RLS scopes to the strategist's
 * assigned book.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export interface ThemeRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  month: string | null     // YYYY-MM-01 date string
  themeName: string | null
  themeBlurb: string | null
  pillars: unknown
  keyDates: unknown
  strategistNotes: string | null
  status: string | null
  version: number
  createdAt: string
  updatedAt: string
  /** Drafts produced under this theme (count). */
  draftCount: number
}

export async function getMyThemes(): Promise<ThemeRow[]> {
  const supabase = await createServerClient()

  const { data: themes } = await supabase
    .from('editorial_themes')
    .select('id, client_id, month, theme_name, theme_blurb, pillars, key_dates, strategist_notes, status, version, created_at, updated_at')
    .order('month', { ascending: false })
    .limit(100)
  if (!themes || themes.length === 0) return []

  const clientIds = Array.from(new Set(themes.map(t => t.client_id as string)))
  const themeIds  = themes.map(t => t.id as string)

  const [clientsRes, draftsRes] = await Promise.all([
    supabase.from('clients').select('id, name, slug').in('id', clientIds),
    supabase.from('content_drafts')
      .select('source_theme_id')
      .in('source_theme_id', themeIds),
  ])

  const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id as string, c]))
  const draftCounts = new Map<string, number>()
  for (const d of draftsRes.data ?? []) {
    const k = d.source_theme_id as string
    draftCounts.set(k, (draftCounts.get(k) ?? 0) + 1)
  }

  return themes.map(t => {
    const c = clientMap.get(t.client_id as string)
    return {
      id: t.id as string,
      clientId: t.client_id as string,
      clientName: (c?.name as string) ?? null,
      clientSlug: (c?.slug as string) ?? null,
      month: (t.month as string) ?? null,
      themeName: (t.theme_name as string) ?? null,
      themeBlurb: (t.theme_blurb as string) ?? null,
      pillars: t.pillars,
      keyDates: t.key_dates,
      strategistNotes: (t.strategist_notes as string) ?? null,
      status: (t.status as string) ?? null,
      version: Number(t.version ?? 1),
      createdAt: (t.created_at as string) ?? new Date().toISOString(),
      updatedAt: (t.updated_at as string) ?? new Date().toISOString(),
      draftCount: draftCounts.get(t.id as string) ?? 0,
    }
  })
}
