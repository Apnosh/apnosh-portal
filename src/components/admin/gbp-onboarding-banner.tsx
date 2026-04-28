'use client'

/**
 * Per-client GBP onboarding banner. Shows on the client detail page
 * when status is anything other than 'connected'. Drives the
 * "Send Manager invite" workflow with a mailto: link that pre-fills
 * a personalized email the admin can edit before sending.
 */

import { useEffect, useState } from 'react'
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Clock, X } from 'lucide-react'
import {
  buildGbpOnboardingEmail,
  markGbpInviteSent,
  getClientGbpStatusAction,
} from '@/lib/gbp-onboarding-actions'
import type { ClientGbpStatus } from '@/lib/gbp-status'

interface Props { clientId: string }

function daysAgo(iso: string): number {
  const d = new Date(iso).getTime()
  const now = Date.now()
  return Math.floor((now - d) / (1000 * 60 * 60 * 24))
}

export default function GbpOnboardingBanner({ clientId }: Props) {
  const [status, setStatus] = useState<ClientGbpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setLoading(true)
    const res = await getClientGbpStatusAction(clientId)
    if (res.success) setStatus(res.data)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [clientId])

  if (loading || !status) return null
  if (status.status === 'connected') return null  // hide when working

  const openInviteModal = async () => {
    const res = await buildGbpOnboardingEmail(clientId)
    if (res.success) {
      setDraft(res.data)
      setShowModal(true)
    }
  }

  const handleSendAndMark = async () => {
    if (!draft) return
    setBusy(true)
    // Open the mailto: link in the admin's mail client
    const url = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    window.open(url, '_blank')
    // Mark as sent
    await markGbpInviteSent(clientId)
    setBusy(false)
    setShowModal(false)
    refresh()
  }

  const handleMarkOnly = async () => {
    setBusy(true)
    await markGbpInviteSent(clientId)
    setBusy(false)
    setShowModal(false)
    refresh()
  }

  // Banner visuals per status
  const variants = {
    never: {
      Icon: Mail,
      bg: 'bg-amber-50 border-amber-200',
      iconColor: 'text-amber-600',
      title: 'GBP not connected yet',
      body: 'Send the client an email walking them through how to add Apnosh as a Manager on their Google Business Profile. Their daily Local SEO data flows in automatically once they accept.',
      cta: 'Send Manager invite email',
    },
    pending: {
      Icon: Clock,
      bg: 'bg-amber-50 border-amber-200',
      iconColor: 'text-amber-600',
      title: status.inviteSentAt
        ? `Invite sent ${daysAgo(status.inviteSentAt)} day${daysAgo(status.inviteSentAt) === 1 ? '' : 's'} ago`
        : 'Manager invite pending',
      body: 'Waiting for the client to accept the Manager invite on their Google Business Profile. Once they accept and the cron runs, this will switch to Connected.',
      cta: 'Resend invite email',
    },
    lost: {
      Icon: AlertCircle,
      bg: 'bg-red-50 border-red-200',
      iconColor: 'text-red-600',
      title: 'GBP access lost',
      body: status.lastMetricDate
        ? `No new metrics since ${status.lastMetricDate}. The client may have removed Apnosh as a Manager, or our agency token may need re-authentication.`
        : 'Connection broken. Try reconnecting from /admin/integrations or re-invite the client.',
      cta: 'Reconnect / re-invite',
    },
  } as const

  const v = variants[status.status as 'never' | 'pending' | 'lost']
  const Icon = v.Icon

  return (
    <>
      <div className={`rounded-xl border ${v.bg} p-4 mb-4 flex items-start gap-3`}>
        <Icon className={`w-5 h-5 ${v.iconColor} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-bold text-sm text-ink">{v.title}</h3>
            <button
              onClick={refresh}
              className="text-ink-3 hover:text-ink"
              title="Refresh status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-ink-3 mb-3">{v.body}</p>
          <button
            onClick={openInviteModal}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-ink text-white hover:bg-ink-2"
          >
            {v.cta}
          </button>
        </div>
      </div>

      {/* Invite modal -- email preview + send actions */}
      {showModal && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-ink-6">
              <h2 className="font-bold text-ink">Send GBP Manager invite</h2>
              <button onClick={() => setShowModal(false)} className="text-ink-3 hover:text-ink">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <div className="text-xs text-ink-3 mb-1">To</div>
                <input
                  className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
                  value={draft.to}
                  onChange={e => setDraft({ ...draft, to: e.target.value })}
                />
              </div>
              <div>
                <div className="text-xs text-ink-3 mb-1">Subject</div>
                <input
                  className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg"
                  value={draft.subject}
                  onChange={e => setDraft({ ...draft, subject: e.target.value })}
                />
              </div>
              <div>
                <div className="text-xs text-ink-3 mb-1">Body (edit before sending)</div>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-ink-5 rounded-lg font-mono"
                  rows={14}
                  value={draft.body}
                  onChange={e => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <p className="text-xs text-ink-3">
                We&apos;ll open this in your default mail client. After you hit send, click <strong>Mark as sent</strong> below
                so the dashboard knows the invite has gone out.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-ink-6 bg-bg-2">
              <button
                onClick={handleMarkOnly}
                disabled={busy}
                className="text-xs text-ink-3 hover:text-ink underline"
              >
                Already sent it manually — just mark as sent
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendAndMark}
                  disabled={busy || !draft.to}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {busy ? 'Opening...' : 'Open in mail + mark as sent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
