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
import MvpHome, { type MvpHomeData } from '@/components/mvp/mvp-home'
import { transformHome } from '@/components/mvp/home-transform'
import MvpShell from '@/components/mvp/mvp-shell'
import type { Suggestion } from '@/lib/dashboard/suggestions'

export default function DashboardHomePage() {
  const { client, loading: clientLoading } = useClient()
  const [data, setData] = useState<MvpHomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // AI-tailored suggestion stack — fetched alongside the load and merged in
  // when ready, so Home paints instantly with the deterministic set first.
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[] | null>(null)
  // Whether the richer server suggestions have settled (success or fail). Home
  // holds off on "all caught up" until this is true so it never flashes the
  // message while a real card is still on its way.
  const [suggestionsReady, setSuggestionsReady] = useState(false)

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetch(`/api/dashboard/load?clientId=${client.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!live) return
        const d = transformHome(json.homeMetrics, json.agenda, client.name ?? '·', undefined, json.comingUp)
        d.activity = json.sinceLastChecked ?? []
        d.upcomingWork = json.upcomingWork ?? []
        setData(d)
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [client?.id, client?.name])

  // Tailored suggestions — its own effect, keyed on the client id alone, so a
  // background name refresh never resets the deck to its loading placeholder.
  // A settled response is AUTHORITATIVE even when empty: it replaces the instant
  // set from the transform (so a since-cleared "needs you" card can't linger).
  // Only an outright fetch failure keeps the instant set as a soft fallback.
  useEffect(() => {
    if (!client?.id) return
    let live = true
    setAiSuggestions(null)
    setSuggestionsReady(false)
    fetch(`/api/dashboard/suggestions?clientId=${client.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!live) return; if (j) setAiSuggestions(j.suggestions ?? []); setSuggestionsReady(true) })
      .catch(() => { if (live) setSuggestionsReady(true) })
    return () => { live = false }
  }, [client?.id])

  const view = data ? (aiSuggestions !== null ? { ...data, suggestions: aiSuggestions } : data) : null

  return (
    <MvpShell active="home" unread={data?.approvals?.length ?? 0}>
      {clientLoading || (!data && !error) ? (
        <Centered>Loading your numbers…</Centered>
      ) : error ? (
        <Centered>Couldn&apos;t load: {error}</Centered>
      ) : view ? (
        <MvpHome data={view} showHeader={false} clientId={client?.id} suggestionsReady={suggestionsReady} />
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
