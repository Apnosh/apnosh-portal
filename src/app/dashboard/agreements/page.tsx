'use client'

/**
 * Owner Agreements list — apnosh-mvp surface. Reached from More -> Agreements.
 * Grouped by status (needs signature first), each row opening the detail/sign
 * screen. Loads the owner's business, then its non-draft agreements.
 */

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow, MvpPill, C, type PillTone } from '@/components/mvp/mvp-detail'

interface AgreementRow {
  id: string
  agreement_type: string
  status: string
  custom_fields: Record<string, string>
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  pdf_url: string | null
  created_at: string
}

function statusInfo(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case 'sent':
    case 'viewed': return { label: 'Ready to sign', tone: 'warn' }
    case 'signed': return { label: 'Signed', tone: 'good' }
    case 'expired': return { label: 'Expired', tone: 'bad' }
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral' }
    default: return { label: 'Draft', tone: 'neutral' }
  }
}

function typeLabel(t: string): string {
  return t === 'master_service_agreement' ? 'Master Service Agreement'
    : t === 'scope_amendment' ? 'Scope Amendment'
    : 'Addendum'
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
}

export default function ClientAgreementsPage() {
  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function run() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()
      if (!business) { setLoading(false); return }

      const { data } = await supabase
        .from('agreements')
        .select('*')
        .eq('business_id', business.id)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })

      setAgreements((data as AgreementRow[]) || [])
      setLoading(false)
    }
    run()
  }, [])

  const pending = agreements.find((a) => a.status === 'sent' || a.status === 'viewed')
  const needsSign = agreements.filter((a) => a.status === 'sent' || a.status === 'viewed')
  const rest = agreements.filter((a) => a.status !== 'sent' && a.status !== 'viewed')

  const row = (a: AgreementRow) => {
    const st = statusInfo(a.status)
    const sub = a.signed_at
      ? `Signed ${fmt(a.signed_at)}${a.signed_by_name ? ` by ${a.signed_by_name}` : ''}`
      : [a.custom_fields?.monthly_rate ? `${a.custom_fields.monthly_rate}/mo` : '', a.sent_at ? `Sent ${fmt(a.sent_at)}` : ''].filter(Boolean).join(' · ')
    return (
      <MvpRow
        key={a.id}
        icon={<FileText size={18} />}
        label={typeLabel(a.agreement_type)}
        sub={sub || undefined}
        href={`/dashboard/agreements/${a.id}`}
        right={<MvpPill tone={st.tone} label={st.label} />}
      />
    )
  }

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Agreements" subtitle="View and sign your service agreements" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {loading ? (
          <div style={{ marginTop: 4 }}>
            {[64, 120].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
            <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
          </div>
        ) : agreements.length === 0 ? (
          <div style={{ background: '#fff', border: `1px dashed ${C.green}`, borderRadius: 16, padding: '30px 22px', textAlign: 'center', marginTop: 4 }}>
            <FileText size={26} color={C.greenDk} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>No agreements yet</div>
            <div style={{ fontSize: 13, color: C.mute, marginTop: 5, lineHeight: 1.45 }}>Your service agreement will appear here once your account is set up.</div>
          </div>
        ) : (
          <>
            {pending && (
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 22 }}>
                <MvpPill tone="warn" label="Ready to sign" />
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginTop: 9 }}>An agreement is waiting for your signature</div>
                <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>
                  {[pending.custom_fields?.monthly_rate ? `${pending.custom_fields.monthly_rate}/mo` : '', pending.sent_at ? `Sent ${fmt(pending.sent_at)}` : ''].filter(Boolean).join(' · ')}
                </div>
                <a href={`/dashboard/agreements/${pending.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13, height: 46, borderRadius: 13, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                  Review and sign
                </a>
              </div>
            )}
            {needsSign.length > 0 && <MvpGroup title="Needs signature">{needsSign.map(row)}</MvpGroup>}
            {rest.length > 0 && <MvpGroup title={needsSign.length > 0 ? 'History' : 'Your agreements'}>{rest.map(row)}</MvpGroup>}
          </>
        )}
      </div>
    </MvpShell>
  )
}
