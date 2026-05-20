/**
 * Admin vendor list. Click a vendor to manage their profile +
 * portfolio. Phase 1 supports portfolio uploads; Phase 3 will add
 * vendor-self upload.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, User, ShieldCheck, ArrowRight } from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface VendorRow {
  id: string
  slug: string
  name: string
  vendor_type: 'individual' | 'company' | 'apnosh'
  verified: boolean
  tier: string
  bookable: boolean
  total_bookings: number
  created_at: string
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
    .select('id, slug, name, vendor_type, verified, tier, bookable, total_bookings, created_at')
    .order('is_apnosh', { ascending: false })
    .order('verified', { ascending: false })
    .order('created_at', { ascending: false }) as { data: VendorRow[] | null }

  const vendors = data ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[24px] font-semibold text-ink mt-1">Vendors</h1>
        <p className="text-ink-3 text-sm mt-1">{vendors.length} total · manage profiles + portfolios</p>
      </div>

      <div className="space-y-2">
        {vendors.map(v => {
          const Icon = v.vendor_type === 'individual' ? User : Building2
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
                  {!v.bookable && (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                      Hidden
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  /marketplace/{v.slug} · {v.total_bookings} bookings · {v.tier}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-ink-3" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
