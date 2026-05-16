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
import {
  Sparkles, X, Send, ArrowRight, Loader2, CheckCircle2, AlertCircle, UserRound, Paperclip, ImageIcon,
} from 'lucide-react'
import {
  getOrStartChat, sendMessage, confirmPendingExecution,
  cancelPendingExecution, escalateConversation, uploadPhotoForAgent,
  type SerializedTurn, type ChatState,
} from '@/lib/agent/actions'

export default function AgentChat() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ChatState | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<{ assetId: string; fileUrl: string; fileName: string } | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lazy-load chat state when the panel is first opened.
  useEffect(() => {
    if (!open || state) return
    setLoading(true)
    getOrStartChat().then(r => {
      if (r.success) setState(r.data)
      else setError(r.error)
      setLoading(false)
    })
  }, [open, state])

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
    setSending(true)
    setError(null)
    const res = await confirmPendingExecution(executionId)
    setSending(false)
    if (res.success) {
      const fresh = await getOrStartChat()
      if (fresh.success) startTransition(() => setState(fresh.data))
    } else {
      setError(res.error)
    }
  }

  async function handleCancel(executionId: string) {
    if (!state) return
    const res = await cancelPendingExecution(executionId)
    if (res.success) {
      setState(s => s ? { ...s, pendingExecutions: s.pendingExecutions.filter(p => p.id !== executionId) } : s)
    } else {
      setError(res.error)
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
        <div className="h-14 px-5 flex items-center justify-between border-b border-ink-6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">Apnosh AI</div>
              <div className="text-[10px] text-ink-4">Always shows a preview before changing anything</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-ink-4 hover:text-ink p-1">
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
          {!loading && state && state.turns.length === 0 && (
            <EmptyState />
          )}
          {state?.turns.map(turn => <TurnView key={turn.id} turn={turn} />)}
          {state?.pendingExecutions.map(p => (
            <PendingExecCard
              key={p.id}
              execution={p}
              onConfirm={() => handleConfirm(p.id)}
              onCancel={() => handleCancel(p.id)}
              disabled={sending}
            />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-[12px] text-ink-3 pl-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[12px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>

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

function TurnView({ turn }: { turn: SerializedTurn }) {
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
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-bg-2 text-ink px-3.5 py-2 rounded-2xl rounded-tl-sm text-[13px] whitespace-pre-wrap">
          {turn.text}
        </div>
      </div>
    )
  }
  if (turn.role === 'tool') {
    return (
      <div className="flex justify-start ml-2">
        <div className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Change applied
        </div>
      </div>
    )
  }
  return null
}

function PendingExecCard({
  execution, onConfirm, onCancel, disabled,
}: {
  execution: { id: string; toolName: string; toolDescription: string; destructive: boolean; input: unknown }
  onConfirm: () => void
  onCancel: () => void
  disabled: boolean
}) {
  const friendlyName = execution.toolName.replace(/_/g, ' ')
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
          onClick={onCancel}
          disabled={disabled}
          className="text-[12px] font-medium text-ink-3 hover:text-ink-2 px-2 py-1.5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
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
