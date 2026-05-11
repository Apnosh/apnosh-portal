/**
 * /admin/clients/[slug]/plan — strategist sets the client's plan tier,
 * monthly rate, and per-service-area monthly allotments.
 *
 * Once saved, the Plan card on /dashboard/social appears for that
 * client showing "X of Y posts used this month" with a progress bar.
 */

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CircleCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PlanForm from './plan-form'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PlanPage({ params }: PageProps) {
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
    .select('id, name, slug, tier, monthly_rate, allotments, billing_status')
    .eq('slug', slug)
    .maybeSingle()
  if (!client) notFound()

  // Usage this month for the readout
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: socialUsed } = await admin
    .from('scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)
    .gte('created_at', monthStart)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <Link
        href={`/admin/clients/${slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to {client.name as string}
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <CircleCheck className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Plan · {client.name as string}
          </p>
        </div>
        <h1 className="text-[28px] font-bold text-ink tracking-tight leading-tight">
          Monthly plan
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Set the client&rsquo;s tier, monthly rate, and per-service allotments. Anything
          outside the plan should be quoted instead.
        </p>
      </header>

      <PlanForm
        clientId={client.id as string}
        initialTier={(client.tier as string | null) ?? null}
        initialMonthlyRate={(client.monthly_rate as number | null) ?? null}
        initialAllotments={(client.allotments as Record<string, number> | null) ?? {}}
        currentSocialUsage={socialUsed ?? 0}
      />
    </div>
  )
}
