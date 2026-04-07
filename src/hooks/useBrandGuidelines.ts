'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BrandGuideline, GuidelineStatus } from '@/types/database'

interface UseBrandGuidelinesResult {
  guidelines: BrandGuideline | null
  loading: boolean
  error: Error | null
  refetch: () => void
  updateSection: (section: string, data: Record<string, unknown>) => Promise<boolean>
}

export function useBrandGuidelines(businessId?: string, status?: GuidelineStatus): UseBrandGuidelinesResult {
  const [guidelines, setGuidelines] = useState<BrandGuideline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [trigger, setTrigger] = useState(0)
  const refetch = useCallback(() => setTrigger(n => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function fetch() {
      setLoading(true)
      setError(null)

      try {
        let bId = businessId
        if (!bId) {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Not authenticated')
          const { data: biz } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_id', user.id)
            .single()
          if (!biz) throw new Error('No business found')
          bId = biz.id
        }

        const { data, error: err } = await supabase
          .from('brand_guidelines')
          .select('*')
          .eq('business_id', bId)
          .eq('status', status || 'current')
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!cancelled) {
          if (err) throw new Error(err.message)
          setGuidelines(data as BrandGuideline | null)
        }
      } catch (e) {
        if (!cancelled) setError(e as Error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [businessId, status, trigger])

  const updateSection = useCallback(async (section: string, data: Record<string, unknown>): Promise<boolean> => {
    if (!guidelines) return false
    const supabase = createClient()

    const { error: err } = await supabase
      .from('brand_guidelines')
      .update({
        [section]: data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', guidelines.id)

    if (err) {
      setError(new Error(err.message))
      return false
    }

    refetch()
    return true
  }, [guidelines, refetch])

  return { guidelines, loading, error, refetch, updateSection }
}
