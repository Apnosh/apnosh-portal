'use client'

/**
 * Floating "Ask Apnosh" chat panel.
 *
 * Mounted once at the dashboard layout level; opens as a side panel
 * over the current page. Renders the agent_conversations turns +
 * any pending tool executions inline as preview cards the owner can
 * Confirm or Cancel.
 *
 * Design goals:
 *   - Always available (floating button bottom-right)
 *   - Non-disruptive (slides in, doesn't navigate away)
 *   - Transparent (preview every change before it ships)
 *   - Escalatable (one-click hand off to a human technician)
 */

import { useEffect, useState, useRef, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Sparkles, X, Send, ArrowRight, Loader2, CheckCircle2, AlertCircle, UserRound, Paperclip, ImageIcon, ThumbsUp, ThumbsDown,
} from 'lucide-react'
import {
  getOrStartChat, sendMessage, confirmPendingExecution,
  cancelPendingExecution, escalateConversation, uploadPhotoForAgent,
  judgeAssistantTurn, cancelWithReason, getMyUsage,
  captureUnmetIntent, getEndOfSessionSurvey, submitSessionRating,
  type SerializedTurn, type ChatState, type JudgmentTag, type CancelReasonTag, type UsageMeter,
} from '@/lib/agent/actions'

const POSITIVE_TAGS: { tag: JudgmentTag; label: string }[] = [
  { tag: 'helpful', label: 'Helpful' },
  { tag: 'on_brand', label: 'On brand' },
  { tag: 'specific', label: 'Specific to us' },
]
const NEGATIVE_TAGS: { tag: JudgmentTag; label: string }[] = [
  { tag: 'wrong_info', label: 'Wrong info' },
  { tag: 'off_brand', label: 'Off brand' },
  { tag: 'too_generic', label: 'Too generic' },
  { tag: 'unhelpful', label: "Didn't help" },
  { tag: 'too_long', label: 'Too long' },
  { tag: 'other', label: 'Other' },
]
const CANCEL_REASONS: { tag: CancelReasonTag; label: string }[] = [
  { tag: 'wrong_values', label: 'Wrong values' },
  { tag: 'not_what_i_asked', label: "Not what I asked" },
  { tag: 'changed_my_mind', label: 'Changed my mind' },
  { tag: 'will_do_myself', label: "I'll do it myself" },
  { tag: 'other', label: 'Other' },
]

