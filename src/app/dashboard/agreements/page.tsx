'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText, CheckCircle, Clock, Send, Eye, AlertCircle, Download
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  draft: { label: 'Draft', className: 'bg-gray-50 text-gray-600', icon: Clock },
  sent: { label: 'Ready to Sign', className: 'bg-amber-50 text-amber-700', icon: Send },
  viewed: { label: 'Ready to Sign', className: 'bg-amber-50 text-amber-700', icon: Eye },
  signed: { label: 'Signed', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  expired: { label: 'Expired', className: 'bg-red-50 text-red-600', icon: AlertCircle },
  cancelled: { label: 'Cancelled', className: 'bg-gray-50 text-gray-500', icon: AlertCircle },
}

export default function ClientAgreementsPage() {
  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!business) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('agreements')
        .select('*')
        .eq('business_id', business.id)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })

      setAgreements((data as AgreementRow[]) || [])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-48 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  const pendingAgreement = agreements.find((a) => a.status === 'sent' || a.status === 'viewed')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Agreements</h1>
        <p className="text-ink-3 text-sm mt-1">View and sign your service agreements.</p>
      </div>

      {/* Pending agreement banner */}
      {pendingAgreement && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Send className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Agreement ready for your signature</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {pendingAgreement.custom_fields?.monthly_rate && `${pendingAgreement.custom_fields.monthly_rate}/mo`}
                {' · '}Sent {pendingAgreement.sent_at ? new Date(pendingAgreement.sent_at).toLocaleDateString() : ''}
              </p>
            </div>
          </div>
          <Link
            href={`/dashboard/agreements/${pendingAgreement.id}`}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            Review & Sign
          </Link>
        </div>
      )}

      {/* Agreements list */}
      {agreements.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <FileText className="w-10 h-10 text-ink-4 mx-auto mb-3" />
          <p className="text-ink-3 text-sm">No agreements yet.</p>
          <p className="text-ink-4 text-xs mt-1">Your service agreement will appear here once your account is set up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agreements.map((a) => {
            const status = statusConfig[a.status] || statusConfig.draft
            const StatusIcon = status.icon
            const needsAction = a.status === 'sent' || a.status === 'viewed'

            return (
              <div key={a.id} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-ink">
                        {a.agreement_type === 'master_service_agreement' ? 'Master Service Agreement' :
                         a.agreement_type === 'scope_amendment' ? 'Scope Amendment' : 'Addendum'}
                      </h3>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-ink-4">
                      {a.custom_fields?.monthly_rate && <span>{a.custom_fields.monthly_rate}/mo</span>}
                      {a.signed_at && <span>Signed {new Date(a.signed_at).toLocaleDateString()}</span>}
                      {a.signed_by_name && <span>by {a.signed_by_name}</span>}
                      {!a.signed_at && a.sent_at && <span>Sent {new Date(a.sent_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.pdf_url && (
                      <a
                        href={a.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-3 hover:bg-bg-2 transition-colors flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> PDF
                      </a>
                    )}
                    <Link
                      href={`/dashboard/agreements/${a.id}`}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        needsAction
                          ? 'bg-brand hover:bg-brand-dark text-white'
                          : 'border border-ink-6 text-ink-3 hover:bg-bg-2'
                      }`}
                    >
                      {needsAction ? 'Review & Sign' : 'View'}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
