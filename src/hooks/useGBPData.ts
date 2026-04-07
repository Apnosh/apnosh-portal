'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { GBPMonthlyData } from '@/types/database'

interface UseGBPDataParams {
  businessId?: string
  months?: number // how many months back (default 6)
}

interface UseGBPDataResult {
  data: GBPMonthlyData[]
  loading: boolean
  error: Error | null
  refetch: () => void
}

export function useGBPData(params?: UseGBPDataParams): UseGBPDataResult {
  const [data, setData] = useState<GBPMonthlyData[]>([])
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
        let query = supabase
          .from('gbp_monthly_data')
          .select('*')
          .order('year', { ascending: false })
          .order('month', { ascending: false })

        if (params?.businessId) {
          query = query.eq('business_id', params.businessId)
        }

        if (params?.months) {
          const now = new Date()
          const cutoff = new Date(now.getFullYear(), now.getMonth() - params.months, 1)
          // Filter: year > cutoff year, OR (year == cutoff year AND month >= cutoff month)
          query = query.or(
            `year.gt.${cutoff.getFullYear()},and(year.eq.${cutoff.getFullYear()},month.gte.${cutoff.getMonth() + 1})`
          )
        }

        const { data: rows, error: err } = await query

        if (!cancelled) {
          if (err) throw new Error(err.message)
          setData((rows as GBPMonthlyData[]) || [])
        }
      } catch (e) {
        if (!cancelled) setError(e as Error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => { cancelled = true }
  }, [params?.businessId, params?.months, trigger])

  return { data, loading, error, refetch }
}

/** Fetch GBP data for ALL businesses (admin only) */
export function useAllGBPData(months?: number): UseGBPDataResult {
  return useGBPData({ months })
}

/** Fetch GBP data for a single business */
export function useClientGBPData(businessId: string, months?: number): UseGBPDataResult {
  return useGBPData({ businessId, months })
}
