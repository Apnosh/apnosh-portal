'use client'

/**
 * /dashboard — the owner home, redesigned to the apnosh-mvp design. Renders
 * the full-screen owner experience (design header + content + bottom nav),
 * wired to real data via the shared transform. On wide screens it centers in a
 * phone-width column.
 *
 * The previous Direction-A dashboard (admin picker, desktop home, getting
 * started) is preserved in git history / on main.
 */

import { useEffect, useState } from 'react'
import { useClient } from '@/lib/client-context'
import { useUser } from '@/lib/supabase/hooks'
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'
import { transformHome } from '@/components/mvp/home-transform'
import MvpShell from '@/components/mvp/mvp-shell'
import type { Suggestion } from '@/lib/dashboard/suggestions'

function timeGreeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardHomePage() {
  const { client, loading: clientLoading } = useClient()
  const { data: user } = useUser()
  const [data, setData] = useState<MvpHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // AI-tailored suggestion stack — fetched alongside the load and merged in
  // when ready, so Home paints instantly with the deterministic set first.
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[] | null>(null)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    setAiSuggestions(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const d = transformHome(json.homeMetrics, json.agenda, client.name ?? '·', undefined, json.comingUp)
        // The calm top read: the AI daily brief, falling back to today's headline.
        d.brief = json.brief?.text || json.todayHero?.headline || null
        // Real reputation: standing rating + the latest review (one-tap reply).
        const rr = json.recentReviews
        d.reputation = rr && rr.avgRating != null ? { avg: rr.avgRating, total: rr.total, unanswered: json.counts?.unansweredReviews ?? 0 } : null
        const top = rr?.items?.[0]
        d.latestReview = top ? { id: top.id, author: top.authorName, rating: top.rating, text: top.text ?? '', source: top.source, needsReply: top.needsReply } : null
        // What's happened since they last looked (the proof-of-work recap).
        d.timeline = (json.sinceLastChecked ?? []).slice(0, 5).map((e: { id: string; whenLabel: string; text: string; emphasis: 'win' | 'info' | 'mute'; big: boolean }) => ({ id: e.id, whenLabel: e.whenLabel, text: e.text, emphasis: e.emphasis, big: e.big }))
        setData(d)
      })
      .catch((e) => { if (live) setError(e.message) })

    // Tailored suggestions (server gathers richer signals + an AI rewrite).
    // Soft: failures just leave the instant set from the transform in place.
    fetch(`/api/dashboard/suggestions?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.suggestions?.length) setAiSuggestions(j.suggestions) })
      .catch(() => { /* keep the instant set */ })
    return () => { live = false }
  }, [client?.id, client?.name])

  const firstName = (user?.full_name || '').trim().split(' ')[0]
  const greeting = `${timeGreeting()}${firstName ? `, ${firstName}` : ''}`
  const view = data ? { ...data, greeting, ...(aiSuggestions ? { suggestions: aiSuggestions } : {}) } : null

  return (
    <MvpShell active="home" unread={(data?.approvals?.length ?? 0) > 0}>
      {clientLoading || (!data && !error) ? (
        <Centered>Loading your numbers…</Centered>
      ) : error ? (
        <Centered>Couldn&apos;t load: {error}</Centered>
      ) : view ? (
        <MvpHome data={view} showHeader={false} clientId={client?.id} />
      ) : (
        <Centered>No client found for this account.</Centered>
      )}
    </MvpShell>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#6e6e73', fontSize: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {children}
    </div>
  )
}
