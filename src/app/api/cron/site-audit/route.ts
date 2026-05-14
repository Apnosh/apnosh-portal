/**
 * Weekly Vercel cron: run the site audit (broken links, schema,
 * page speed, stale content) for every client that has a website
 * URL on file. Results land in site_audits and surface on the
 * Website Overview audit panel.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSiteAudit } from '@/lib/site-audit'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 600

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: Request) {
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret')
  const headerSecret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && querySecret !== CRON_SECRET && headerSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: clients } = await admin
    .from('clients')
    .select('id, website')
    .not('website', 'is', null)

  const results: Array<{ clientId: string; ok: boolean; audits?: number; error?: string }> = []
  for (const c of (clients ?? []) as Array<{ id: string; website: string }>) {
    try {
      const r = await runSiteAudit(c.id)
      results.push({ clientId: c.id, ok: r.ok, audits: r.audits?.length, error: r.error })

      /* Notify owners when any audit comes back as 'fail'. Skip
         'warn' to avoid noise; owners can see warnings on the audit
         panel themselves. */
      if (r.ok && r.audits) {
        const fails = r.audits.filter(a => a.status === 'fail')
        if (fails.length > 0) {
          const { data: owners } = await admin
            .from('businesses')
            .select('owner_id')
            .eq('client_id', c.id)
          const ownerIds = (owners ?? []).map(o => o.owner_id as string).filter(Boolean)
          for (const uid of ownerIds) {
            await createNotification({
              userId: uid,
              kind: 'site_audit',
              title: `Site audit found ${fails.length} issue${fails.length === 1 ? '' : 's'}`,
              body: fails.map(f => f.summary).join(' · '),
              link: '/dashboard/website',
            })
          }
        }
      }
    } catch (err) {
      results.push({ clientId: c.id, ok: false, error: (err as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    clientsAudited: results.length,
    results,
  })
}
