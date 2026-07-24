/**
 * Admin creators/vendors list. Click one to manage their profile, portfolio,
 * and see their delivered-work ratings. The rating shown per row is the live
 * aggregate from real work_ratings rows — creators with none show "No ratings
 * yet" (never a fabricated number).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, User, ShieldCheck, ArrowRight, Star } from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorRatingAggregates } from '@/lib/campaigns/work-ratings'
import AddCreator from './add-creator'
import PendingReview from './pending-review'

export const dynamic = 'force-dynamic'

interface VendorRow {
  id: string
  slug: string
  name: string
  vendor_type: 'individual' | 'company' | 'apnosh'
  craft: string | null
  verified: boolean
  tier: string
  bookable: boolean
  total_bookings: number
  created_at: string
  person_id: string | null
}

export default async function AdminVendorsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle() as { data: { role: string } | null }
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data } = await admin
    .from('vendors')
    .select('id, slug, name, vendor_type, craft, verified, tier, bookable, total_bookings, created_at, person_id')
    .order('is_apnosh', { ascending: false })
    .order('verified', { ascending: false })
    .order('created_at', { ascending: false }) as { data: VendorRow[] | null }

  const vendors = data ?? []
  const ratings = await creatorRatingAggregates(vendors.map(v => v.id))
  // Review gate: self-serve creators sign up with a login but out of the store (bookable=false).
  const pending = vendors
    .filter(v => !v.bookable && v.person_id)
    .map(v => ({ id: v.id, slug: v.slug, name: v.name, craft: v.craft }))

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
          <h1 className="text-[24px] font-semibold text-ink mt-1">Creators</h1>
          <p className="text-ink-3 text-sm mt-1">{vendors.length} total · profiles, portfolios, and delivered-work ratings</p>
        </div>
        <AddCreator />
      </div>

      <PendingReview initial={pending} />

      <div className="space-y-2">
        {vendors.map(v => {
          const Icon = v.vendor_type === 'individual' ? User : Building2
          const agg = ratings.get(v.id) ?? null
          return (
            <Link
              key={v.id}
              href={`/admin/vendors/${v.slug}`}
              className="bg-white rounded-xl border border-ink-6 hover:border-ink-4 transition p-4 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-ink-7 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-ink-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-ink truncate">{v.name}</p>
                  {v.verified && (
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-dark flex-shrink-0" />
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-ink-7 text-ink-2 px-1.5 py-0.5 rounded">
                    {v.vendor_type}
                  </span>
                  {v.craft && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                      {v.craft}
                    </span>
                  )}
                  {!v.bookable && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      Not live
                    </span>
                  )}
                  {!v.person_id && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      No login
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  /marketplace/{v.slug} · {v.total_bookings} bookings · {v.tier}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 text-[12px]">
                {agg ? (
                  <>
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    <span className="font-semibold text-ink tabular-nums">{agg.avg}</span>
                    <span className="text-ink-3">({agg.count})</span>
                  </>
                ) : (
                  <span className="text-ink-3 text-[11px]">No ratings yet</span>
                )}
              </div>
              <ArrowRight className="w-4 h-4 text-ink-3" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
