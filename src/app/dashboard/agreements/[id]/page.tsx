'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, CheckCircle, Clock, Shield, ArrowLeft, Download
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signAgreement } from '@/lib/actions'

interface AgreementData {
  id: string
  agreement_type: string
  status: string
  rendered_content: string | null
  custom_fields: Record<string, string>
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  expires_at: string | null
  business: { name: string; legal_business_name: string | null }
}

export default function AgreementSignPage() {
  const params = useParams()
  const router = useRouter()
  const agreementId = params.id as string

  const [agreement, setAgreement] = useState<AgreementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)

  // Signing form
  const [signerName, setSignerName] = useState('')
  const [hasRead, setHasRead] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()

      // Mark as viewed
      await supabase
        .from('agreements')
        .update({ status: 'viewed', viewed_at: new Date().toISOString() })
        .eq('id', agreementId)
        .in('status', ['sent'])

      const { data } = await supabase
        .from('agreements')
        .select('*, business:businesses(name, legal_business_name)')
        .eq('id', agreementId)
        .single()

      setAgreement(data as AgreementData | null)
      if (data?.status === 'signed') setSigned(true)
      setLoading(false)
    }
    fetch()
  }, [agreementId])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      setScrolledToBottom(true)
    }
  }

  const handleSign = async () => {
    if (!hasRead || !isAuthorized || !signerName.trim()) return
    setSigning(true)

    // Get client IP (best effort)
    let ip = 'unknown'
    try {
      const res = await fetch('https://api.ipify.org?format=json')
      const data = await res.json()
      ip = data.ip
    } catch { /* fallback */ }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const result = await signAgreement(
      agreementId,
      signerName.trim(),
      user?.email || '',
      ip
    )

    if (result.success) {
      setSigned(true)
    } else {
      alert(result.error || 'Failed to sign. Please try again.')
    }
    setSigning(false)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-96 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!agreement) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <FileText className="w-12 h-12 text-ink-4 mx-auto mb-3" />
        <h1 className="font-[family-name:var(--font-display)] text-xl text-ink mb-2">Agreement Not Found</h1>
        <p className="text-ink-3 text-sm">This agreement may have been removed or you don&apos;t have access.</p>
        <Link href="/dashboard" className="inline-block mt-4 text-sm text-brand-dark font-medium hover:underline">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  if (signed) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-2">Agreement Signed</h1>
        <p className="text-ink-3 text-sm mb-1">
          Signed by <strong>{agreement.signed_by_name || signerName}</strong> on{' '}
          {agreement.signed_at ? new Date(agreement.signed_at).toLocaleDateString() : new Date().toLocaleDateString()}
        </p>
        <p className="text-ink-4 text-xs">A confirmation has been logged. You can view your signed agreement anytime.</p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const businessName = agreement.business?.legal_business_name || agreement.business?.name || 'Your Business'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Service Agreement</h1>
        <p className="text-ink-3 text-sm mt-1">Please review and sign the agreement below.</p>
      </div>

      {/* Key Terms Summary */}
      <div className="bg-brand-tint/50 rounded-xl border border-brand/20 p-5 mb-6">
        <h2 className="text-sm font-semibold text-ink mb-3">Key Terms</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: 'Client', value: agreement.custom_fields?.client_legal_name || businessName },
            { label: 'Monthly Rate', value: agreement.custom_fields?.monthly_rate || '—' },
            { label: 'Services', value: agreement.custom_fields?.service_scope?.substring(0, 100) + (agreement.custom_fields?.service_scope?.length > 100 ? '...' : '') || '—' },
            { label: 'Payment Due', value: agreement.custom_fields?.payment_due_day ? `${agreement.custom_fields.payment_due_day} of each month` : '—' },
            { label: 'Notice Period', value: agreement.custom_fields?.notice_period || '—' },
            { label: 'Effective Date', value: agreement.custom_fields?.effective_date || '—' },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">{item.label}</p>
              <p className="text-sm text-ink font-medium mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Full Agreement Text */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-ink-4" />
            <h2 className="text-sm font-medium text-ink">Full Agreement</h2>
          </div>
          <span className="flex items-center gap-1 text-[11px] text-ink-4">
            <Clock className="w-3 h-3" /> Scroll to read full agreement
          </span>
        </div>
        <div
          className="p-6 sm:p-8 max-h-[500px] overflow-y-auto"
          onScroll={handleScroll}
        >
          <div
            className="prose prose-sm max-w-none text-ink"
            dangerouslySetInnerHTML={{
              __html: (agreement.rendered_content || '')
                .replace(/\n/g, '<br />')
                .replace(/^# (.+)/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
                .replace(/^## (.+)/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
                .replace(/^### (.+)/gm, '<h3 class="text-base font-medium mt-4 mb-1">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/---/g, '<hr class="my-4 border-ink-6" />')
            }}
          />
        </div>
      </div>

      {/* Signing Section */}
      <div className="bg-white rounded-xl border border-ink-6 p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Sign Agreement</h2>

        <div className="space-y-4">
          {/* Checkboxes */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasRead}
              onChange={(e) => setHasRead(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-ink-6 text-brand focus:ring-brand/30"
            />
            <span className="text-sm text-ink">
              I have read and agree to the terms of this agreement.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isAuthorized}
              onChange={(e) => setIsAuthorized(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-ink-6 text-brand focus:ring-brand/30"
            />
            <span className="text-sm text-ink">
              I confirm I am authorized to sign on behalf of <strong>{businessName}</strong>.
            </span>
          </label>

          {/* Signature field */}
          <div>
            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
              Full Legal Name (Signature)
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Type your full name"
              className="w-full rounded-lg border border-ink-6 bg-bg-2 px-4 py-3 text-lg font-[family-name:var(--font-display)] italic text-ink placeholder:text-ink-4 placeholder:not-italic placeholder:text-sm placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          {/* Sign button */}
          <button
            onClick={handleSign}
            disabled={!hasRead || !isAuthorized || !signerName.trim() || signing}
            className="w-full py-3 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {signing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" /> Sign Agreement
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-4 pt-2">
            <div className="flex items-center gap-1 text-[11px] text-ink-4">
              <Shield className="w-3.5 h-3.5" /> Your signature is recorded securely
            </div>
            <div className="flex items-center gap-1 text-[11px] text-ink-4">
              <Clock className="w-3.5 h-3.5" /> Timestamped and logged
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
