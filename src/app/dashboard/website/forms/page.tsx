'use client'

/**
 * Form submissions inbox.
 *
 * Two-pane layout (list + detail) on desktop, list-then-detail on
 * mobile. Owners can mark replied / archived, take notes, and copy
 * the contact email/phone to follow up out-of-band.
 *
 * Submissions arrive via the public webhook at
 * /api/forms/submit/[clientSlug]. Any form provider (Typeform,
 * Formspree, Tally, native HTML POST) can wire there.
 */

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Inbox, Mail, Phone, ExternalLink, Loader2, Archive, MessageCircleReply,
  Tag, Filter, Copy, Check, ChevronRight, Code,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import {
  listFormSubmissions, markFormStatus, setFormNotes,
  type FormSubmission, type FormStatus, type FormKind,
} from '@/lib/form-submissions'

const KIND_LABEL: Record<FormKind, string> = {
  contact: 'Contact',
  catering: 'Catering',
  reservation: 'Reservation',
  newsletter: 'Newsletter',
  feedback: 'Feedback',
  job_inquiry: 'Careers',
  other: 'Other',
}

const KIND_COLOR: Record<FormKind, string> = {
  contact: 'bg-blue-50 text-blue-700',
  catering: 'bg-amber-50 text-amber-700',
  reservation: 'bg-emerald-50 text-emerald-700',
  newsletter: 'bg-indigo-50 text-indigo-700',
  feedback: 'bg-purple-50 text-purple-700',
  job_inquiry: 'bg-rose-50 text-rose-700',
  other: 'bg-ink-7 text-ink-3',
}

const STATUS_LABEL: Record<FormStatus, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
}