export default function AgentChat() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ChatState | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<{ assetId: string; fileUrl: string; fileName: string } | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [usage, setUsage] = useState<UsageMeter | null>(null)
  const [capReached, setCapReached] = useState<{ message: string; kind: string } | null>(null)
  const [, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  /* Deep-link from notifications etc: ?ask=<text> opens the panel
     with the textarea pre-filled. We strip the param from the URL
     after consuming it so refreshes don't keep re-opening the chat
     or wiping what the owner has typed. */
  useEffect(() => {
    const ask = searchParams?.get('ask')
    if (ask && ask.trim()) {
      setOpen(true)
      setInput(ask)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('ask')
      const next = params.toString()
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Lazy-load chat state when the panel is first opened. Also fetch
  // the usage meter + the end-of-session survey candidate so the
  // header chip + survey banner can render before the first message.
  useEffect(() => {
    if (!open || state) return
    setLoading(true)
    Promise.all([
      getOrStartChat(),
      getMyUsage(),
      getEndOfSessionSurvey(),
    ]).then(([chatRes, usageRes, surveyRes]) => {
      if (chatRes.success) setState(chatRes.data)
      else setError(chatRes.error)
      if (usageRes.success) setUsage(usageRes.data)
      if (surveyRes.success && surveyRes.data) {
        setSessionSurvey({ conversationId: surveyRes.data.conversationId, title: surveyRes.data.title })
      }
      setLoading(false)
    })
  }, [open, state])

  /* Refresh the meter after every send so the count stays current. */
  useEffect(() => {
    if (!open || !state) return
    getMyUsage().then(r => { if (r.success) setUsage(r.data) })
  }, [open, state?.turns.length])

  // Auto-scroll to bottom on new turns.
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [open, state?.turns.length, state?.pendingExecutions.length])

  async function handleSend() {
    if (!state || (!input.trim() && !pendingPhoto) || sending) return
    const text = input.trim()
    const photo = pendingPhoto
    setInput('')
    setPendingPhoto(null)
    setSending(true)
    setError(null)

    /* Build the message we send to the agent. If there's a photo, we
       prepend a structured note so the agent knows: (a) a photo was
       just uploaded, (b) its asset_id (for the tag_photo tool), (c)
       its file_url (for tools like update_menu_item that accept
       photo_url). Keeps the user-facing message clean. */
    const messageForAgent = photo
      ? `[Owner uploaded a photo: ${photo.fileName}]\nasset_id: ${photo.assetId}\nfile_url: ${photo.fileUrl}\n\n${text || '(no caption)'}`
      : text

    // Optimistic: append the user turn locally so the UI feels instant.
    // We show the friendly text + a photo chip, not the raw asset_id line.
    const optimistic: SerializedTurn = {
      id: `pending-${Date.now()}`,
      role: 'user',
      text: text || (photo ? `📎 ${photo.fileName}` : ''),
      toolCalls: null,
      toolCallId: null,
      createdAt: new Date().toISOString(),
    }
    setState(s => s ? { ...s, turns: [...s.turns, optimistic] } : s)

    const res = await sendMessage({ conversationId: state.conversationId, text: messageForAgent })
    setSending(false)
    if (res.success) {
      const fresh = await getOrStartChat()
      if (fresh.success) setState(fresh.data)
    } else if (res.capReached) {
      /* Cap-reached path: keep the user's message in place (so they
         can resend after upgrading) but show the cap notice + CTA. */
      setCapReached({ message: res.error, kind: res.capKind ?? 'cap' })
      setInput(text)
      setState(s => s ? { ...s, turns: s.turns.filter(t => t.id !== optimistic.id) } : s)
    } else {
      setError(res.error)
      setState(s => s ? { ...s, turns: s.turns.filter(t => t.id !== optimistic.id) } : s)
    }
  }

  async function handlePhotoSelect(file: File) {
    if (!state || uploadingPhoto) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Photo too large (max 10MB)')
      return
    }
    setUploadingPhoto(true)
    setError(null)

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip the "data:image/jpeg;base64," prefix.
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    }).catch(err => { setError(err.message); return null })

    if (!base64) {
      setUploadingPhoto(false)
      return
    }

    const res = await uploadPhotoForAgent({
      conversationId: state.conversationId,
      fileName: file.name,
      contentType: file.type || 'image/jpeg',
      base64,
    })
    setUploadingPhoto(false)
    if (res.success) {
      setPendingPhoto({ assetId: res.assetId, fileUrl: res.fileUrl, fileName: file.name })
    } else {
      setError(res.error)
    }
  }

  async function handleConfirm(executionId: string) {
    if (!state) return
    /* Sniff: was this an escalation? If yes, after the confirm we
       prompt the owner with "what did you wish I could do?" so we
       capture the gap before they close the chat. */
    const pending = state.pendingExecutions.find(p => p.id === executionId)
    const wasEscalation = pending?.toolName === 'request_human_help'

    setSending(true)
    setError(null)
    const res = await confirmPendingExecution(executionId)
    setSending(false)
    if (res.success) {
      const fresh = await getOrStartChat()
      if (fresh.success) startTransition(() => setState(fresh.data))
      if (wasEscalation) {
        setUnmetIntentPrompt({
          kind: 'escalation',
          executionId,
          conversationId: state.conversationId,
        })
      }
    } else {
      setError(res.error)
    }
  }

  async function handleUnmetIntentSubmit(wishText: string) {
    if (!unmetIntentPrompt) return
    await captureUnmetIntent({
      triggerKind: unmetIntentPrompt.kind,
      wishText,
      conversationId: unmetIntentPrompt.conversationId,
      executionId: unmetIntentPrompt.executionId,
    })
    setUnmetIntentPrompt(null)
  }

  async function handleSessionRating(thumbs: 'up' | 'down', notes?: string) {
    if (!sessionSurvey) return
    await submitSessionRating({ conversationId: sessionSurvey.conversationId, thumbs, notes })
    setSessionSurveyAnswered(true)
    setTimeout(() => setSessionSurvey(null), 1500)
  }

  async function handleCancel(executionId: string, reason: CancelReasonTag, notes?: string) {
    if (!state) return
    const res = await cancelWithReason({ executionId, reason, notes })
    if (res.success) {
      setState(s => s ? { ...s, pendingExecutions: s.pendingExecutions.filter(p => p.id !== executionId) } : s)
      /* Cancel reasons that imply the agent picked the wrong action
         deserve an "what did you wish I'd done?" follow-up. */
      if (reason === 'not_what_i_asked' || reason === 'other') {
        setUnmetIntentPrompt({
          kind: reason === 'not_what_i_asked' ? 'cancel_not_what_i_asked' : 'cancel_other',
          executionId,
          conversationId: state.conversationId,
        })
      }
    } else {
      setError(res.error)
    }
  }

  /* Unmet-intent capture form state. Shown inline when an action
     was cancelled with an "agent got it wrong" reason, OR after the
     agent escalates. Owner can dismiss or fill in. */
  const [unmetIntentPrompt, setUnmetIntentPrompt] = useState<{
    kind: 'escalation' | 'cancel_not_what_i_asked' | 'cancel_other'
    executionId?: string
    conversationId: string
  } | null>(null)

  /* End-of-session survey: load once on chat open, dismissable. */
  const [sessionSurvey, setSessionSurvey] = useState<{ conversationId: string; title: string | null } | null>(null)
  const [sessionSurveyAnswered, setSessionSurveyAnswered] = useState(false)

  /* Per-turn judgment kept in component state so the chip turns into
     "✓ noted" the moment the owner clicks, no roundtrip wait. */
  const [judged, setJudged] = useState<Record<string, 'up' | 'down'>>({})
  async function handleJudge(turnId: string, thumbs: 'up' | 'down', tags: JudgmentTag[]) {
    setJudged(j => ({ ...j, [turnId]: thumbs }))
    const res = await judgeAssistantTurn({ turnId, thumbs, tags })
    if (!res.success) {
      setError(res.error)
      // Roll back the chip if the write failed.
      setJudged(j => { const next = { ...j }; delete next[turnId]; return next })
    }
  }

  async function handleEscalate() {
    if (!state) return
    const reason = prompt('What do you need help with? A human technician will follow up.')
    if (!reason) return
    const res = await escalateConversation({ conversationId: state.conversationId, reason })
    if (res.success) {
      setOpen(false)
      alert('Got it — your account manager will follow up. You can keep chatting here in the meantime.')
    } else {
      setError(res.error)
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark shadow-lg shadow-brand/30 transition-transform ${open ? 'scale-0' : 'scale-100'}`}
      >
        <Sparkles className="w-4 h-4" />
        Ask Apnosh
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 transition-opacity" onClick={() => setOpen(false)} />
      )}

      {/* Side panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="px-5 py-2.5 flex items-center justify-between border-b border-ink-6 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">Apnosh AI</div>
              <div className="text-[10px] text-ink-4 truncate">
                {usage?.tierLabel && (
                  <>
                    {usage.tierLabel} plan
                    {usage.primaryLimitLabel && (
                      <span className="text-ink-3"> · {usage.primaryLimitLabel}</span>
                    )}
                  </>
                )}
                {!usage?.tierLabel && 'Always shows a preview before changing anything'}
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-ink-4 hover:text-ink p-1 flex-shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
            </div>
          )}
          {!loading && state && state.turns.length === 0 && !sessionSurvey && (
            <EmptyState />
          )}
          {!loading && sessionSurvey && !sessionSurveyAnswered && (
            <SessionSurveyBanner
              title={sessionSurvey.title}
              onAnswer={handleSessionRating}
              onDismiss={() => setSessionSurvey(null)}
            />
          )}
          {!loading && sessionSurveyAnswered && (
            <div className="text-[11px] text-emerald-700 text-center py-2 inline-flex items-center gap-1 justify-center w-full">
              <CheckCircle2 className="w-3 h-3" /> Thanks — that helps us improve!
            </div>
          )}
          {state?.turns.map(turn => (
            <TurnView
              key={turn.id}
              turn={turn}
              judged={judged[turn.id] ?? null}
              onJudge={handleJudge}
            />
          ))}
          {state?.pendingExecutions.map(p => (
            <PendingExecCard
              key={p.id}
              execution={p}
              onConfirm={() => handleConfirm(p.id)}
              onCancel={(reason, notes) => handleCancel(p.id, reason, notes)}
              disabled={sending}
            />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-[12px] text-ink-3 pl-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
            </div>
          )}
          {unmetIntentPrompt && (
            <UnmetIntentForm
              kind={unmetIntentPrompt.kind}
              onSubmit={handleUnmetIntentSubmit}
              onDismiss={() => setUnmetIntentPrompt(null)}
            />
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[12px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

        {/* Cap-reached banner. Shown above the composer when the
            cap-check refused a turn. Includes upgrade CTA to settings
            (where the upgrade flow lives). Dismissable so the owner
            can keep reading prior turns. */}
        {capReached && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 flex-shrink-0">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-[12.5px] font-semibold text-amber-900">You&apos;ve hit your plan limit</div>
                <div className="text-[11.5px] text-amber-800 mt-0.5">{capReached.message}</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {/* Primary: upgrade. Most owners convert after the 1-2nd cap hit. */}
                  <a
                    href="/dashboard/upgrade"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-semibold text-white bg-brand hover:bg-brand-dark"
                  >
                    Upgrade plan
                    <ArrowRight className="w-3 h-3" />
                  </a>
                  {/* Secondary: one-time top-up. Routes to messages for now —
                      replace with /api/billing/buy-messages once overage
                      billing + usage credits are wired. */}
                  <a
                    href={`/dashboard/messages?topic=${encodeURIComponent('One-time message top-up')}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-semibold text-ink-2 bg-white border border-amber-300 hover:bg-amber-100"
                    title="Get extra messages without upgrading your plan"
                  >
                    Buy a one-time top-up
                  </a>
                  <button
                    type="button"
                    onClick={() => setCapReached(null)}
                    className="text-[11.5px] text-amber-800 hover:text-amber-900 ml-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-ink-6 p-3 flex-shrink-0">
          {/* Pending photo chip -- shown above the textarea while the
              owner has a photo staged but hasn't sent yet. */}
          {pendingPhoto && (
            <div className="mb-2 flex items-center gap-2 p-2 rounded-lg bg-bg-2 border border-ink-6">
              <div className="w-10 h-10 rounded overflow-hidden bg-ink-7 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingPhoto.fileUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-ink-2 truncate">{pendingPhoto.fileName}</div>
                <div className="text-[10px] text-ink-4">Will be attached to your message</div>
              </div>
              <button
                type="button"
                onClick={() => setPendingPhoto(null)}
                className="text-ink-4 hover:text-ink p-1"
                aria-label="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handlePhotoSelect(f)
                e.target.value = ''  // allow re-selecting the same file
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!state || uploadingPhoto || !!pendingPhoto}
              title={pendingPhoto ? 'Send the current photo first' : 'Attach a photo'}
              className="w-9 h-9 rounded-full bg-ink-7 hover:bg-ink-6 text-ink-2 flex items-center justify-center disabled:opacity-50 flex-shrink-0"
              aria-label="Attach photo"
            >
              {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={pendingPhoto ? 'Tell Apnosh what to do with this photo...' : 'Ask anything — update hours, change a menu item, draft a post...'}
              rows={2}
              disabled={!state || sending}
              className="flex-1 resize-none px-3 py-2 rounded-lg border border-ink-6 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!state || sending || (!input.trim() && !pendingPhoto)}
              className="w-9 h-9 rounded-full bg-brand hover:bg-brand-dark text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <button
              type="button"
              onClick={handleEscalate}
              disabled={!state}
              className="text-[11px] text-ink-3 hover:text-ink-2 inline-flex items-center gap-1 disabled:opacity-50"
            >
              <UserRound className="w-3 h-3" />
              Talk to a human technician
            </button>
            <span className="text-[10px] text-ink-4">Press Enter to send</span>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function TurnView({
  turn, judged, onJudge,
}: {
  turn: SerializedTurn
  judged: 'up' | 'down' | null
  onJudge: (turnId: string, thumbs: 'up' | 'down', tags: JudgmentTag[]) => void
}) {
  // Only render user + assistant text turns visually. Tool calls are
  // represented by the PendingExecCard or by a "made the change" line
  // when already executed.
  if (turn.role === 'user' && turn.text) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-brand text-white px-3.5 py-2 rounded-2xl rounded-tr-sm text-[13px] whitespace-pre-wrap">
          {turn.text}
        </div>
      </div>
    )
  }
  if (turn.role === 'assistant' && turn.text) {
    return (
      <div className="flex flex-col items-start">
        <div className="max-w-[85%] bg-bg-2 text-ink px-3.5 py-2 rounded-2xl rounded-tl-sm text-[13px]">
          <MarkdownLite text={turn.text} />
        </div>
        <JudgmentBar turnId={turn.id} judged={judged} onJudge={onJudge} />
      </div>
    )
  }
  if (turn.role === 'tool') {
    /* Tool turns are the persisted result of a tool call. Read-only
       tools (e.g. search_business_data) shouldn't say "Change
       applied" -- they didn't change anything. We don't know the
       tool name from the persisted turn alone; if the content
       looks like a structured object it's almost certainly a read
       result, otherwise we treat it as a destructive completion.
       Either way, keep it minimal -- the agent's next text turn
       explains what happened. */
    return (
      <div className="flex justify-start ml-2">
        <div className="text-[11px] text-ink-3 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Done
        </div>
      </div>
    )
  }
  return null
}

/* Tiny markdown renderer for chat bubbles. Handles the common cases
 * Claude uses: headers (##), bold (**), numbered lists, line breaks.
 * Deliberately not pulling in a full markdown lib to keep the bundle
 * small and the styling tight. */
function MarkdownLite({ text }: { text: string }) {
  // Normalize line endings + collapse 3+ blank lines.
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let listItems: string[] = []
  let listType: 'ol' | 'ul' | null = null

  function flushList() {
    if (listItems.length === 0) return
    const items = listItems.map((it, i) => <li key={i}>{renderInline(it)}</li>)
    if (listType === 'ol') {
      blocks.push(<ol key={blocks.length} className="list-decimal pl-5 my-1.5 space-y-0.5">{items}</ol>)
    } else {
      blocks.push(<ul key={blocks.length} className="list-disc pl-5 my-1.5 space-y-0.5">{items}</ul>)
    }
    listItems = []
    listType = null
  }

  let paragraph: string[] = []
  function flushParagraph() {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={blocks.length} className="my-1.5 first:mt-0 last:mb-0">
        {renderInline(paragraph.join(' '))}
      </p>
    )
    paragraph = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      flushParagraph()
      continue
    }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushList(); flushParagraph()
      blocks.push(<h4 key={blocks.length} className="font-semibold text-ink mt-3 first:mt-0 mb-1">{renderInline(h2[1])}</h4>)
      continue
    }
    const ol = line.match(/^\d+\.\s+(.+)$/)
    if (ol) {
      flushParagraph()
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(ol[1])
      continue
    }
    const ul = line.match(/^[-*]\s+(.+)$/)
    if (ul) {
      flushParagraph()
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(ul[1])
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushList()
  flushParagraph()

  return <>{blocks}</>
}

/* Inline form shown after escalation / "agent got it wrong" cancel.
 * Captures owner intent gap for product roadmap. ~1 line of friction;
 * dismissable. Saves to agent_unmet_intents. */
function UnmetIntentForm({
  kind, onSubmit, onDismiss,
}: {
  kind: 'escalation' | 'cancel_not_what_i_asked' | 'cancel_other'
  onSubmit: (wishText: string) => void
  onDismiss: () => void
}) {
  const [text, setText] = useState('')
  const placeholder = kind === 'escalation'
    ? 'What were you hoping I could do for you? (helps us build the right tools)'
    : 'What were you actually trying to do? (helps us improve)'
  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-3.5">
      <div className="text-[12px] font-semibold text-purple-900 mb-2">Quick question</div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        autoFocus
        className="w-full resize-none px-2.5 py-1.5 rounded-lg border border-purple-200 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 bg-white"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11.5px] font-medium text-purple-700 hover:text-purple-900 px-2"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => text.trim() && onSubmit(text.trim())}
          disabled={!text.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11.5px] font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
        >
          Send feedback
        </button>
      </div>
    </div>
  )
}

