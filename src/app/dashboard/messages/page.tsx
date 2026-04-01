'use client'

import { useState } from 'react'
import {
  Search, Plus, Send, Paperclip, MessageSquare, FileText, ChevronRight,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

interface Message {
  id: string
  sender: 'client' | 'team'
  senderName: string
  text: string
  timestamp: string
  attachment?: { name: string; size: string }
}

interface Thread {
  id: string
  subject: string
  lastMessage: string
  lastTimestamp: string
  unread: boolean
  relatedOrder?: string
  messages: Message[]
}

// ── Mock Data ────────────────────────────────────────────────────────

const mockThreads: Thread[] = [
  {
    id: '1',
    subject: 'March content calendar review',
    lastMessage: 'Looks great! Just one small tweak on the St. Patrick\'s post.',
    lastTimestamp: '2h ago',
    unread: true,
    messages: [
      { id: '1a', sender: 'team', senderName: 'Sarah K.', text: 'Hi Matt! We\'ve finalized the content calendar for March. You can preview everything in the Calendar tab. Let us know if you\'d like any changes!', timestamp: 'Mar 18, 10:30 AM' },
      { id: '1b', sender: 'client', senderName: 'Matt Butler', text: 'Thanks Sarah! I\'ll take a look this afternoon. Quick question — are we doing a St. Patrick\'s Day promo this year?', timestamp: 'Mar 18, 2:15 PM' },
      { id: '1c', sender: 'team', senderName: 'Sarah K.', text: 'Absolutely! We have a themed post + story series planned for the 14th through 17th. Green-themed cocktails and a special menu highlight. I\'ll send you the mockups shortly.', timestamp: 'Mar 18, 3:00 PM' },
      { id: '1d', sender: 'client', senderName: 'Matt Butler', text: 'Looks great! Just one small tweak on the St. Patrick\'s post. Can we change the caption to emphasize the live music angle? We booked a band for that night.', timestamp: 'Mar 19, 9:45 AM' },
      { id: '1e', sender: 'team', senderName: 'Sarah K.', text: 'Awesome, love that addition! I\'ll update the caption and resubmit for your approval. Should be in the Approvals tab within the hour.', timestamp: 'Mar 19, 10:12 AM' },
    ],
  },
  {
    id: '2',
    subject: 'Website redesign update',
    lastMessage: 'The new homepage mockup is attached for your review.',
    lastTimestamp: '1d ago',
    unread: true,
    relatedOrder: 'ORD-005',
    messages: [
      { id: '2a', sender: 'team', senderName: 'Jason R.', text: 'Hey Matt, quick update on the website redesign. We\'ve completed the wireframes and are moving into the visual design phase.', timestamp: 'Mar 15, 11:00 AM' },
      { id: '2b', sender: 'client', senderName: 'Matt Butler', text: 'Exciting! Can\'t wait to see it. Are we still on track for the end of March launch?', timestamp: 'Mar 15, 1:30 PM' },
      { id: '2c', sender: 'team', senderName: 'Jason R.', text: 'We\'re looking good for an April 1st soft launch. The new homepage mockup is attached for your review.', timestamp: 'Mar 17, 9:00 AM', attachment: { name: 'Homepage_V2_Mockup.pdf', size: '2.4 MB' } },
    ],
  },
  {
    id: '3',
    subject: 'Invoice question',
    lastMessage: 'That makes sense, thank you for clarifying!',
    lastTimestamp: '3d ago',
    unread: false,
    messages: [
      { id: '3a', sender: 'client', senderName: 'Matt Butler', text: 'Hi, I noticed an extra charge on the February invoice — $200 for "Brand Identity Add-on". Can you clarify what that covers?', timestamp: 'Mar 12, 10:00 AM' },
      { id: '3b', sender: 'team', senderName: 'Lisa M.', text: 'Good catch, Matt! That\'s for the additional logo variations and brand color palette expansion you requested on Feb 8th. It was a one-time add-on to the Brand Strategy package.', timestamp: 'Mar 12, 11:30 AM' },
      { id: '3c', sender: 'client', senderName: 'Matt Butler', text: 'That makes sense, thank you for clarifying!', timestamp: 'Mar 12, 12:15 PM' },
    ],
  },
  {
    id: '4',
    subject: 'New social strategy proposal',
    lastMessage: 'We recommend adding TikTok to the mix for Q2.',
    lastTimestamp: '5d ago',
    unread: false,
    messages: [
      { id: '4a', sender: 'team', senderName: 'Sarah K.', text: 'Hey Matt! After reviewing your Q1 performance, we\'d like to propose some changes for Q2. The analytics are looking strong on Instagram but we think there\'s an opportunity on TikTok.', timestamp: 'Mar 8, 2:00 PM' },
      { id: '4b', sender: 'client', senderName: 'Matt Butler', text: 'I\'ve been thinking the same thing. What would the strategy look like?', timestamp: 'Mar 9, 9:00 AM' },
      { id: '4c', sender: 'team', senderName: 'Sarah K.', text: 'We recommend adding TikTok to the mix for Q2. We\'d do 3 short-form videos per week — behind the scenes, recipe tips, and trending audio remixes. The engagement potential is huge for restaurants right now.', timestamp: 'Mar 9, 11:00 AM' },
      { id: '4d', sender: 'team', senderName: 'Sarah K.', text: 'I\'ve attached a full proposal doc with benchmarks and content examples.', timestamp: 'Mar 9, 11:02 AM', attachment: { name: 'Q2_TikTok_Proposal.pdf', size: '1.8 MB' } },
      { id: '4e', sender: 'client', senderName: 'Matt Butler', text: 'This looks solid. Let me review the proposal over the weekend and I\'ll get back to you Monday.', timestamp: 'Mar 9, 3:30 PM' },
      { id: '4f', sender: 'team', senderName: 'Sarah K.', text: 'Sounds great, no rush! Let us know if you have any questions.', timestamp: 'Mar 9, 3:45 PM' },
    ],
  },
  {
    id: '5',
    subject: 'Photo shoot scheduling',
    lastMessage: 'Thursday at 2 PM works perfectly for us!',
    lastTimestamp: '1w ago',
    unread: false,
    messages: [
      { id: '5a', sender: 'team', senderName: 'Jason R.', text: 'Hi Matt! We need to schedule a product photo shoot for the new spring menu items. When works best for you this week?', timestamp: 'Mar 3, 10:00 AM' },
      { id: '5b', sender: 'client', senderName: 'Matt Butler', text: 'How about Thursday afternoon? The restaurant is quieter between 2-5 PM.', timestamp: 'Mar 3, 12:00 PM' },
      { id: '5c', sender: 'team', senderName: 'Jason R.', text: 'Thursday at 2 PM works perfectly for us! We\'ll bring the full setup — expect about 2 hours. We\'ll also need the new dishes plated and ready. Sound good?', timestamp: 'Mar 3, 1:15 PM' },
    ],
  },
]

// ── Component ────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [threads] = useState(mockThreads)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [mobileShowThread, setMobileShowThread] = useState(false)

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

  const filteredThreads = threads.filter(
    (t) =>
      searchQuery === '' ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  function selectThread(id: string) {
    setActiveThreadId(id)
    setMobileShowThread(true)
  }

  function handleSend() {
    if (!newMessage.trim()) return
    // In production this would POST to an API
    setNewMessage('')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Messages</h1>
        <p className="text-ink-3 text-sm mt-1">Communicate with your Apnosh team.</p>
      </div>

      {/* Main container */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>

        {/* Left column — Thread list */}
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
              <button className="w-9 h-9 rounded-lg bg-brand-dark text-white flex items-center justify-center hover:bg-brand-dark/90 transition-colors flex-shrink-0">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-ink-4">No conversations found.</p>
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
                        <span className="text-[10px] text-ink-4 flex-shrink-0">{thread.lastTimestamp}</span>
                      </div>
                      <p className="text-xs text-ink-4 mt-0.5 truncate">{thread.lastMessage}</p>
                      {thread.relatedOrder && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          <FileText className="w-2.5 h-2.5" />
                          {thread.relatedOrder}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right column — Active thread */}
        <div className={`flex-1 flex flex-col ${!mobileShowThread ? 'hidden lg:flex' : 'flex'}`}>
          {activeThread ? (
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
                    Matt Butler, Apnosh Team
                  </p>
                </div>
                {activeThread.relatedOrder && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    <FileText className="w-2.5 h-2.5" />
                    {activeThread.relatedOrder}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
                {activeThread.messages.map((msg) => {
                  const isClient = msg.sender === 'client'
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
                          {msg.text}
                        </div>
                        {msg.attachment && (
                          <div className={`mt-1.5 ${isClient ? 'text-right' : 'text-left'}`}>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-ink-6 text-xs text-ink-2 hover:bg-bg-2 transition-colors cursor-pointer">
                              <Paperclip className="w-3 h-3 text-ink-4" />
                              {msg.attachment.name}
                              <span className="text-ink-4">({msg.attachment.size})</span>
                            </span>
                          </div>
                        )}
                        <div className={`mt-1 text-[10px] text-ink-4 ${isClient ? 'text-right' : 'text-left'}`}>
                          {msg.senderName} &middot; {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  )
                })}
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
                    disabled={!newMessage.trim()}
                    className="w-9 h-9 rounded-lg bg-brand-dark text-white flex items-center justify-center hover:bg-brand-dark/90 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
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
