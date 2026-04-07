'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Search, Plus, Send, Paperclip, MessageSquare, FileText, ChevronRight, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage, createThread } from '@/lib/actions'

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
  lastMessageContent: string | null
  unread: boolean
}

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

// ── Component ────────────────────────────────────────────────────────

export default function MessagesPage() {
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [threads, setThreads] = useState<ThreadWithPreview[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)

  // Compose state
  const [showCompose, setShowCompose] = useState(false)
  const [composeSubject, setComposeSubject] = useState('')
  const [composeContent, setComposeContent] = useState('')
  const [composeSending, setComposeSending] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // ── Fetch user + business ──────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (business) {
        setBusinessId(business.id)
      } else {
        setLoadingThreads(false)
      }
    }

    init()
  }, [supabase])

  // ── Fetch threads ──────────────────────────────────────────────────

  const fetchThreads = useCallback(async () => {
    if (!businessId || !userId) return

    const { data: threadRows, error } = await supabase
      .from('message_threads')
      .select('*')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false })

    if (error || !threadRows) {
      setLoadingThreads(false)
      return
    }

    // For each thread, get the latest message + unread status
    const enriched: ThreadWithPreview[] = await Promise.all(
      threadRows.map(async (thread: ThreadRow) => {
        // Get last message content
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Check for unread messages (messages not sent by me, with no read_at)
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('thread_id', thread.id)
          .neq('sender_id', userId)
          .is('read_at', null)

        return {
          ...thread,
          lastMessageContent: lastMsg?.content ?? null,
          unread: (count ?? 0) > 0,
        }
      })
    )

    setThreads(enriched)
    setLoadingThreads(false)
  }, [businessId, userId, supabase])

  useEffect(() => {
    fetchThreads()
  }, [fetchThreads])

  // ── Fetch messages for active thread ───────────────────────────────

  const fetchMessages = useCallback(async (threadId: string) => {
    if (!businessId || !userId) return

    setLoadingMessages(true)

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(data)

      // Mark unread messages as read
      const unreadIds = data
        .filter((m: MessageRow) => m.sender_id !== userId && !m.read_at)
        .map((m: MessageRow) => m.id)

      if (unreadIds.length > 0) {
        await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds)

        // Update thread unread status locally
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, unread: false } : t
          )
        )
      }
    }

    setLoadingMessages(false)
  }, [businessId, userId, supabase])

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId)
    }
  }, [activeThreadId, fetchMessages])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // ── Realtime subscription ──────────────────────────────────────────

  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow

          // If message is in the active thread, add it to messages
          if (newMsg.thread_id === activeThreadId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })

            // Mark as read if it's from someone else
            if (newMsg.sender_id !== userId && !newMsg.read_at) {
              supabase
                .from('messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', newMsg.id)
                .then()
            }
          }

          // Update thread list preview and order
          setThreads((prev) => {
            const updated = prev.map((t) => {
              if (t.id !== newMsg.thread_id) return t
              return {
                ...t,
                lastMessageContent: newMsg.content,
                last_message_at: newMsg.created_at,
                unread: newMsg.thread_id !== activeThreadId && newMsg.sender_id !== userId,
              }
            })
            // Re-sort by last_message_at descending
            return updated.sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, activeThreadId, userId, supabase])

  // ── Handlers ───────────────────────────────────────────────────────

  function selectThread(id: string) {
    setActiveThreadId(id)
    setMobileShowThread(true)
  }

  async function handleSend() {
    if (!newMessage.trim() || !activeThreadId || sending) return

    const messageContent = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const result = await sendMessage(activeThreadId, messageContent)

    if (!result.success) {
      // Restore message on failure
      setNewMessage(messageContent)
    }

    setSending(false)
  }

  async function handleCompose() {
    if (!composeSubject.trim() || !composeContent.trim() || composeSending) return

    setComposeSending(true)
    const result = await createThread(composeSubject.trim(), composeContent.trim())

    if (result.success && result.threadId) {
      setShowCompose(false)
      setComposeSubject('')
      setComposeContent('')
      await fetchThreads()
      setActiveThreadId(result.threadId)
      setMobileShowThread(true)
    }

    setComposeSending(false)
  }

  // ── Filtered threads ───────────────────────────────────────────────

  const filteredThreads = threads.filter(
    (t) =>
      searchQuery === '' ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.lastMessageContent ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Messages</h1>
        <p className="text-ink-3 text-sm mt-1">Communicate with your Apnosh team.</p>
      </div>

      {/* Main container */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>

        {/* Left column -- Thread list */}
        <div className={`w-full lg:w-[35%] border-r border-ink-6 flex flex-col ${mobileShowThread ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search + New */}
          <div className="p-3 border-b border-ink-6 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-ink-6 bg-white text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                />
              </div>
              <button
                onClick={() => {
                  setShowCompose(true)
                  setActiveThreadId(null)
                  setMobileShowThread(true)
                }}
                className="w-9 h-9 rounded-lg bg-brand-dark text-white flex items-center justify-center hover:bg-brand-dark/90 transition-colors flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
                  <MessageSquare className="w-5 h-5 text-ink-4" />
                </div>
                <p className="text-sm font-medium text-ink-2">
                  {searchQuery ? 'No conversations found.' : 'No messages yet.'}
                </p>
                <p className="text-xs text-ink-4 mt-1">
                  {searchQuery ? 'Try a different search.' : 'Your Apnosh team will reach out soon.'}
                </p>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={`w-full text-left px-4 py-3.5 border-b border-ink-6 hover:bg-bg-2/50 transition-colors ${
                    activeThreadId === thread.id ? 'bg-brand-tint/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread dot */}
                    <div className="mt-1.5 flex-shrink-0">
                      {thread.unread ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-brand block" />
                      ) : (
                        <span className="w-2.5 h-2.5 block" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-sm truncate ${thread.unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
                          {thread.subject}
                        </h3>
                        <span className="text-[10px] text-ink-4 flex-shrink-0">
                          {formatTimestamp(thread.last_message_at)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-4 mt-0.5 truncate">
                        {thread.lastMessageContent ?? 'No messages yet'}
                      </p>
                      {thread.order_id && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          <FileText className="w-2.5 h-2.5" />
                          {thread.order_id}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right column -- Active thread */}
        <div className={`flex-1 flex flex-col ${!mobileShowThread ? 'hidden lg:flex' : 'flex'}`}>
          {showCompose ? (
            /* ── Compose new thread ─────────────────────────────── */
            <div className="flex-1 flex flex-col">
              <div className="px-4 lg:px-5 py-3 border-b border-ink-6 flex items-center gap-3">
                <button
                  onClick={() => { setShowCompose(false); setMobileShowThread(false) }}
                  className="lg:hidden text-ink-3 hover:text-ink"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <h2 className="text-sm font-semibold text-ink">New Message</h2>
              </div>
              <div className="flex-1 p-4 lg:p-5 space-y-4">
                <div>
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Subject</label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="What can we help with?"
                    className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">Message</label>
                  <textarea
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    placeholder="Type your message..."
                    rows={6}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors resize-none"
                  />
                </div>
              </div>
              <div className="p-3 lg:p-4 border-t border-ink-6 flex items-center justify-between">
                <button
                  onClick={() => { setShowCompose(false); setMobileShowThread(false) }}
                  className="text-sm text-ink-3 hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompose}
                  disabled={!composeSubject.trim() || !composeContent.trim() || composeSending}
                  className="bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-brand-dark/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {composeSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </button>
              </div>
            </div>
          ) : activeThread ? (
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
                  <h2 className="text-sm font-semibold text-ink truncate">{activeThread.subject}</h2>
                  <p className="text-[11px] text-ink-4">
                    {messages.length > 0
                      ? [...new Set(messages.map((m) => m.sender_name))].join(', ')
                      : 'Loading...'}
                  </p>
                </div>
                {activeThread.order_id && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    <FileText className="w-2.5 h-2.5" />
                    {activeThread.order_id}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                {loadingMessages ? (
                  <div className="flex-1 flex justify-center items-center py-12">
                    <Loader2 className="w-5 h-5 text-ink-4 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                    <p className="text-sm text-ink-4">No messages in this thread yet.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isClient = msg.sender_role === 'client'
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] lg:max-w-[70%] ${isClient ? 'order-1' : ''}`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              isClient
                                ? 'bg-brand-tint text-ink rounded-br-md'
                                : 'bg-bg-2 text-ink rounded-bl-md'
                            }`}
                          >
                            {msg.content}
                          </div>
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`mt-1.5 ${isClient ? 'text-right' : 'text-left'}`}>
                              {msg.attachments.map((att, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-ink-6 text-xs text-ink-2 hover:bg-bg-2 transition-colors cursor-pointer mr-1.5 mb-1"
                                >
                                  <Paperclip className="w-3 h-3 text-ink-4" />
                                  {att.name}
                                  {att.size && <span className="text-ink-4">({att.size})</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className={`mt-1 text-[10px] text-ink-4 ${isClient ? 'text-right' : 'text-left'}`}>
                            {msg.sender_name} &middot; {formatMessageTime(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-3 lg:p-4 border-t border-ink-6">
                <div className="flex items-end gap-2">
                  <button className="w-9 h-9 rounded-lg border border-ink-6 flex items-center justify-center text-ink-4 hover:bg-bg-2 hover:text-ink-2 transition-colors flex-shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-ink-6 px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                    className="w-9 h-9 rounded-lg bg-brand-dark text-white flex items-center justify-center hover:bg-brand-dark/90 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
            /* Empty state -- no thread selected */
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="w-16 h-16 rounded-2xl bg-bg-2 flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-ink-4" />
              </div>
              <p className="text-sm font-medium text-ink-2">Select a conversation to get started</p>
              <p className="text-xs text-ink-4 mt-1">Choose a thread from the left or start a new message.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