/* End-of-session survey: appears at the top of the message list on
 * chat open when a prior conversation ended within the last 7 days
 * and the owner hasn't rated it. One tap; dismissable. */
function SessionSurveyBanner({
  title, onAnswer, onDismiss,
}: {
  title: string | null
  onAnswer: (thumbs: 'up' | 'down', notes?: string) => void
  onDismiss: () => void
}) {
  return (
    <div className="rounded-2xl border border-brand-tint bg-brand-tint/30 p-3.5">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-brand flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold text-ink">
            Quick check-in on our last chat
          </div>
          {title && (
            <div className="text-[11px] text-ink-3 mt-0.5 truncate italic">&quot;{title}&quot;</div>
          )}
          <div className="text-[11.5px] text-ink-3 mt-1">Did that help you?</div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => onAnswer('up')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-semibold bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
            >
              <ThumbsUp className="w-3 h-3" />
              Yes, helpful
            </button>
            <button
              type="button"
              onClick={() => onAnswer('down')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-semibold bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
            >
              <ThumbsDown className="w-3 h-3" />
              Not really
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="text-[11px] text-ink-3 hover:text-ink-2 ml-1"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** (split on the markers, alternate strong/text).
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

function PendingExecCard({
  execution, onConfirm, onCancel, disabled,
}: {
  execution: { id: string; toolName: string; toolDescription: string; destructive: boolean; input: unknown }
  onConfirm: () => void
  onCancel: (reason: CancelReasonTag, notes?: string) => void
  disabled: boolean
}) {
  const friendlyName = execution.toolName.replace(/_/g, ' ')
  const [showCancelReasons, setShowCancelReasons] = useState(false)

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
      <div className="flex items-start gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-amber-900">Preview: {friendlyName}</div>
          <div className="text-[11px] text-amber-800 mt-0.5">{execution.toolDescription}</div>
        </div>
      </div>
      <pre className="bg-white/70 rounded-lg p-2.5 text-[11px] font-mono text-ink-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
{JSON.stringify(execution.input, null, 2)}
      </pre>
      {!showCancelReasons ? (
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
          >
            Confirm
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setShowCancelReasons(true)}
            disabled={disabled}
            className="text-[12px] font-medium text-ink-3 hover:text-ink-2 px-2 py-1.5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Force a reason chip on cancel -- that's the AI-First
           Principle #3 ("human judgment is gold") in action. Owners
           cancel = training signal. Don't lose it. */
        <div className="mt-3 pt-3 border-t border-amber-200">
          <div className="text-[11px] font-medium text-amber-900 mb-2">Why not? (helps us improve)</div>
          <div className="flex flex-wrap gap-1.5">
            {CANCEL_REASONS.map(r => (
              <button
                key={r.tag}
                type="button"
                onClick={() => onCancel(r.tag)}
                disabled={disabled}
                className="text-[11px] font-medium px-2 py-1 rounded-full bg-white text-amber-900 hover:bg-amber-100 border border-amber-300 disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCancelReasons(false)}
            className="mt-2 text-[10px] text-amber-700 hover:text-amber-900"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}

/* 1-tap judgment chip under each assistant message. Two states:
 * - Idle: shows 👍 and 👎 only
 * - After 👎: shows tag chips so the owner can say what was wrong
 * - After judging: shows "Thanks!" in muted text
 * Tags are saved to agent_evaluations with rater_type='owner'. */
function JudgmentBar({
  turnId, judged, onJudge,
}: {
  turnId: string
  judged: 'up' | 'down' | null
  onJudge: (turnId: string, thumbs: 'up' | 'down', tags: JudgmentTag[]) => void
}) {
  const [showNegativeTags, setShowNegativeTags] = useState(false)
  if (judged) {
    return (
      <div className="mt-1 ml-1 text-[10px] text-ink-4 inline-flex items-center gap-1">
        {judged === 'up' ? <ThumbsUp className="w-2.5 h-2.5" /> : <ThumbsDown className="w-2.5 h-2.5" />}
        Thanks — that helps us improve
      </div>
    )
  }
  if (showNegativeTags) {
    return (
      <div className="mt-1.5 ml-1">
        <div className="text-[10px] text-ink-4 mb-1">What went wrong?</div>
        <div className="flex flex-wrap gap-1">
          {NEGATIVE_TAGS.map(t => (
            <button
              key={t.tag}
              type="button"
              onClick={() => onJudge(turnId, 'down', [t.tag])}
              className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full bg-bg-2 text-ink-3 hover:bg-rose-50 hover:text-rose-700 border border-ink-6"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-1 ml-1 flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={() => {
          /* For 👍 we don't ask for a tag -- the act of approving is
             the signal. Add 'helpful' as a default + 'on_brand' /
             'specific' shortcuts if you want them broken out later. */
          onJudge(turnId, 'up', ['helpful'])
        }}
        className="w-5 h-5 rounded-full inline-flex items-center justify-center text-ink-4 hover:bg-emerald-50 hover:text-emerald-700"
        aria-label="Helpful"
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => setShowNegativeTags(true)}
        className="w-5 h-5 rounded-full inline-flex items-center justify-center text-ink-4 hover:bg-rose-50 hover:text-rose-700"
        aria-label="Not helpful"
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
    </div>
  )
}

function EmptyState() {
  const examples = [
    'Change my hours to 10am-9pm weekdays',
    'Add Truffle Burger to the menu for $18',
    'Update the homepage tagline',
  ]
  return (
    <div className="py-6 text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-brand/10 mx-auto flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-brand" />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-ink">Hi, I&apos;m your Apnosh AI</div>
        <div className="text-[11.5px] text-ink-3 mt-0.5 max-w-xs mx-auto">
          Ask me to update your website, post on Google, change your menu — anything in your channels.
          I&apos;ll always show you a preview before making changes.
        </div>
      </div>
      <div className="space-y-1.5 pt-2">
        {examples.map(ex => (
          <div key={ex} className="text-[11px] text-ink-4 italic">&ldquo;{ex}&rdquo;</div>
        ))}
      </div>
    </div>
  )
}
