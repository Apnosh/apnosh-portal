import 'server-only'
/**
 * team/reply-timer — how long the owner waited for a person, measured, not shown.
 *
 * The reply promise (src/lib/reply-promise.ts) is a claim. This is the only thing that can ever
 * make it true or false. It runs DARK in this move on purpose: the plan shows the timer to owners
 * only after it has been true for two weeks, so nothing here renders anywhere owner-facing.
 *
 * No new table. `messages` already stamps who sent each line (sender_role) and when (created_at,
 * migration 001), so the lag is a read of rows we already write. A thread with an owner message
 * and no staff answer yet has no lag — it is a wait still running, not a zero.
 */
import { createAdminClient } from '@/lib/supabase/admin'

const MS_PER_MIN = 60_000

interface Line {
  sender_role: string | null
  created_at: string
}

/** Minutes from the owner's first message on this thread to the first staff answer. Null when
 *  the thread has no owner message, or nobody has answered yet. */
export async function firstReplyLagMinutes(threadId: string): Promise<number | null> {
  if (!threadId) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('messages')
      .select('sender_role, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(200)
    return lagFrom((data ?? []) as Line[])
  } catch (e) {
    console.warn('[reply-timer] read failed:', (e as Error)?.message)
    return null
  }
}

/** The pure half, so the rule is readable: first owner line, then the first staff line after it. */
export function lagFrom(lines: Line[]): number | null {
  const asked = lines.find((m) => (m.sender_role ?? 'client') === 'client')
  if (!asked) return null
  const answered = lines.find((m) => (m.sender_role ?? 'client') !== 'client' && m.created_at > asked.created_at)
  if (!answered) return null
  const mins = Math.round((Date.parse(answered.created_at) - Date.parse(asked.created_at)) / MS_PER_MIN)
  return mins >= 0 ? mins : null
}

/**
 * The MIDDLE wait across this client's threads over the last `days`. Median, not average, so one
 * thread nobody answered over a weekend does not decide the number. Null when no thread in the
 * window has both an owner message and an answer — an honest "we do not know yet", never a 0.
 */
export async function replyLagMinutesMedian(clientId: string, days = 30): Promise<number | null> {
  if (!clientId) return null
  try {
    const admin = createAdminClient()
    const { data: biz } = await admin.from('businesses').select('id').eq('client_id', clientId)
    const bizIds = ((biz ?? []) as { id: string }[]).map((b) => b.id)
    if (!bizIds.length) return null

    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data } = await admin
      .from('messages')
      .select('thread_id, sender_role, created_at')
      .in('business_id', bizIds)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1000)

    const byThread = new Map<string, Line[]>()
    for (const m of (data ?? []) as (Line & { thread_id: string })[]) {
      const arr = byThread.get(m.thread_id) ?? []
      arr.push(m)
      byThread.set(m.thread_id, arr)
    }
    const lags: number[] = []
    for (const lines of byThread.values()) {
      const lag = lagFrom(lines)
      if (lag !== null) lags.push(lag)
    }
    return median(lags)
  } catch (e) {
    console.warn('[reply-timer] median failed:', (e as Error)?.message)
    return null
  }
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}
