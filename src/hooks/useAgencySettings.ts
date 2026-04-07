'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AgencySettings } from '@/types/database'

interface UseAgencySettingsResult {
  settings: AgencySettings | null
  loading: boolean
  error: Error | null
  refetch: () => void
  update: (updates: Partial<AgencySettings>) => Promise<void>
}

export function useAgencySettings(): UseAgencySettingsResult {
  const [settings, setSettings] = useState<AgencySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [trigger, setTrigger] = useState(0)
  const refetch = useCallback(() => setTrigger(n => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function fetch() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('agency_settings')
        .select('*')
        .limit(1)
        .single()

      if (!cancelled) {
        if (err) setError(new Error(err.message))
        else setSettings(data as AgencySettings)
        setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [trigger])

  const update = useCallback(async (updates: Partial<AgencySettings>) => {
    if (!settings) return
    const supabase = createClient()
    const { error: err } = await supabase
      .from('agency_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', settings.id)

    if (err) throw new Error(err.message)
    refetch()
  }, [settings, refetch])

  return { settings, loading, error, refetch, update }
}