export default function FormsPage() {
  const { client } = useClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<FormStatus | 'all'>('all')
  const [kindFilter, setKindFilter] = useState<FormKind | 'all'>('all')
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('id'))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listFormSubmissions({ status: statusFilter, kind: kindFilter })
      setSubmissions(data)
      /* If URL has ?id and that submission exists, keep it. */
      const qid = searchParams.get('id')
      if (qid && data.find(s => s.id === qid)) {
        setActiveId(qid)
      } else if (data.length > 0 && !activeId) {
        setActiveId(data[0].id)
      }
    } finally {
      setLoading(false)
    }
  }, [statusFilter, kindFilter, activeId, searchParams])

  useEffect(() => { void load() }, [load])

  const active = submissions.find(s => s.id === activeId) ?? null

  /* Auto-mark "new" → "read" when opened. */
  useEffect(() => {
    if (active && active.status === 'new') {
      void markFormStatus(active.id, 'read').then(() => {
        setSubmissions(prev => prev.map(s =>
          s.id === active.id ? { ...s, status: 'read' as FormStatus, read_at: new Date().toISOString() } : s
        ))
      })
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [active?.id])

  function selectActive(id: string) {
    setActiveId(id)
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', id)
    router.replace(`${pathname}?${params.toString()}`)
  }

  async function update(id: string, status: FormStatus) {
    await markFormStatus(id, status)
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Website</p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 inline-flex items-center gap-2">
            <Inbox className="w-5 h-5 text-brand" /> Forms
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">
            Submissions from your contact, catering, reservation, and newsletter forms.
          </p>
        </div>
        {client?.slug && <WebhookSnippet slug={client.slug} />}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
        <Filter className="w-3.5 h-3.5 text-ink-4" />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as FormStatus | 'all')}
          className="text-[12.5px] text-ink-2 bg-white ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5 focus:outline-none"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={kindFilter}
          onChange={e => setKindFilter(e.target.value as FormKind | 'all')}
          className="text-[12.5px] text-ink-2 bg-white ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5 focus:outline-none"
        >
          <option value="all">All form types</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-ink-4 ml-auto">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</span>
      </div>

      {/* Two-pane: list left, detail right */}
      {loading ? (
        <div className="rounded-2xl border border-ink-6 bg-white p-12 text-center">
          <Loader2 className="w-5 h-5 text-ink-3 mx-auto animate-spin" />
        </div>
      ) : submissions.length === 0 ? (
        <EmptyState slug={client?.slug ?? ''} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* List */}
          <div className="lg:col-span-2 rounded-2xl border border-ink-6 bg-white overflow-hidden max-h-[70vh] overflow-y-auto">
            <ul className="divide-y divide-ink-7">
              {submissions.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => selectActive(s.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-bg-2/40 transition-colors flex items-start gap-3 ${
                      activeId === s.id ? 'bg-brand-tint/30' : ''
                    } ${s.status === 'new' ? 'font-medium' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${KIND_COLOR[s.kind]}`}>
                          {KIND_LABEL[s.kind]}
                        </span>
                        {s.status === 'new' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        )}
                      </div>
                      <p className="text-[13px] text-ink truncate">
                        {s.display_name || s.display_email || 'Anonymous'}
                      </p>
                      <p className="text-[11px] text-ink-4 truncate mt-0.5">
                        {preview(s)}
                      </p>
                    </div>
                    <div className="text-[10px] text-ink-4 whitespace-nowrap pt-0.5">
                      {relTime(s.submitted_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail */}
          <div className="lg:col-span-3">
            {active ? (
              <SubmissionDetail
                submission={active}
                onUpdate={(status) => update(active.id, status)}
              />
            ) : (
              <div className="rounded-2xl border border-ink-6 bg-white p-12 text-center">
                <p className="text-sm text-ink-3">Select a submission to view details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function preview(s: FormSubmission): string {
  /* Best-effort one-line preview from the message-y fields. */
  const candidates = ['message', 'note', 'inquiry', 'details', 'comments']
  for (const k of candidates) {
    const v = s.fields[k] ?? s.fields[k.charAt(0).toUpperCase() + k.slice(1)]
    if (v) return v.replace(/\s+/g, ' ').slice(0, 100)
  }
  /* Fall back to the first non-display field. */
  const skip = new Set(['name', 'email', 'phone', '_source', 'page_url', 'referer'])
  for (const [k, v] of Object.entries(s.fields)) {
    if (!skip.has(k.toLowerCase()) && v) return `${k}: ${v.replace(/\s+/g, ' ').slice(0, 80)}`
  }
  return ''
}

function relTime(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SubmissionDetail({ submission, onUpdate }: {
  submission: FormSubmission
  onUpdate: (status: FormStatus) => void | Promise<void>
}) {
  const [notes, setNotes] = useState(submission.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => { setNotes(submission.notes ?? '') }, [submission.id, submission.notes])

  async function saveNotes() {
    setSavingNotes(true)
    await setFormNotes(submission.id, notes)
    setSavingNotes(false)
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value)
    setCopied(value)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${KIND_COLOR[submission.kind]}`}>
            {KIND_LABEL[submission.kind]}
          </span>
          <span className="text-[11px] text-ink-4">{STATUS_LABEL[submission.status]}</span>
          <span className="text-[11px] text-ink-4 ml-auto">
            {new Date(submission.submitted_at).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-ink">
          {submission.display_name || submission.display_email || 'Anonymous submission'}
        </h2>
      </div>

      {/* Quick-contact strip */}
      {(submission.display_email || submission.display_phone) && (
        <div className="rounded-xl bg-bg-2/40 p-3 space-y-2">
          {submission.display_email && (
            <ContactRow icon={Mail} label="Email" value={submission.display_email}
              copied={copied === submission.display_email} onCopy={() => copy(submission.display_email!)}
              link={`mailto:${submission.display_email}`} />
          )}
          {submission.display_phone && (
            <ContactRow icon={Phone} label="Phone" value={submission.display_phone}
              copied={copied === submission.display_phone} onCopy={() => copy(submission.display_phone!)}
              link={`tel:${submission.display_phone.replace(/[^\d+]/g, '')}`} />
          )}
        </div>
      )}

      {/* Full fields */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-2">All fields</h3>
        <dl className="space-y-2">
          {Object.entries(submission.fields).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] gap-3 text-[12.5px]">
              <dt className="text-ink-4 truncate" title={k}>{k}</dt>
              <dd className="text-ink-2 whitespace-pre-wrap break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Source URL */}
      {submission.source_url && (
        <p className="text-[11px] text-ink-4 inline-flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          Submitted from <a href={submission.source_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">{submission.source_url}</a>
        </p>
      )}

      {/* Notes */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-1.5">Internal notes</h3>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="What did you do about it? Where is the convo continuing?"
          className="w-full border border-ink-6 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
        />
        {savingNotes && <p className="text-[10.5px] text-ink-4 mt-1">Saving…</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-ink-6">
        {submission.status !== 'replied' && (
          <button
            onClick={() => onUpdate('replied')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark"
          >
            <MessageCircleReply className="w-3 h-3" />
            Mark replied
          </button>
        )}
        {submission.status !== 'archived' && (
          <button
            onClick={() => onUpdate('archived')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-ink-2 hover:text-ink ring-1 ring-ink-6"
          >
            <Archive className="w-3 h-3" />
            Archive
          </button>
        )}
        {submission.status === 'archived' && (
          <button
            onClick={() => onUpdate('new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-ink-2 hover:text-ink ring-1 ring-ink-6"
          >
            <ChevronRight className="w-3 h-3" />
            Restore
          </button>
        )}
      </div>
    </div>
  )
}

function ContactRow({ icon: Icon, label, value, copied, onCopy, link }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  link: string
}) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <Icon className="w-3.5 h-3.5 text-ink-3" />
      <span className="text-[10px] text-ink-4 uppercase tracking-wider w-12">{label}</span>
      <a href={link} className="flex-1 text-ink-2 hover:text-brand-dark truncate">{value}</a>
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] text-ink-3 hover:text-ink ring-1 ring-ink-6"
      >
        {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function WebhookSnippet({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const url = `https://portal.apnosh.com/api/forms/submit/${slug}`
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-6"
      >
        <Code className="w-3 h-3" />
        Webhook URL
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] max-w-[90vw] rounded-2xl border border-ink-6 bg-white p-4 shadow-xl z-10">
          <h3 className="text-sm font-semibold text-ink mb-1">Your form webhook</h3>
          <p className="text-[11.5px] text-ink-3 mb-2">
            Point any form provider here. Add <code className="font-mono text-[10.5px] bg-bg-2 px-1 rounded">?kind=catering</code> etc. to categorize.
          </p>
          <code className="block text-[11px] font-mono bg-bg-2 p-2 rounded break-all">{url}</code>
          <button
            onClick={() => navigator.clipboard.writeText(url)}
            className="mt-2 text-[11px] text-brand-dark hover:underline"
          >
            Copy URL
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-10 text-center">
      <Inbox className="w-8 h-8 text-ink-4 mx-auto mb-3" />
      <h2 className="text-sm font-semibold text-ink">No form submissions yet</h2>
      <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
        Your website&rsquo;s forms post to a unique webhook URL — once they do, submissions land here.
        Use the &ldquo;Webhook URL&rdquo; button in the top-right to grab it.
      </p>
      <div className="mt-4 inline-flex items-center gap-1 text-[10.5px] text-ink-4">
        <Tag className="w-3 h-3" />
        <span>Tip: add <code className="font-mono bg-bg-2 px-1">?kind=catering</code> to the URL to categorize submissions by type.</span>
      </div>
      {slug && (
        <p className="mt-3 text-[11px] text-ink-4">
          Slug: <code className="font-mono">{slug}</code>
        </p>
      )}
    </div>
  )
}
