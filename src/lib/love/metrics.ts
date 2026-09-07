import 'server-only'
/**
 * love/metrics — the two numbers that say whether a business actually loves this thing.
 *
 * Not usage vanity: both are about the owner getting something back. Weeks active says they
 * keep coming back; wins opened says the proof cards we fire are actually looked at. Every
 * reader is best-effort — before migration 257 lands the tables and columns are missing, and
 * the honest answer is 0, never an exception that takes a screen down with it.
 */
import { createAdminClient } from '@/lib/supabase/admin'

const DAY = 86400000

/** How many of the last four seven-day windows had at least one owner visit (0-4). */
export async function weeksActiveOfLast4(clientId: string): Promise<number> {
  if (!clientId) return 0
  const since = new Date(Date.now() - 28 * DAY).toISOString().slice(0, 10)
  try {
    const { data, error } = await createAdminClient()
      .from('owner_sessions')
      .select('seen_on')
      .eq('client_id', clientId)
      .gte('seen_on', since)
    if (error) { console.warn('[love] owner_sessions read failed', error.message); return 0 }
    const weeks = new Set<number>()
    const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    for (const r of data ?? []) {
      const daysAgo = Math.floor((todayMs - Date.parse(`${String((r as { seen_on: string }).seen_on)}T00:00:00Z`)) / DAY)
      if (daysAgo < 0 || daysAgo > 27) continue
      weeks.add(Math.floor(daysAgo / 7))
    }
    return weeks.size
  } catch (e) {
    console.warn('[love] owner_sessions read failed', (e as Error)?.message)
    return 0
  }
}

/** Of the wins fired in the last 30 days, how many the owner opened, read or shared. */
export async function winsOpenedOfLast30(clientId: string): Promise<number> {
  if (!clientId) return 0
  const since = new Date(Date.now() - 30 * DAY).toISOString()
  const admin = createAdminClient()
  const base = () => admin
    .from('proof_cards')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('fired_at', since)
  try {
    const { count, error } = await base().or('read_at.not.is.null,opened_at.not.is.null,shared_at.not.is.null')
    if (!error) return count ?? 0
    // Pre-migration-257 opened_at / shared_at do not exist; read_at has been there since 249.
    const { count: readCount, error: readErr } = await base().not('read_at', 'is', null)
    if (readErr) { console.warn('[love] proof_cards read failed', readErr.message); return 0 }
    return readCount ?? 0
  } catch (e) {
    console.warn('[love] proof_cards read failed', (e as Error)?.message)
    return 0
  }
}
