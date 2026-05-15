'use client'

/**
 * Three-step subscribe flow rendered in the service detail page's
 * sticky right column.
 *
 *   1. "Subscribe" button kicks off recordSubscribeIntent
 *   2. If the client hasn't signed the master agreement, surface the
 *      clickwrap modal next
 *   3. On accept (or if already signed), activate the service
 *
 * Stripe Checkout is wired here once stripe_price_id is populated for
 * each service. Until then activation runs without a payment round-
 * trip so the entire flow is testable end-to-end in dev.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, ShieldCheck, FileText, X } from 'lucide-react'
import {
  recordSubscribeIntent, signAgreement, activateService,
} from '@/lib/dashboard/subscribe-to-service'

interface AgreementTemplate {
  templateId: string
  templateName: string
  version: number
  content: string
}

export default function SubscribeFlow({
  serviceId, serviceName, price, priceUnit,
  alreadySignedAgreement, agreementTemplate,
}: {
  serviceId: string
  serviceName: string
  price: number
  priceUnit: string
  alreadySignedAgreement: boolean
  agreementTemplate: AgreementTemplate | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<'idle' | 'agreement' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [clientServiceId, setClientServiceId] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [agreed, setAgreed] = useState(false)

  const unit = priceUnit === 'per_month' ? '/ month'
    : priceUnit === 'one_time' ? 'one-time' : priceUnit

  function start() {
    setError(null)
    startTransition(async () => {
      const r = await recordSubscribeIntent(serviceId)
      if (!r.success) { setError(r.error); return }
      setClientServiceId(r.clientServiceId)

      if (r.needsAgreement && agreementTemplate) {
        setStep('agreement')
        return
      }
      /* Agreement already on file (or no template configured) -- jump
         straight to activation. Stripe Checkout slots in here later. */
      const a = await activateService(r.clientServiceId)
      if (!a.success) { setError(a.error); return }
      setStep('done')
      router.refresh()
    })
  }

  function acceptAgreement() {
    if (!agreementTemplate || !clientServiceId) return
    setError(null)
    startTransition(async () => {
      const s = await signAgreement({
        templateId: agreementTemplate.templateId,
        agreedText: agreementTemplate.content,
        signerName: signerName.trim() || undefined,
      })
      if (!s.success) { setError(s.error); return }
      const a = await activateService(clientServiceId)
      if (!a.success) { setError(a.error); return }
      setStep('done')
      router.refresh()
    })
  }

  if (step === 'done') {
    return (
      <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-3 flex items-start gap-2">
        <Check className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-emerald-700">Subscribed!</p>
          <p className="text-[11.5px] text-emerald-700/80 mt-0.5">
            Your strategist is notified. They&apos;ll reach out within 24 hours.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={start}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Subscribe &middot; ${price}{unit && ` ${unit}`}
      </button>

      {error && (
        <p className="text-[11.5px] text-rose-700 bg-rose-50 ring-1 ring-rose-100 rounded p-2 mt-1">
          {error}
        </p>
      )}

      {step === 'agreement' && agreementTemplate && (
        <AgreementModal
          template={agreementTemplate}
          serviceName={serviceName}
          signerName={signerName}
          setSignerName={setSignerName}
          agreed={agreed}
          setAgreed={setAgreed}
          onAccept={acceptAgreement}
          onCancel={() => setStep('idle')}
          pending={pending}
        />
      )}

      {alreadySignedAgreement && (
        <p className="text-[10.5px] text-ink-4 inline-flex items-center gap-1 mt-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          Master agreement already on file
        </p>
      )}
    </>
  )
}

function AgreementModal({
  template, serviceName, signerName, setSignerName, agreed, setAgreed,
  onAccept, onCancel, pending,
}: {
  template: AgreementTemplate
  serviceName: string
  signerName: string
  setSignerName: (v: string) => void
  agreed: boolean
  setAgreed: (v: boolean) => void
  onAccept: () => void
  onCancel: () => void
  pending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ink-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-ink-4" />
            <p className="text-[14px] font-semibold text-ink">
              {template.templateName} <span className="text-ink-4 text-[12px]">v{template.version}</span>
            </p>
          </div>
          <button onClick={onCancel} className="text-ink-4 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="px-5 pt-3 text-[12px] text-ink-3">
          Before subscribing to <span className="font-semibold text-ink-2">{serviceName}</span>,
          please review and accept our Master Service Agreement. Cancel anytime.
        </p>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="rounded-xl bg-bg-2 p-4 text-[12.5px] text-ink-2 leading-relaxed whitespace-pre-line font-mono">
            {template.content}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-ink-6 space-y-3 flex-shrink-0">
          <input
            type="text"
            placeholder="Your full name (signature)"
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            className="w-full rounded-xl bg-white ring-1 ring-ink-6 focus:ring-ink-3 focus:outline-none px-3 py-2 text-[13px]"
          />
          <label className="flex items-start gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I have read and agree to the {template.templateName} above. I understand this is a legally binding agreement
              and I represent that I am authorized to sign on behalf of my business.
            </span>
          </label>
          <button
            onClick={onAccept}
            disabled={!agreed || !signerName.trim() || pending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-60 transition-colors"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Accept and subscribe
          </button>
        </div>
      </div>
    </div>
  )
}
