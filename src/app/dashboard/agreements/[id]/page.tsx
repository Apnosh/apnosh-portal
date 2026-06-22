'use client'

/**
 * Owner Agreement detail + sign — apnosh-mvp surface. Reached from the
 * Agreements list. Review the key terms, scroll the full agreement, then sign
 * behind a two-tap confirm. Signing is irreversible and legally binding, so the
 * commit requires both attestations, a typed legal name, scrolling to the end,
 * and a confirm tap; the signAgreement server action adds auth + status guards.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, CheckCircle, Shield, Clock, Check, Loader2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signAgreement } from '@/lib/actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, C, DISPLAY } from '@/components/mvp/mvp-detail'

interface AgreementData {
  id: string
  agreement_type: string
  status: string
  rendered_content: string | null
  custom_fields: Record<string, string>
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  pdf_url: string | null
  expires_at: string | null
  business: { name: string; legal_business_name: string | null }
}

export default function AgreementSignPage() {
  const params = useParams()
  const agreementId = params.id as string

  const [agreement, setAgreement] = useState<AgreementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [signerName, setSignerName] = useState('')
  const [hasRead, setHasRead] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    async function run() {
      const supabase = createClient()
      // Mark as viewed (only transitions from 'sent').
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
    run()
  }, [agreementId])

  // Auto-pass the scroll gate when the agreement is short enough not to scroll.
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight - el.clientHeight < 60) setScrolledToBottom(true)
  }, [agreement])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setScrolledToBottom(true)
  }

  const canSign = hasRead && isAuthorized && !!signerName.trim() && scrolledToBottom

  const handleSign = async () => {
    if (!canSign) return
    setSigning(true)
    setSignError(null)

    let ip = 'unknown'
    try {
      const res = await fetch('https://api.ipify.org?format=json')
      const data = await res.json()
      ip = data.ip
    } catch { /* best effort */ }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const result = await signAgreement(agreementId, signerName.trim(), user?.email || '', ip)

    if (result.success) {
      setSigned(true)
    } else {
      setSignError(result.error || 'Could not sign. Please try again.')
      setConfirming(false)
    }
    setSigning(false)
  }

  const businessName = agreement?.business?.legal_business_name || agreement?.business?.name || 'your business'

  // ── states ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <MvpShell active="more" header={<MvpDetailHeader title="Service agreement" backHref="/dashboard/agreements" backLabel="Agreements" />}>
        <div style={{ background: C.bg, minHeight: '100%', padding: 14 }}>
          {[80, 320].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
          <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
        </div>
      </MvpShell>
    )
  }

  if (!agreement) {
    return (
      <MvpShell active="more" header={<MvpDetailHeader title="Service agreement" backHref="/dashboard/agreements" backLabel="Agreements" />}>
        <div style={{ background: C.bg, minHeight: '100%', padding: '40px 22px', textAlign: 'center' }}>
          <FileText size={30} color={C.faint} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>Agreement not found</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 5 }}>It may have been removed, or you do not have access.</div>
          <Link href="/dashboard/agreements" style={{ display: 'inline-block', marginTop: 16, color: C.greenDk, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Back to agreements</Link>
        </div>
      </MvpShell>
    )
  }

  if (signed) {
    return (
      <MvpShell active="more" header={<MvpDetailHeader title="Service agreement" backHref="/dashboard/agreements" backLabel="Agreements" />}>
        <div style={{ background: C.bg, minHeight: '100%', padding: '44px 22px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <CheckCircle size={32} color={C.greenDk} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: DISPLAY }}>Agreement signed</div>
          <div style={{ fontSize: 13.5, color: C.mute, marginTop: 6 }}>
            Signed by <strong style={{ color: C.ink }}>{agreement.signed_by_name || signerName}</strong> on {agreement.signed_at ? new Date(agreement.signed_at).toLocaleDateString() : new Date().toLocaleDateString()}
          </div>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 4 }}>A confirmation has been logged. You can view this anytime.</div>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 18, height: 46, padding: '0 22px', borderRadius: 13, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Go to dashboard</Link>
        </div>
      </MvpShell>
    )
  }

  const terms = [
    { label: 'Client', value: agreement.custom_fields?.client_legal_name || businessName },
    { label: 'Monthly rate', value: agreement.custom_fields?.monthly_rate || '' },
    { label: 'Services', value: agreement.custom_fields?.service_scope ? agreement.custom_fields.service_scope.substring(0, 100) + (agreement.custom_fields.service_scope.length > 100 ? '...' : '') : '' },
    { label: 'Payment due', value: agreement.custom_fields?.payment_due_day ? `${agreement.custom_fields.payment_due_day} of each month` : '' },
    { label: 'Notice period', value: agreement.custom_fields?.notice_period || '' },
    { label: 'Effective date', value: agreement.custom_fields?.effective_date || '' },
  ].filter((t) => t.value)

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Service agreement" backHref="/dashboard/agreements" backLabel="Agreements" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>

        {agreement.pdf_url && (
          <a href={agreement.pdf_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, color: C.greenDk, fontWeight: 600, fontSize: 13.5, textDecoration: 'none' }}>
            <Download size={15} /> Download PDF
          </a>
        )}

        {/* Key terms */}
        {terms.length > 0 && (
          <div style={{ background: C.greenSoft, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 11 }}>Key terms</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 14px' }}>
              {terms.map((t) => (
                <div key={t.label}>
                  <div style={{ fontSize: 11, color: C.mute, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600, marginTop: 1, lineHeight: 1.3 }}>{t.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full agreement */}
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `0.5px solid ${C.line}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: C.ink }}><FileText size={15} color={C.mute} /> Full agreement</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.faint }}><Clock size={11} /> Scroll to read</span>
          </div>
          <div ref={scrollRef} onScroll={handleScroll} style={{ padding: '16px 16px', maxHeight: 420, overflowY: 'auto', fontSize: 13.5, color: C.ink, lineHeight: 1.6 }}>
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{
              __html: (agreement.rendered_content || '')
                .replace(/\n/g, '<br />')
                .replace(/^# (.+)/gm, '<h1 class="text-lg font-bold mt-5 mb-2">$1</h1>')
                .replace(/^## (.+)/gm, '<h2 class="text-base font-semibold mt-4 mb-2">$1</h2>')
                .replace(/^### (.+)/gm, '<h3 class="text-sm font-medium mt-3 mb-1">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/---/g, '<hr class="my-4 border-ink-6" />'),
            }} />
          </div>
        </div>

        {/* Sign */}
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, marginBottom: 14 }}>Sign agreement</div>

          <CheckRow checked={hasRead} onToggle={() => setHasRead((v) => !v)} label="I have read and agree to the terms of this agreement." />
          <CheckRow checked={isAuthorized} onToggle={() => setIsAuthorized((v) => !v)} label={`I confirm I am authorized to sign on behalf of ${businessName}.`} />

          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: C.mute, marginBottom: 6 }}>Full legal name</label>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Type your full name"
              className="mvp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '12px 14px', fontSize: 17, color: C.ink, fontFamily: DISPLAY, fontStyle: 'italic', outline: 'none' }}
            />
          </div>

          {signError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.coralSoft, color: C.coral, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{signError}</div>
          )}

          {!scrolledToBottom && (
            <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 12 }}>Scroll to the end of the agreement to sign.</div>
          )}

          <div style={{ marginTop: 14 }}>
            {!confirming ? (
              <button type="button" disabled={!canSign} onClick={() => { setConfirming(true); setSignError(null) }}
                style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: canSign ? C.green : '#bfe7da', color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: canSign ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CheckCircle size={18} /> Sign agreement
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 12.5, color: C.mute, textAlign: 'center', marginBottom: 10 }}>This is your legal signature. It cannot be undone.</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setConfirming(false)} disabled={signing}
                    style={{ flex: 1, height: 48, borderRadius: 14, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: signing ? 'default' : 'pointer' }}>Cancel</button>
                  <button type="button" onClick={handleSign} disabled={signing}
                    style={{ flex: 2, height: 48, borderRadius: 14, border: 'none', background: signing ? '#bfe7da' : C.green, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: signing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {signing ? <><Loader2 size={17} className="mvp-spin" /> Signing</> : 'Confirm signature'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, color: C.faint, fontSize: 11 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Shield size={13} /> Recorded securely</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> Timestamped and logged</span>
          </div>
        </div>
      </div>
    </MvpShell>
  )
}

function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 11, background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer', padding: '8px 0' }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${checked ? C.green : C.line}`, background: checked ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
      </span>
      <span style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 1.4 }}>{label}</span>
    </button>
  )
}
