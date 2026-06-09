/**
 * Admin queue for the "Get Featured" lead funnel.
 *
 * Inbound applications from the public site (/featured) land in
 * feature_intake. New leads surface first; contacted, qualified, and
 * archived collapse below. A side panel shows newsletter signups.
 */

import { redirect } from 'next/navigation'
import {
  Mail, Phone, Clock, Utensils, MapPin, Flame, Mailbox,
} from 'lucide-react'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  FeatureIntake, FeatureIntakeStatus, FeatureIntakeLeadScore, NewsletterSubscriber,
} from '@/types/database'
import LeadActions from './lead-actions'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
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

  const [{ data: leadData }, { data: subData }] = await Promise.all([
    admin
      .from('feature_intake')
      .select('*')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: FeatureIntake[] | null }>,
    admin
      .from('newsletter_subscribers')
      .select('*')
      .eq('status', 'subscribed')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: NewsletterSubscriber[] | null }>,
  ])

  const leads = leadData ?? []
  const subscribers = subData ?? []

  /* Resolve slugs for converted leads so each card can link to its CRM client. */
  const convertedIds = leads.map(l => l.converted_client_id).filter((x): x is string => !!x)
  const slugById = new Map<string, string>()
  if (convertedIds.length) {
    const { data: clientRows } = await admin
      .from('clients')
      .select('id, slug')
      .in('id', convertedIds) as { data: { id: string; slug: string }[] | null }
    for (const c of clientRows ?? []) slugById.set(c.id, c.slug)
  }

  const fresh = leads.filter(l => l.status === 'new')
  const contacted = leads.filter(l => l.status === 'contacted')
  const qualified = leads.filter(l => l.status === 'qualified')
  const converted = leads.filter(l => l.status === 'converted')
  const archived = leads.filter(l => l.status === 'archived')

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-6 pb-20">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Admin</p>
        <h1 className="text-[24px] font-semibold text-ink mt-1">Leads</h1>
        <p className="text-ink-3 text-sm mt-1">
          {fresh.length} new · {contacted.length} contacted · {qualified.length} qualified · {converted.length} in CRM · {archived.length} archived
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6">
          {leads.length === 0 && (
            <div className="bg-white border border-ink-6 rounded-2xl p-8 text-center text-[13px] text-ink-3">
              No leads yet. Share apnosh.com/featured to start the funnel.
            </div>
          )}

          {fresh.length > 0 && (
            <Section title="New" count={fresh.length}>
              {fresh.map(l => <LeadCard key={l.id} lead={l} />)}
            </Section>
          )}
          {contacted.length > 0 && (
            <Section title="Contacted" count={contacted.length}>
              {contacted.map(l => <LeadCard key={l.id} lead={l} />)}
            </Section>
          )}
          {qualified.length > 0 && (
            <Section title="Qualified" count={qualified.length}>
              {qualified.map(l => <LeadCard key={l.id} lead={l} />)}
            </Section>
          )}
          {converted.length > 0 && (
            <Section title="In CRM" count={converted.length}>
              {converted.map(l => (
                <LeadCard key={l.id} lead={l} compact clientSlug={slugById.get(l.converted_client_id ?? '') ?? null} />
              ))}
            </Section>
          )}
          {archived.length > 0 && (
            <Section title="Archived" count={archived.length}>
              {archived.map(l => <LeadCard key={l.id} lead={l} compact />)}
            </Section>
          )}
        </div>

        <NewsletterPanel subscribers={subscribers} />
      </div>
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

function LeadCard({ lead, compact = false, clientSlug = null }: { lead: FeatureIntake; compact?: boolean; clientSlug?: string | null }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-ink-7 flex items-center justify-center flex-shrink-0">
          <Utensils className="w-5 h-5 text-ink-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <p className="text-[15px] font-semibold text-ink">{lead.restaurant_name}</p>
            <ScorePill score={lead.lead_score} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-ink-3 mb-3">
            <span className="inline-flex items-center gap-1">
              {lead.contact_name} · {lead.role}
            </span>
            <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-ink-2">
              <Mail className="w-3 h-3" />
              {lead.email}
            </a>
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-ink-2">
                <Phone className="w-3 h-3" />
                {lead.phone}
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {lead.neighborhood}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(lead.created_at).toLocaleDateString()}
            </span>
          </div>

          {!compact && (
            <>
              {(lead.concept || lead.years_open) && (
                <div className="flex flex-wrap gap-3 text-[11.5px] text-ink-3 mb-3">
                  {lead.concept && <span>Concept: {lead.concept}</span>}
                  {lead.years_open && <span>Open: {lead.years_open}</span>}
                </div>
              )}
              <p className="text-[13px] text-ink-2 leading-relaxed mb-3 whitespace-pre-wrap">{lead.story}</p>
              {lead.anything_else && (
                <div className="text-[11.5px] text-ink-3 bg-ink-7/30 rounded-lg px-3 py-2 mb-1">
                  <span className="font-semibold">Anything else:</span> {lead.anything_else}
                </div>
              )}
            </>
          )}

          <LeadActions leadId={lead.id} status={lead.status} clientSlug={clientSlug} />
        </div>
      </div>
    </div>
  )
}

function ScorePill({ score }: { score: FeatureIntakeLeadScore | null }) {
  if (!score) return null
  const map: Record<FeatureIntakeLeadScore, string> = {
    hot: 'bg-rose-100 text-rose-800',
    warm: 'bg-amber-100 text-amber-800',
    low: 'bg-ink-7 text-ink-3',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${map[score]}`}>
      {score === 'hot' && <Flame className="w-2.5 h-2.5" />}
      {score}
    </span>
  )
}

function NewsletterPanel({ subscribers }: { subscribers: NewsletterSubscriber[] }) {
  return (
    <aside className="bg-white border border-ink-6 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Mailbox className="w-4 h-4 text-ink-3" />
        <p className="text-[13px] font-semibold text-ink">Newsletter</p>
      </div>
      <p className="text-[11.5px] text-ink-3 mb-4">{subscribers.length} subscribed</p>
      {subscribers.length === 0 ? (
        <p className="text-[12px] text-ink-3">No subscribers yet.</p>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto">
          {subscribers.map(s => (
            <div key={s.id} className="text-[12px]">
              <a href={`mailto:${s.email}`} className="text-ink-2 hover:text-brand-dark truncate block">
                {s.email}
              </a>
              {s.name && <span className="text-[11px] text-ink-4">{s.name}</span>}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
