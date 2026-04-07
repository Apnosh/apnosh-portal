'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Search, Plus, Send, ChevronRight, Loader2, MessageSquare, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/lib/actions'

// ── Types ────────────────────────────────────────────────────────────

interface ThreadRow {
  id: string
  business_id: string
  subject: string
  order_id: string | null
  last_message_at: string
  created_at: string
}

interface MessageRow {
  id: string
  business_id: string
  thread_id: string
  sender_id: string
  sender_name: string
  sender_role: 'client' | 'admin' | 'team_member'
  content: string
  attachments: { name: string; size: string; url?: string }[]
  read_at: string | null
  created_at: string
}

interface ThreadWithPreview extends ThreadRow {
  clientName: string
  lastMessageContent: string | null
  lastSenderRole: 'client' | 'admin' | 'team_member' | null
  unread: boolean
}

interface BusinessOption {
  id: string
  name: string
}

type FilterTab = 'all' | 'unread' | 'needs_response'

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ── Skeleton components ──────────────────────────────────────────────

function ThreadSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-ink-6 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="mt-1.5 w-2 h-2 rounded-full bg-ink-6" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 bg-ink-6 rounded" />
            <div className="h-2.5 w-12 bg-ink-6 rounded" />
          </div>
          <div className="h-3 w-40 bg-ink-6 rounded" />
          <div className="h-2.5 w-56 bg-ink-6 rounded" />
        </div>
      </div>
    </div>
  )
}

function MessageSkeleton({ align }: { align: 'left' | 'right' }) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div className="animate-pulse space-y-1.5" style={{ maxWidth: '75%' }}>
        <div className={`h-10 w-48 rounded-xl ${align === 'right' ? 'bg-brand-tint' : 'bg-bg-2'}`} />
        <div className={`h-2.5 w-20 rounded ${align === 'right' ? 'ml-auto' : ''} bg-ink-6`} />
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────

