/**
 * CONNECTION DRILL WATCHER (local only, never committed)
 * ======================================================
 * Polls the prod DB every 15s for the drill client and prints a delta line
 * whenever connect state or data changes: channel_connections rows (status +
 * cached platforms), social_metrics coverage, social_posts count, gbp_locations
 * and gbp_metrics coverage. Run while the owner performs real connects.
 *
 *   npx tsx --tsconfig scripts/sim/tsconfig.json scripts/drill-watch.ts <client-id>
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const clientId = process.argv[2]
if (!clientId) { console.error('usage: drill-watch.ts <client-id>'); process.exit(1) }

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

let last = ''

async function snapshot(): Promise<string> {
  const [conns, sm, sp, gl, gm] = await Promise.all([
    admin.from('channel_connections')
      .select('channel, status, platform_account_id, metadata, last_sync_at, sync_error')
      .eq('client_id', clientId).order('channel'),
    admin.from('social_metrics').select('platform, date').eq('client_id', clientId)
      .order('date', { ascending: false }).limit(400),
    admin.from('social_posts').select('platform', { count: 'exact', head: true }).eq('client_id', clientId),
    admin.from('gbp_locations').select('location_name, gbp_location_id').eq('client_id', clientId),
    admin.from('gbp_metrics').select('date').eq('client_id', clientId)
      .order('date', { ascending: false }).limit(1),
  ])

  const lines: string[] = []
  for (const c of conns.data ?? []) {
    const plats = Array.isArray((c.metadata as { platforms?: unknown[] } | null)?.platforms)
      ? ((c.metadata as { platforms: unknown[] }).platforms).join(',') : ''
    lines.push(`CONN ${c.channel} status=${c.status} platforms=[${plats}] lastSync=${c.last_sync_at ?? 'never'}${c.sync_error ? ` ERR=${String(c.sync_error).slice(0, 80)}` : ''}`)
  }
  const byPlat = new Map<string, { n: number; latest: string }>()
  for (const r of (sm.data ?? []) as Array<{ platform: string; date: string }>) {
    const cur = byPlat.get(r.platform)
    if (cur) cur.n += 1
    else byPlat.set(r.platform, { n: 1, latest: r.date })
  }
  for (const [p, v] of [...byPlat.entries()].sort()) lines.push(`METRICS ${p}: ${v.n} day(s), latest ${v.latest}`)
  lines.push(`POSTS total=${sp.count ?? 0}`)
  for (const l of gl.data ?? []) lines.push(`GBP-LOC ${l.location_name} (${l.gbp_location_id})`)
  lines.push(`GBP-METRICS latest=${gm.data?.[0]?.date ?? 'none'}`)
  return lines.join('\n')
}

async function main() {
  console.log(`watching client ${clientId} — every 15s, only changes print\n`)
  for (;;) {
    try {
      const snap = await snapshot()
      if (snap !== last) {
        console.log(`──── ${new Date().toISOString().slice(11, 19)}Z`)
        console.log(snap + '\n')
        last = snap
      }
    } catch (e) {
      console.log(`watch error: ${e instanceof Error ? e.message : String(e)}`)
    }
    await new Promise(r => setTimeout(r, 15000))
  }
}
main()
