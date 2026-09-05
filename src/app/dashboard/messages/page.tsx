'use client'
import { useState } from 'react'
import { TopSearch } from '@/components/mvp/top-row'

/**
 * Owner Messages — full-screen mobile app surface (apnosh-mvp shell). Reached
 * from the header messages icon. The owner messages the specific person they
 * need (strategist, videographer, photographer, etc.); MvpMessages handles the
 * real message_threads/messages data and lazy thread creation.
 */
import MvpShell from '@/components/mvp/mvp-shell'
import MvpMessages from '@/components/mvp/mvp-messages'

export default function MessagesPage() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <MvpShell active="messages" noHeader={open} middle={<TopSearch value={query} onChange={setQuery} placeholder="Search inbox" />}>
      <MvpMessages query={query} onActiveChange={setOpen} />
    </MvpShell>
  )
}
