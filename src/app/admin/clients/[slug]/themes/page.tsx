/**
 * /admin/clients/[slug]/themes — strategist edits monthly editorial
 * themes for the client.
 *
 * Shows current + next 2 months. Each month is either 'planning' (only
 * strategist sees), 'shared' (client sees on /dashboard/social/plan), or
 * 'archived'. Strategist can edit theme name/blurb/pillars/key dates and
 * toggle status.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ThemesEditor, { type ThemeRow } from './themes-editor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function ThemesPage({ params }: PageProps) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if ((profile?.role as string | null) !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  // Pre-fetch the three relevant months so the editor has consistent
  // starting state.
  const now = new Date()
  const monthDates = [0, 1, 2].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })

  const { data: themes } = await admin
    .from('editorial_themes')
    .select('*')
    .eq('client_id', client.id as string)
    .in('month', monthDates)

  const initial: ThemeRow[] = monthDates.map(month => {
    const existing = (themes ?? []).find(t => (t.month as string) === month)
    return existing
      ? {
          month,
          themeName: (existing.theme_name as string) ?? '',
          themeBlurb: (existing.theme_blurb as string | null) ?? '',
          pillars: (existing.pillars as string[] | null) ?? [],
          keyDates: (existing.key_dates as Array<{ date: string; label: string; note?: string }> | null) ?? [],
          status: (existing.status as 'planning' | 'shared' | 'archived') ?? 'planning',
          strategistNotes: (existing.strategist_notes as string | null) ?? '',
        }
      : {
          month,
          themeName: '',
          themeBlurb: '',
          pillars: [],
          keyDates: [],
          status: 'planning' as const,
          strategistNotes: '',
        }
  })

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {client.name as string}
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <BookOpen className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Editorial themes · {client.name as string}
          </p>
        </div>
        <h1 className="text-[28px] font-bold text-ink tracking-tight leading-tight">
          Monthly themes
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Set the story of the month — main theme, pillars, key dates. Mark a month as
          <span className="font-medium"> shared</span> when ready and the client sees it on
          <span className="font-medium"> /dashboard/social/plan</span>.
        </p>
      </header>

      <ThemesEditor clientId={client.id as string} initialThemes={initial} />
    </div>
  )
}
