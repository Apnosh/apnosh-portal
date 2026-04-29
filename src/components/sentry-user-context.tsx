'use client'

/**
 * Sets the Sentry user/client tags so every error captured while the user
 * is in the dashboard tells us WHICH user and WHICH client hit it.
 *
 * Without this, errors arrive as anonymous and we can't tell if it's one
 * client breaking or all of them. Critical for triage as we onboard more.
 *
 * No-op when Sentry isn't initialized (DSN not set in env).
 */

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useUser } from '@/lib/supabase/hooks'
import { useClient } from '@/lib/client-context'

export default function SentryUserContext() {
  const userQuery = useUser()
  const user = userQuery.data
  const { client } = useClient()

  useEffect(() => {
    if (!user) {
      Sentry.setUser(null)
      return
    }
    Sentry.setUser({
      id: user.id,
      email: user.email ?? undefined,
    })
  }, [user])

  useEffect(() => {
    if (client?.id) {
      Sentry.setTag('client_id', client.id)
      Sentry.setTag('client_slug', client.slug ?? '')
      Sentry.setTag('client_name', client.name ?? '')
    } else {
      Sentry.setTag('client_id', '(none)')
    }
  }, [client])

  return null
}