export default function AdminMessagesPage() {
  const supabase = createClient()

  const [threads, setThreads] = useState<ThreadWithPreview[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [newMessage, setNewMessage] = useState('')
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)

  // Compose state
  const [showCompose, setShowCompose] = useState(false)
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [composeBusinessId, setComposeBusinessId] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeContent, setComposeContent] = useState('')
  const [composeSending, setComposeSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // ── Fetch threads (all clients) ────────────────────────────────────

  const fetchThreads = useCallback(async () => {
    const { data: threadRows, error } = await supabase
      .from('message_threads')
      .select('*')
      .order('last_message_at', { ascending: false })

    if (error || !threadRows) {
      setLoadingThreads(false)
      return
    }

    // Get unique business IDs and fetch names
    const bizIds = [...new Set(threadRows.map((t: ThreadRow) => t.business_id))]
    const { data: bizRows } = await supabase
      .from('businesses')
      .select('id, name')
      .in('id', bizIds)

    const bizMap: Record<string, string> = {}
    if (bizRows) {
      bizRows.forEach((b: { id: string; name: string }) => {
        bizMap[b.id] = b.name
      })
    }

    // Enrich each thread
    const enriched: ThreadWithPreview[] = await Promise.all(
      threadRows.map(async (thread: ThreadRow) => {
        // Get last message
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content, sender_role')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Check for unread (client messages with no read_at)
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', thread.id)
          .eq('sender_role', 'client')
          .is('read_at', null)

        return {
          ...thread,
          clientName: bizMap[thread.business_id] ?? 'Unknown Client',
          lastMessageContent: lastMsg?.content ?? null,
          lastSenderRole: (lastMsg?.sender_role as ThreadWithPreview['lastSenderRole']) ?? null,
          unread: (count ?? 0) > 0,
        }
      })
    )

    setThreads(enriched)
    setLoadingThreads(false)
  }, [supabase])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  // ── Fetch businesses for compose ───────────────────────────────────

  useEffect(() => {
    async function loadBusinesses() {
      const { data } = await supabase
        .from('businesses')
        .select('id, name')
        .order('name')
      if (data) setBusinesses(data)
    }
    loadBusinesses()
  }, [supabase])

  // ── Fetch messages for active thread ───────────────────────────────

  const fetchMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true)

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(data)

      // Mark client messages as read
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('thread_id', threadId)
        .eq('sender_role', 'client')
        .is('read_at', null)

      // Update local thread unread status
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, unread: false } : t
        )
      )
    }

    setLoadingMessages(false)
  }, [supabase])

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId)
    }
  }, [activeThreadId, fetchMessages])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // ── Realtime subscription ──────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('admin-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new as MessageRow

          // If in active thread, append
          if (newMsg.thread_id === activeThreadId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })

            // Mark as read if from client
            if (newMsg.sender_role === 'client' && !newMsg.read_at) {
              supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', newMsg.id)
                .then()
            }
          }

          // Update thread list
          setThreads((prev) => {
            const exists = prev.some((t) => t.id === newMsg.thread_id)
            if (!exists) {
              // New thread created -- refetch all
              fetchThreads()
              return prev
            }

            const updated = prev.map((t) => {
              if (t.id !== newMsg.thread_id) return t
              return {
                ...t,
                lastMessageContent: newMsg.content,
                lastSenderRole: newMsg.sender_role as ThreadWithPreview['lastSenderRole'],
                last_message_at: newMsg.created_at,
                unread:
                  newMsg.thread_id !== activeThreadId && newMsg.sender_role === 'client',
              }
            })
            return updated.sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeThreadId, supabase, fetchThreads])

  // ── Handlers ───────────────────────────────────────────────────────

  function selectThread(id: string) {
    setActiveThreadId(id)
    setMobileShowThread(true)
    setShowCompose(false)
  }

  async function handleSend() {
    if (!newMessage.trim() || !activeThreadId || sending) return

    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const result = await sendMessage(activeThreadId, content)
    if (!result.success) {
      setNewMessage(content)
    }

    setSending(false)
  }

  async function handleCompose() {
    if (!composeBusinessId || !composeSubject.trim() || !composeContent.trim() || composeSending) return

    setComposeSending(true)

    // Create thread
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        business_id: composeBusinessId,
        subject: composeSubject.trim(),
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (threadError || !thread) {
      setComposeSending(false)
      return
    }

    // Send first message via server action
    const result = await sendMessage(thread.id, composeContent.trim())

    if (result.success) {
      setShowCompose(false)
      setComposeBusinessId('')
      setComposeSubject('')
      setComposeContent('')
      await fetchThreads()
      setActiveThreadId(thread.id)
      setMobileShowThread(true)
    }

    setComposeSending(false)
  }

  // ── Filtered threads ───────────────────────────────────────────────

  const filteredThreads = threads.filter((t) => {
    // Search filter
    const matchesSearch =
      searchQuery === '' ||
      t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    // Tab filter
    if (filterTab === 'unread') return t.unread
    if (filterTab === 'needs_response') return t.lastSenderRole === 'client'
    return true
  })

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

  const unreadCount = threads.filter((t) => t.unread).length
  const needsResponseCount = threads.filter((t) => t.lastSenderRole === 'client').length

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Messages</h1>
          <p className="text-ink-3 text-sm mt-1">All client conversations in one place.</p>
        </div>
        <button
          onClick={() => {
            setShowCompose(true)
            setActiveThreadId(null)
            setMobileShowThread(true)
          }}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Compose
        </button>
      </div>

      {/* Main container */}
      <div
        className="bg-white rounded-xl border border-ink-6 overflow-hidden flex"
        style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}
      >
        {/* ── Left column: Thread list ──────────────────────────────── */}
        <div
          className={`w-full lg:w-[35%] border-r border-ink-6 flex flex-col ${
            mobileShowThread ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Search */}
          <div className="p-3 border-b border-ink-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
              <input
                type="text"
                placeholder="Search clients or subjects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-ink-6 bg-white text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-ink-6">
            {([
              { key: 'all' as FilterTab, label: 'All' },
              { key: 'unread' as FilterTab, label: 'Unread', count: unreadCount },
              { key: 'needs_response' as FilterTab, label: 'Needs Response', count: needsResponseCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  filterTab === tab.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-ink-3 hover:text-ink-2'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-brand text-white text-[10px] font-semibold px-1">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <>
                <ThreadSkeleton />
                <ThreadSkeleton />
                <ThreadSkeleton />
                <ThreadSkeleton />
                <ThreadSkeleton />
              </>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-5 h-5 text-ink-4" />
                </div>
                <p className="text-sm font-medium text-ink-2">
                  {searchQuery
                    ? 'No conversations found.'
                    : filterTab === 'unread'
                    ? 'No unread conversations.'
                    : filterTab === 'needs_response'
                    ? 'All caught up!'
                    : 'No messages yet.'}
                </p>
                <p className="text-xs text-ink-4 mt-1">
                  {searchQuery ? 'Try a different search.' : 'Start a conversation with a client.'}
                </p>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`w-full text-left px-4 py-3 border-b border-ink-6 cursor-pointer hover:bg-bg-2 transition-colors ${
                    activeThreadId === thread.id ? 'bg-brand-tint' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className="mt-1.5 flex-shrink-0">
                      {thread.unread ? (
                        <span className="w-2 h-2 rounded-full bg-brand block" />
                      ) : (
                        <span className="w-2 h-2 block" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3
                          className={`text-sm truncate ${
                            thread.unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'
                          }`}
                        >
                          {thread.clientName}
                        </h3>
                        <span className="text-[10px] text-ink-4 flex-shrink-0">
                          {formatTimestamp(thread.last_message_at)}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 truncate ${
                          thread.unread ? 'font-medium text-ink-2' : 'text-ink-4'
                        }`}
                      >
                        {thread.subject}
                      </p>
                      <p className="text-xs text-ink-4 mt-0.5 truncate">
                        {thread.lastMessageContent ?? 'No messages yet'}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right column: Thread detail / Compose ────────────────── */}
        <div className={`flex-1 flex flex-col ${!mobileShowThread ? 'hidden lg:flex' : 'flex'}`}>
          {showCompose ? (
            /* ── Compose new thread ───────────────────────────────── */
            <div className="flex-1 flex flex-col">
              {/* Compose header */}
              <div className="px-4 lg:px-5 py-3 border-b border-ink-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowCompose(false)
                      setMobileShowThread(false)
                    }}
                    className="lg:hidden text-ink-3 hover:text-ink"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </button>
                  <h2 className="text-sm font-semibold text-ink">New Message</h2>
                </div>
                <button
                  onClick={() => {
                    setShowCompose(false)
                    setMobileShowThread(false)
                  }}
                  className="text-ink-3 hover:text-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Compose form */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">Client</label>
                  <select
                    value={composeBusinessId}
                    onChange={(e) => setComposeBusinessId(e.target.value)}
                    className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                  >
                    <option value="">Select a client...</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="What is this about?"
                    className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">Message</label>
                  <textarea
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    placeholder="Write your message..."
                    rows={6}
                    className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                  />
                </div>
              </div>

              {/* Compose footer */}
              <div className="p-3 lg:p-4 border-t border-ink-6">
                <button
                  onClick={handleCompose}
                  disabled={!composeBusinessId || !composeSubject.trim() || !composeContent.trim() || composeSending}
                  className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                >
                  {composeSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Message
                </button>
              </div>
            </div>
          ) : activeThread ? (
            /* ── Thread detail ────────────────────────────────────── */
            <>
              {/* Thread header */}
              <div className="px-4 lg:px-5 py-3 border-b border-ink-6 flex items-center gap-3">
                <button
                  onClick={() => setMobileShowThread(false)}
                  className="lg:hidden text-ink-3 hover:text-ink"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-ink truncate">
                    {activeThread.clientName}
                  </h2>
                  <p className="text-[11px] text-ink-4 truncate">{activeThread.subject}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                {loadingMessages ? (
                  <>
                    <MessageSkeleton align="left" />
                    <MessageSkeleton align="right" />
                    <MessageSkeleton align="left" />
                  </>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                    <p className="text-sm text-ink-4">No messages in this thread yet.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.sender_role === 'admin' || msg.sender_role === 'team_member'
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={isAdmin ? 'max-w-[75%] ml-auto' : 'max-w-[75%] mr-auto'}>
                          <div
                            className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                              isAdmin
                                ? 'bg-brand-tint text-ink'
                                : 'bg-bg-2 text-ink'
                            }`}
                          >
                            {msg.content}
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-1 text-[10px] text-ink-4 ${
                              isAdmin ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span>{msg.sender_name}</span>
                            <span>&middot;</span>
                            <span>{formatMessageTime(msg.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="p-3 lg:p-4 border-t border-ink-6">
                <div className="flex items-end gap-2">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="Type a reply..."
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                    className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Empty state ──────────────────────────────────────── */
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-bg-2 flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-ink-4" />
              </div>
              <p className="text-sm font-medium text-ink-2">Select a conversation</p>
              <p className="text-xs text-ink-4 mt-1">
                Choose a thread from the left or compose a new message.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
