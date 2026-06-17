'use client'

/**
 * Owner Messages — full-screen mobile app surface (apnosh-mvp shell). Reached
 * from the header messages icon. The owner messages the specific person they
 * need (strategist, videographer, photographer, etc.); MvpMessages handles the
 * real message_threads/messages data and lazy thread creation.
 */
import MvpShell from '@/components/mvp/mvp-shell'
import MvpMessages from '@/components/mvp/mvp-messages'

export default function MessagesPage() {
  return (
    <MvpShell active="messages">
      <MvpMessages />
    </MvpShell>
  )
}
