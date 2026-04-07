'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Eye, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createAgreement, sendAgreement } from '@/lib/actions'

interface ClientOption {
  id: string
  name: string
  legal_business_name: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  entity_type: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  dba_name: string | null
}

interface TemplateOption {
  id: string
  name: string
  type: string
  content: string
  is_active: boolean
}

const FIELD_LABELS: Record<string, string> = {
  client_legal_name: 'Client Legal Name',
  client_dba_clause: 'DBA Clause',
  client_entity_type: 'Entity Type Description',
  client_address: 'Client Address',
  service_scope: 'Services Included',
  monthly_rate: 'Monthly Rate',
  payment_due_day: 'Payment Due Day',
  payment_terms: 'Payment Terms',
  late_fee_terms: 'Late Fee Terms',
  notice_period: 'Notice Period',
  effective_date: 'Effective Date',
  governing_state: 'Governing State',
  ip_ownership_terms: 'IP Ownership Terms',
}

export default function SendAgreementPageWrapper() {
  return (
    <Suspense fallback={<div className="h-48 bg-ink-6 rounded-xl animate-pulse" />}>
      <SendAgreementPage />
    </Suspense>
  )
}

function SendAgreementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClient = searchParams.get('client')

  const [clients, setClients] = useState<ClientOption[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState(preselectedClient || '')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [customFields, setCustomFields] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'setup' | 'preview' | 'sent'>('setup')

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const [clientsRes, templatesRes] = await Promise.all([
        supabase.from('businesses').select('id, name, legal_business_name, primary_contact_name, primary_contact_email, entity_type, address, city, state, zip, dba_name').order('name'),
        supabase.from('agreement_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      ])
      setClients((clientsRes.data as ClientOption[]) || [])
      const tpls = (templatesRes.data as TemplateOption[]) || []
      setTemplates(tpls)
      if (tpls.length > 0) setSelectedTemplateId(tpls[0].id)
    }
    fetch()
  }, [])

  // Auto-fill custom fields when client changes
  useEffect(() => {
    const client = clients.find((c) => c.id === selectedClientId)
    if (!client) return

    const addr = [client.address, client.city, client.state, client.zip].filter(Boolean).join(', ')
    const entityMap: Record<string, string> = {
      llc: 'limited liability company',
      corp: 'corporation',
      s_corp: 'S corporation',
      sole_prop: 'sole proprietorship',
      partnership: 'partnership',
      nonprofit: 'nonprofit organization',
    }

    setCustomFields((prev) => ({
      ...prev,
      client_legal_name: client.legal_business_name || client.name,
      client_dba_clause: client.dba_name ? `, doing business as "${client.dba_name}"` : '',
      client_entity_type: client.entity_type ? `${client.state || 'Washington'} ${entityMap[client.entity_type] || client.entity_type}` : '',
      client_address: addr || '',
      effective_date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      governing_state: 'Washington',
      payment_due_day: '1st',
      notice_period: '30 days',
      late_fee_terms: '$25 flat fee per occurrence',
      ip_ownership_terms: 'All work product created by Agency for Client shall become the property of Client upon full payment. Agency retains the right to display work in its portfolio.',
    }))
  }, [selectedClientId, clients])

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)

  const renderContent = () => {
    if (!selectedTemplate) return ''
    let rendered = selectedTemplate.content
    for (const [key, value] of Object.entries(customFields)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
    return rendered
  }

  const handleSendAgreement = async () => {
    if (!selectedClientId || !selectedTemplateId) return
    setLoading(true)

    const result = await createAgreement(selectedClientId, selectedTemplateId, customFields)
    if (!result.success || !result.agreementId) {
      alert(result.error || 'Failed to create agreement')
      setLoading(false)
      return
    }

    const sendResult = await sendAgreement(result.agreementId)
    if (sendResult.success) {
      setStep('sent')
    } else {
      alert(sendResult.error || 'Failed to send agreement')
    }
    setLoading(false)
  }

  if (step === 'sent') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-2">Agreement Sent</h1>
        <p className="text-ink-3 text-sm">
          The agreement has been created and the client&apos;s status has been updated.
          They can now view and sign it through their portal.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Link
            href="/admin/agreements"
            className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors"
          >
            View Agreements
          </Link>
          <Link
            href={`/admin/clients/${selectedClientId}`}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"
          >
            View Client
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/agreements"
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to agreements
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Send Agreement</h1>
        <p className="text-ink-3 text-sm mt-1">Select a client, choose a template, fill in the terms, and send.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Setup */}
        <div className="space-y-4">
          {/* Client selector */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-medium text-ink mb-3">1. Select Client</h2>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Choose a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.legal_business_name || c.name}</option>
              ))}
            </select>
          </div>

          {/* Template selector */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-medium text-ink mb-3">2. Select Template</h2>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Custom fields */}
          <div className="bg-white rounded-xl border border-ink-6 p-5">
            <h2 className="text-sm font-medium text-ink mb-3">3. Fill in Terms</h2>
            <div className="space-y-3">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <div key={key}>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">{label}</label>
                  {key === 'service_scope' || key === 'ip_ownership_terms' ? (
                    <textarea
                      value={customFields[key] || ''}
                      onChange={(e) => setCustomFields({ ...customFields, [key]: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={customFields[key] || ''}
                      onChange={(e) => setCustomFields({ ...customFields, [key]: e.target.value })}
                      className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={handleSendAgreement}
            disabled={!selectedClientId || !selectedTemplateId || loading}
            className="w-full py-3 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Send Agreement to Client
              </>
            )}
          </button>
        </div>

        {/* Right: Live Preview */}
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center gap-2">
            <Eye className="w-4 h-4 text-ink-4" />
            <h2 className="text-sm font-medium text-ink">Live Preview</h2>
          </div>
          <div className="p-6 max-h-[800px] overflow-y-auto">
            {selectedTemplate ? (
              <div
                className="prose prose-sm max-w-none text-ink"
                dangerouslySetInnerHTML={{
                  __html: renderContent()
                    .replace(/\n/g, '<br />')
                    .replace(/^# (.+)/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
                    .replace(/^## (.+)/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
                    .replace(/^### (.+)/gm, '<h3 class="text-base font-medium mt-4 mb-1">$1</h3>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/---/g, '<hr class="my-4 border-ink-6" />')
                    .replace(/\{\{(\w+)\}\}/g, '<span class="bg-amber-100 text-amber-700 px-1 rounded text-xs font-mono">{{$1}}</span>')
                }}
              />
            ) : (
              <p className="text-ink-4 text-sm text-center py-8">Select a template to see preview</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
