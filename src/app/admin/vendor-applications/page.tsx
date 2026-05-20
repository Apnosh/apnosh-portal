/**
 * Admin queue for vendor + freelancer applications.
 *
 * Lists pending applications first, with reviewing, approved, and
 * declined collapsed below. One-click approve creates a vendor row;
 * decline records the reason.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Mail, Phone, ExternalLink, Clock, CheckCircle2, User, Building2,
} from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ApplicationActions from './application-actions'

export const dynamic = 'force-dynamic'

interface Application {
  id: string
  applicant_type: 'individual' | 'company'
  display_name: string
  email: string
  phone: string | null
  categories: string[]
  service_area: string[]
  portfolio_url: string | null
  social_handle: string | null
  pitch: string
  typical_rate: string | null
  restaurant_experience_years: number | null
  status: 'pending' | 'reviewing' | 'approved' | 'declined' | 'withdrawn'
  resolved_at: string | null
  vendor_id: string | null
  admin_notes: string | null
  created_at: string
}

export default async function VendorApplicationsPage() {
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
    .from('vendor_applications')
    .select('*')
    .order('created_at', { ascending: false }) as { data: Application[] | null }

  const apps = data ?? []
  const pending = apps.filter(a => a.status === 'pending' || a.status === 'reviewing')
  const approved = apps.filter(a => a.status === 'approved')
  const declined = apps.filter(a => a.status === 'declined' || a.status === 'withdrawn')

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[24px] font-semibold text-ink mt-1">Vendor applications</h1>
        <p className="text-ink-3 text-sm mt-1">
          {pending.length} pending · {approved.length} approved · {declined.length} declined
        </p>
      </div>

      {pending.length === 0 && approved.length === 0 && declined.length === 0 && (
        <div className="bg-white border border-ink-6 rounded-2xl p-8 text-center text-[13px] text-ink-3">
          No applications yet. Share /become-a-vendor to start the funnel.
        </div>
      )}

      {pending.length > 0 && (
        <Section title="Pending review" count={pending.length}>
          {pending.map(a => <ApplicationCard key={a.id} app={a} />)}
        </Section>
      )}

      {approved.length > 0 && (
        <Section title="Approved" count={approved.length}>
          {approved.map(a => <ApplicationCard key={a.id} app={a} compact />)}
        </Section>
      )}

      {declined.length > 0 && (
        <Section title="Declined" count={declined.length}>
          {declined.map(a => <ApplicationCard key={a.id} app={a} compact />)}
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
        {title} ({count})
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ApplicationCard({ app, compact = false }: { app: Application; compact?: boolean }) {
  const TypeIcon = app.applicant_type === 'individual' ? User : Building2

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-ink-7 flex items-center justify-center flex-shrink-0">
          <TypeIcon className="w-5 h-5 text-ink-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <p className="text-[15px] font-semibold text-ink">{app.display_name}</p>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-ink-7 text-ink-2 px-1.5 py-0.5 rounded">
              {app.applicant_type === 'individual' ? 'Freelancer' : 'Agency'}
            </span>
            <StatusPill status={app.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-3 mb-3">
            <a href={`mailto:${app.email}`} className="inline-flex items-center gap-1 hover:text-ink-2">
              <Mail className="w-3 h-3" />
              {app.email}
            </a>
            {app.phone && (
              <a href={`tel:${app.phone}`} className="inline-flex items-center gap-1 hover:text-ink-2">
                <Phone className="w-3 h-3" />
                {app.phone}
              </a>
            )}
            {app.portfolio_url && (
              <a href={app.portfolio_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-ink-2">
                <ExternalLink className="w-3 h-3" />
                Portfolio
              </a>
            )}
            {app.social_handle && (
              <span className="inline-flex items-center gap-1">
                {app.social_handle}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(app.created_at).toLocaleDateString()}
            </span>
          </div>

          {!compact && (
            <>
              <div className="flex flex-wrap gap-1 mb-3">
                {app.categories.map(c => (
                  <span key={c} className="text-[10.5px] font-medium bg-ink-7 text-ink-2 px-2 py-0.5 rounded-full">
                    {c.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <p className="text-[13px] text-ink-2 leading-relaxed mb-3 whitespace-pre-wrap">{app.pitch}</p>
              {(app.typical_rate || app.restaurant_experience_years !== null) && (
                <div className="flex flex-wrap gap-3 text-[11.5px] text-ink-3 mb-3">
                  {app.typical_rate && <span>Rate: {app.typical_rate}</span>}
                  {app.restaurant_experience_years !== null && (
                    <span>{app.restaurant_experience_years} years restaurant experience</span>
                  )}
                </div>
              )}
            </>
          )}

          {app.admin_notes && (
            <div className="mt-2 text-[11.5px] text-ink-3 bg-ink-7/30 rounded-lg px-3 py-2">
              <span className="font-semibold">Admin note:</span> {app.admin_notes}
            </div>
          )}

          {app.vendor_id && (
            <p className="text-[11.5px] text-emerald-700 mt-2 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Vendor row created
              <Link href={`/admin/vendor-applications`} className="underline">view</Link>
            </p>
          )}

          {(app.status === 'pending' || app.status === 'reviewing') && (
            <ApplicationActions applicationId={app.id} status={app.status} />
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: Application['status'] }) {
  const map: Record<Application['status'], { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
    reviewing: { label: 'Reviewing', cls: 'bg-blue-100 text-blue-800' },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
    declined: { label: 'Declined', cls: 'bg-rose-100 text-rose-800' },
    withdrawn: { label: 'Withdrawn', cls: 'bg-ink-7 text-ink-3' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}
