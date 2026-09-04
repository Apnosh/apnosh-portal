'use client'

/**
 * /dashboard/insights/posts — every post, newest first.
 *
 * Insights shows the five newest with a "View all" through to here. Rows render via the SAME
 * exported PostRow the summary uses, and the data comes through the same server-side mapper,
 * so the two screens cannot drift about what a post reached or what kind of post it is.
 *
 * Pull down to refresh: the owner asked for the phone gesture rather than a button. A tug
 * forces a real vendor pull (skipping the 90 minute interval the automatic refresh respects),
 * then reloads the list from the top.
 *
 * /dashboard/insights is already in the layout's MVP_PREFIX, so this route owns its own
 * full-screen chrome and the layout adds nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { PostRow, POSTS_FOOTNOTE, type InsightsPost } from '@/components/mvp/mvp-insights'
import { usePullToRefresh, PullIndicator } from '@/components/mvp/pull-to-refresh'

const C = { ink: '#16181d', mute: '#6b7280', faint: '#9aa1ab', line: '#e8e9ec', bg: '#f7f7f9', greenDk: '#2f8f70' }
const PAGE = 30

export default function AllPostsPage() {
  const router = useRouter()
  const { client, loading: clientLoading } = useClient()
  const [posts, setPosts] = useState<InsightsPost[] | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement | null>(null)

  const fetchPage = useCallback(async (offset: number): Promise<InsightsPost[]> => {
    if (!client?.id) return []
    const r = await fetch(`/api/dashboard/social-posts?clientId=${client.id}&offset=${offset}&limit=${PAGE}`, { cache: 'no-store' })
    if (!r.ok) throw new Error('Could not load posts')
    const j = await r.json()
    setTotal(j.total ?? 0)
    setHasMore(!!j.hasMore)
    return (j.posts ?? []) as InsightsPost[]
  }, [client?.id])

  useEffect(() => {
    if (!client?.id) return
    let live = true
    setError(null)
    fetchPage(0)
      .then((p) => { if (live) setPosts(p) })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Could not load posts') })
    return () => { live = false }
  }, [client?.id, fetchPage])

  const loadMore = async () => {
    if (busy || !posts) return
    setBusy(true)
    try {
      const next = await fetchPage(posts.length)
      setPosts([...posts, ...next])
    } catch { /* the list already on screen stays */ }
    setBusy(false)
  }

  /* The gesture. force=1 tells the route this is the owner asking, not a routine view, so it
   * drops from the 90 minute interval to a 30 second floor. Either way we reload the list, so
   * a pull that finds nothing new still ends with genuinely current rows on screen. */
  const onRefresh = useCallback(async () => {
    if (!client?.id) return { ok: false, changed: false }
    try {
      const r = await fetch(`/api/dashboard/social-refresh?clientId=${client.id}&force=1`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      const fresh = await fetchPage(0)
      setPosts(fresh)
      return { ok: true, changed: !!j?.synced }
    } catch {
      return { ok: false, changed: false }
    }
  }, [client?.id, fetchPage])

  const { pull, phase } = usePullToRefresh(useCallback(() => scroller.current, []), onRefresh)

  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard/insights') }
  const loading = clientLoading || (!posts && !error)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 0 40px rgba(0,0,0,0.06)', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px 12px 6px', borderBottom: `1px solid ${C.line}`, background: '#fff' }}>
          <button onClick={back} aria-label="Back" style={{ width: 38, height: 38, borderRadius: 99, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.ink }}><ChevronLeft size={24} /></button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>All posts</div>
            {total > 0 && <div style={{ fontSize: 11.5, color: C.faint }}>{total} across your connected accounts</div>}
          </div>
        </div>

        <div ref={scroller} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, padding: '10px 12px 26px' }}>
          <PullIndicator pull={pull} phase={phase} />

          {loading && <div style={{ padding: '40px 0', textAlign: 'center', color: C.faint, fontSize: 13 }}>Loading your posts…</div>}
          {error && !loading && <div style={{ padding: '30px 4px', color: C.mute, fontSize: 13 }}>{error}</div>}
          {!loading && !error && posts && posts.length === 0 && (
            <div style={{ padding: '40px 6px', textAlign: 'center', color: C.faint, fontSize: 13, lineHeight: 1.5 }}>
              No posts yet. Once you post on a connected account, it shows up here.
            </div>
          )}

          {posts && posts.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {posts.map((p, i) => <PostRow key={p.id} p={p} first={i === 0} />)}
              </div>
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={busy}
                  style={{ width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, border: `0.5px solid ${C.line}`, background: '#fff', color: C.greenDk, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
                >
                  {busy ? 'Loading…' : `Show ${Math.min(PAGE, total - posts.length)} more`}
                </button>
              )}
              <div style={{ fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.45 }}>{POSTS_FOOTNOTE} Pull down to check for anything new.</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
