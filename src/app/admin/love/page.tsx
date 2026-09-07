/**
 * /admin/love — the instrument for "do the twenty love it?".
 *
 * One row per client, five columns, no charts and no score. Staff only; there is no owner-facing
 * version of this page and there should not be one — an owner being measured is not the same
 * product as an owner being served.
 *
 *   Weeks active      how many of the last four weeks they opened the app at all (owner_sessions)
 *   Wins opened       of the wins fired in the last 30 days, how many they opened or shared
 *   This week's line  is there one true sentence to tell them this week, and what does it say
 *   Report opened     did they open the report the 1st-of-the-month email pushed
 *   Last order        where their newest order stands, in the SAME words the owner reads
 *
 * EVERY COLUMN CAN SAY "WE CANNOT SAY". Wins opened is null before migration 257 and prints "—",
 * not 0, because nobody-opened-one and we-cannot-count are different answers and a zero here
 * would read as churn. The report column is empty before migration 260. Nothing on this page
 * guesses.
 *
 * The last-order words come straight from the promises ledger (src/lib/promises/lines.ts), so a
 * strategist reading this row and the owner reading their card are reading the same sentence.
 */

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { weeksActiveOfLast4, winsOpenedOfLast30 } from '@/lib/love/metrics'
import { weeklySentence } from '@/lib/love/sentence'
import { getPromiseRows } from '@/lib/promises/read'
import { PILL_FOR } from '@/lib/promises/lines'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  name: string
  slug: string | null
  weeks: number
  wins: number | null
  sentence: string | null
  reportMonth: string | null
  reportOpened: boolean
  lastOrder: string | null
}

/** The newest report we pushed this client, and whether they opened it. Empty before 260. */
async function lastReport(admin: ReturnType<typeof createAdminClient>, clientId: string) {
  const { data, error } = await admin
    .from('owner_reports')
    .select('month, opened_at')
    .eq('client_id', clientId)
    .order('month', { ascending: false })
    .limit(1)
  if (error || !data?.length) return { month: null as string | null, opened: false }
  return { month: String(data[0].month), opened: !!data[0].opened_at }
}

export default async function AdminLovePage() {
  await requireAdminUser()
  const admin = createAdminClient()

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .neq('status', 'churned')
    .order('name')
    .limit(60)

  const rows: Row[] = await Promise.all(
    ((clients ?? []) as { id: string; name: string; slug: string | null }[]).map(async (c) => {
      const [weeks, wins, sentence, report, promises] = await Promise.all([
        weeksActiveOfLast4(c.id),
        winsOpenedOfLast30(c.id),
        weeklySentence(c.id).catch(() => null),
        lastReport(admin, c.id).catch(() => ({ month: null as string | null, opened: false })),
        getPromiseRows(c.id, 1).catch(() => []),
      ])
      const p = promises[0]
      return {
        id: c.id, name: c.name, slug: c.slug,
        weeks, wins, sentence,
        reportMonth: report.month, reportOpened: report.opened,
        lastOrder: p ? `${PILL_FOR[p.state] ?? p.value} · ${p.label}` : null,
      }
    }),
  )

  const active = rows.filter((r) => r.weeks > 0).length

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <Heart className="w-6 h-6 text-brand" />
          Love
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Does the product give each business something back? {active} of {rows.length} opened the
          app in the last four weeks. A dash means we cannot count it yet, not zero.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-2 text-ink-3">
            <tr>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Client</th>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Weeks active</th>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Wins opened</th>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">This week&rsquo;s line</th>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Report</th>
              <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Last order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-ink-6 align-top">
                <td className="py-2 px-4 text-[12.5px] text-ink-2">
                  {r.slug
                    ? <Link href={`/admin/clients/${r.slug}`} className="font-medium hover:text-brand">{r.name}</Link>
                    : r.name}
                </td>
                <td className="py-2 px-4 text-[12.5px] text-ink-2 whitespace-nowrap">{r.weeks} of 4</td>
                <td className="py-2 px-4 text-[12.5px] text-ink-2">{r.wins === null ? '—' : r.wins}</td>
                <td className="py-2 px-4 text-[12px] text-ink-3 max-w-md">{r.sentence ?? '—'}</td>
                <td className="py-2 px-4 text-[12px] text-ink-3 whitespace-nowrap">
                  {r.reportMonth ? `${r.reportMonth} · ${r.reportOpened ? 'opened' : 'not opened'}` : '—'}
                </td>
                <td className="py-2 px-4 text-[12px] text-ink-3 max-w-xs">{r.lastOrder ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 px-4 text-center text-[12.5px] text-ink-3">No clients yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
