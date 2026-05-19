/**
 * Customer Eye View — what a potential customer sees when they
 * research this restaurant. Pulls the latest narrated report from
 * customer_eye_view_runs and renders it. If none exists, shows a CTA
 * to run the first one.
 *
 * Phase 1 only renders text + structured findings. Phase 2 will add
 * screenshots, Phase 3 will add competitor comparisons.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, Eye, AlertTriangle, CheckCircle2,
  ArrowLeft, Clock,
} from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLatestCustomerEyeView } from '@/lib/customer-eye-view'
import RunButton from './run-button'

export const dynamic = 'force-dynamic'

export default async function CustomerViewPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  /* Resolve client (same pattern as audit page). */
  let clientId: string | null = null
  let clientName = 'your restaurant'
  let clientSlug: string | undefined

  let useOverride = false
  if (params.client) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle() as { data: { role: string } | null }
    useOverride = profile?.role === 'admin' || profile?.role === 'super_admin'
  }

  if (useOverride && params.client) {
    const { data: c } = await admin
      .from('clients')
      .select('id, name')
      .eq('slug', params.client)
      .maybeSingle() as { data: { id: string; name: string } | null }
    if (c) {
      clientId = c.id
      clientName = c.name
      clientSlug = params.client
    }
  }

  if (!clientId) {
    const { data: cu } = await admin
      .from('client_users')
      .select('client_id, clients(name)')
      .eq('auth_user_id', user.id)
      .maybeSingle() as { data: { client_id: string; clients: { name: string } | Array<{ name: string }> | null } | null }
    if (cu?.client_id) {
      clientId = cu.client_id
      clientName = (Array.isArray(cu.clients) ? cu.clients[0]?.name : cu.clients?.name) ?? 'your restaurant'
    }
  }

  if (!clientId) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 pt-8 pb-20">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
          No client account linked to your user.
        </div>
      </div>
    )
  }

  const latest = await getLatestCustomerEyeView(clientId)

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div>
        <Link
          href={clientSlug ? `/dashboard/audit?client=${clientSlug}` : '/dashboard/audit'}
          className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to audit
        </Link>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Customer Eye View</p>
        <h1 className="text-[28px] font-semibold text-ink mt-1 flex items-center gap-2">
          <Eye className="w-7 h-7 text-brand-dark" />
          How a customer sees {clientName}
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          We had Apnosh AI play the role of a hungry local looking for somewhere to eat. Here&apos;s what they found.
        </p>
      </div>

      {!latest && (
        <div className="bg-brand-tint/40 border border-brand/30 rounded-2xl p-6 text-center">
          <Sparkles className="w-8 h-8 text-brand-dark mx-auto mb-2" />
          <p className="text-[15px] text-ink font-medium mb-1">No report yet</p>
          <p className="text-[13px] text-ink-3 mb-4">
            Run the first customer eye view for {clientName}.
          </p>
          <div className="flex justify-center">
            <RunButton clientSlug={clientSlug} hasExisting={false} />
          </div>
        </div>
      )}

      {latest && (
        <>
          {/* Header card: verdict + visit likelihood + rerun */}
          <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-shrink-0 md:w-56">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">
                  Would they visit?
                </p>
                {latest.visitLikelihood !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span className={[
                      'text-[64px] leading-none font-bold tabular-nums',
                      latest.visitLikelihood >= 70 ? 'text-emerald-600'
                        : latest.visitLikelihood >= 40 ? 'text-amber-600'
                        : 'text-rose-600',
                    ].join(' ')}>
                      {latest.visitLikelihood}
                    </span>
                    <span className="text-[16px] text-ink-3">%</span>
                  </div>
                ) : (
                  <p className="text-[15px] text-ink-2">See verdict below</p>
                )}
                <p className="text-[11px] text-ink-3 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Ran {new Date(latest.ranAt).toLocaleString()}
                </p>
                {latest.searchIntent && (
                  <p className="text-[11px] text-ink-3 mt-1">
                    Search: <span className="italic">&ldquo;{latest.searchIntent}&rdquo;</span>
                  </p>
                )}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-dark mb-2">
                  Verdict
                </p>
                <p className="text-[14.5px] text-ink leading-relaxed whitespace-pre-wrap">
                  {latest.report.verdict}
                </p>
                <div className="mt-4">
                  <RunButton clientSlug={clientSlug} hasExisting={true} />
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <Section title="Summary" body={latest.report.summary} />

          {/* First impressions */}
          <Section title="First impressions" body={latest.report.firstImpressions} />

          {/* Decision journey */}
          <Section title="The decision journey" body={latest.report.decisionJourney} />

          {/* Friction points */}
          {latest.report.frictionPoints.length > 0 && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
                What turned them off
              </p>
              <div className="space-y-3">
                {latest.report.frictionPoints.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-ink-7/30 border border-ink-7">
                    <SeverityPill severity={f.severity} />
                    <div className="flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-0.5">
                        {f.source}
                      </p>
                      <p className="text-[13.5px] text-ink leading-relaxed">{f.observation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trust signals */}
          {latest.report.trustSignals.length > 0 && (
            <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
                What earned trust
              </p>
              <div className="space-y-3">
                {latest.report.trustSignals.map((t, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 mb-0.5">
                        {t.source}
                      </p>
                      <p className="text-[13.5px] text-ink leading-relaxed">{t.observation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer meta */}
          <div className="text-[11px] text-ink-4 text-center pt-2">
            Powered by Apnosh AI · {latest.model ?? 'claude'} ·{' '}
            {latest.costCents !== null ? `$${(latest.costCents / 100).toFixed(3)}` : '—'} per run
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-6 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2">
        {title}
      </p>
      <p className="text-[14.5px] text-ink leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  )
}

function SeverityPill({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const cls = severity === 'high'
    ? 'bg-rose-100 text-rose-700'
    : severity === 'medium'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-ink-7 text-ink-2'
  return (
    <div className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${cls}`}>
      <AlertTriangle className="w-3 h-3" />
      {severity}
    </div>
  )
}
