'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  UserProfile,
  Business,
  Order,
  OrderStatus,
  Deliverable,
  DeliverableStatus,
  Notification,
  MessageThread,
  Message,
  AnalyticsSnapshot,
  Platform,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Generic hook return type
// ---------------------------------------------------------------------------

interface UseQueryResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

// ---------------------------------------------------------------------------
// Simulated async fetch (mock helper)
// ---------------------------------------------------------------------------

function useMockQuery<T>(mockData: T, delay = 500): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [trigger, setTrigger] = useState(0)

  const refetch = useCallback(() => setTrigger((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const timer = setTimeout(() => {
      if (!cancelled) {
        setData(mockData)
        setLoading(false)
      }
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // re-run when refetch is triggered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  return { data, loading, error, refetch }
}

// ---------------------------------------------------------------------------
// useUser — returns the current authenticated user profile
// ---------------------------------------------------------------------------

// TODO: Replace with Supabase query
// const { data: { user } } = await supabase.auth.getUser()
// const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()

export function useUser(): UseQueryResult<UserProfile> {
  const mock: UserProfile = {
    id: 'usr_mock_001',
    email: 'matt@example.com',
    full_name: 'Matt Butler',
    avatar_url: undefined,
    role: 'client',
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-03-01T14:30:00Z',
  }

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useBusiness — returns the user's business profile
// ---------------------------------------------------------------------------

export interface UseBusinessParams {
  businessId?: string
}

// TODO: Replace with Supabase query
// const { data } = await supabase
//   .from('businesses')
//   .select('*')
//   .eq('owner_id', user.id)
//   .single()

export function useBusiness(params?: UseBusinessParams): UseQueryResult<Business> {
  void params // will be used when wired to Supabase

  const mock: Business = {
    id: 'biz_mock_001',
    owner_id: 'usr_mock_001',
    name: 'Sunrise Bakery',
    industry: 'Food & Beverage',
    description: 'Artisan bakery specializing in sourdough and pastries.',
    website_url: 'https://sunrisebakery.com',
    phone: '(555) 123-4567',
    locations: [{ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', is_primary: true }],
    brand_voice_words: ['warm', 'artisan', 'welcoming'],
    brand_colors: { primary: '#4abd98', secondary: '#f5e6c8' },
    competitors: [{ name: 'Daily Bread Co', website_url: 'https://dailybreadco.com' }],
    current_platforms: ['instagram', 'facebook', 'google_business'],
    marketing_goals: ['increase foot traffic', 'grow Instagram following'],
    onboarding_completed: true,
    onboarding_step: 5,
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-03-01T14:30:00Z',
  }

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useOrders — returns orders for the business
// ---------------------------------------------------------------------------

export interface UseOrdersParams {
  businessId?: string
  status?: OrderStatus
  limit?: number
}

// TODO: Replace with Supabase query
// const query = supabase
//   .from('orders')
//   .select('*')
//   .eq('business_id', businessId)
//   .order('created_at', { ascending: false })
// if (status) query = query.eq('status', status)
// if (limit) query = query.limit(limit)

export function useOrders(params?: UseOrdersParams): UseQueryResult<Order[]> {
  void params

  const mock: Order[] = [
    {
      id: 'ord_001',
      business_id: 'biz_mock_001',
      type: 'subscription',
      service_name: 'Social Media Management — Essentials',
      quantity: 1,
      unit_price: 499,
      total_price: 499,
      status: 'in_progress',
      created_at: '2025-02-01T09:00:00Z',
      updated_at: '2025-03-01T09:00:00Z',
    },
    {
      id: 'ord_002',
      business_id: 'biz_mock_001',
      type: 'one_time',
      service_name: 'Brand Photography Session',
      quantity: 1,
      unit_price: 350,
      total_price: 350,
      status: 'completed',
      deadline: '2025-02-20T17:00:00Z',
      created_at: '2025-02-05T11:00:00Z',
      updated_at: '2025-02-20T16:00:00Z',
    },
    {
      id: 'ord_003',
      business_id: 'biz_mock_001',
      type: 'a_la_carte',
      service_name: 'Email Newsletter Design',
      quantity: 2,
      unit_price: 75,
      total_price: 150,
      status: 'pending',
      created_at: '2025-03-10T08:00:00Z',
      updated_at: '2025-03-10T08:00:00Z',
    },
  ]

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useDeliverables — returns deliverables pending review
// ---------------------------------------------------------------------------

export interface UseDeliverablesParams {
  businessId?: string
  status?: DeliverableStatus
  limit?: number
}

// TODO: Replace with Supabase query
// const query = supabase
//   .from('deliverables')
//   .select('*')
//   .eq('business_id', businessId)
//   .order('created_at', { ascending: false })
// if (status) query = query.eq('status', status)
// if (limit) query = query.limit(limit)

export function useDeliverables(params?: UseDeliverablesParams): UseQueryResult<Deliverable[]> {
  void params

  const mock: Deliverable[] = [
    {
      id: 'del_001',
      work_brief_id: 'wb_001',
      business_id: 'biz_mock_001',
      type: 'graphic',
      title: 'Instagram Carousel — Spring Specials',
      description: '5-slide carousel showcasing new spring menu items',
      content: {
        caption: 'Spring has sprung at Sunrise Bakery! Swipe to see our new seasonal favorites.',
        hashtags: ['#SunriseBakery', '#SpringMenu', '#AustinEats'],
        platform: 'instagram',
        dimensions: '1080x1080',
      },
      file_urls: ['/mock/carousel-1.png', '/mock/carousel-2.png'],
      preview_urls: ['/mock/carousel-1-thumb.png', '/mock/carousel-2-thumb.png'],
      version: 1,
      status: 'client_review',
      created_at: '2025-03-12T09:00:00Z',
      updated_at: '2025-03-12T09:00:00Z',
    },
    {
      id: 'del_002',
      work_brief_id: 'wb_002',
      business_id: 'biz_mock_001',
      type: 'video',
      title: 'Behind-the-Scenes Reel — Sourdough Process',
      content: {
        caption: 'From starter to loaf. 48 hours of patience in 30 seconds.',
        hashtags: ['#Sourdough', '#BehindTheScenes'],
        platform: 'instagram',
      },
      file_urls: ['/mock/reel.mp4'],
      preview_urls: ['/mock/reel-thumb.png'],
      version: 2,
      status: 'client_review',
      revision_notes: 'Updated color grading per feedback',
      created_at: '2025-03-11T14:00:00Z',
      updated_at: '2025-03-13T10:00:00Z',
    },
  ]

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useNotifications — returns notifications for the user
// ---------------------------------------------------------------------------

export interface UseNotificationsParams {
  unreadOnly?: boolean
  limit?: number
}

// TODO: Replace with Supabase query
// const query = supabase
//   .from('notifications')
//   .select('*')
//   .eq('user_id', user.id)
//   .order('created_at', { ascending: false })
// if (unreadOnly) query = query.is('read_at', null)
// if (limit) query = query.limit(limit)

export function useNotifications(params?: UseNotificationsParams): UseQueryResult<Notification[]> {
  void params

  const mock: Notification[] = [
    {
      id: 'notif_001',
      user_id: 'usr_mock_001',
      type: 'approval_needed',
      title: 'New deliverable ready for review',
      body: 'Instagram Carousel — Spring Specials is ready for your approval.',
      link: '/dashboard/approvals/del_001',
      created_at: '2025-03-12T09:05:00Z',
    },
    {
      id: 'notif_002',
      user_id: 'usr_mock_001',
      type: 'order_confirmed',
      title: 'Order confirmed',
      body: 'Your order for Email Newsletter Design has been confirmed.',
      link: '/dashboard/orders',
      read_at: '2025-03-10T09:00:00Z',
      created_at: '2025-03-10T08:30:00Z',
    },
    {
      id: 'notif_003',
      user_id: 'usr_mock_001',
      type: 'report_ready',
      title: 'Monthly analytics report ready',
      body: 'Your February 2025 performance report is available.',
      link: '/dashboard/analytics',
      created_at: '2025-03-01T07:00:00Z',
    },
  ]

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useMessages — returns message threads (and messages within a thread)
// ---------------------------------------------------------------------------

export interface UseMessagesParams {
  threadId?: string
  businessId?: string
  limit?: number
}

// TODO: Replace with Supabase query
// Threads: supabase.from('message_threads').select('*').eq('business_id', businessId).order('last_message_at', { ascending: false })
// Messages: supabase.from('messages').select('*').eq('thread_id', threadId).order('created_at', { ascending: true })

export function useMessages(params?: UseMessagesParams): UseQueryResult<MessageThread[]> {
  void params

  const mock: MessageThread[] = [
    {
      id: 'thread_001',
      business_id: 'biz_mock_001',
      subject: 'Spring Campaign — Content Direction',
      order_id: 'ord_001',
      last_message_at: '2025-03-12T11:30:00Z',
      created_at: '2025-03-05T10:00:00Z',
    },
    {
      id: 'thread_002',
      business_id: 'biz_mock_001',
      subject: 'Brand photography schedule',
      order_id: 'ord_002',
      last_message_at: '2025-02-18T15:00:00Z',
      created_at: '2025-02-10T09:00:00Z',
    },
  ]

  return useMockQuery(mock)
}

export function useThreadMessages(threadId: string): UseQueryResult<Message[]> {
  void threadId

  // TODO: Replace with Supabase query
  // const { data } = await supabase
  //   .from('messages')
  //   .select('*')
  //   .eq('thread_id', threadId)
  //   .order('created_at', { ascending: true })

  const mock: Message[] = [
    {
      id: 'msg_001',
      business_id: 'biz_mock_001',
      thread_id: 'thread_001',
      sender_id: 'usr_team_001',
      sender_name: 'Sarah (Apnosh)',
      sender_role: 'team_member',
      content: 'Hi Matt! I have a few content ideas for the spring campaign. Would you prefer a focus on seasonal menu items or the bakery story?',
      attachments: [],
      created_at: '2025-03-05T10:00:00Z',
    },
    {
      id: 'msg_002',
      business_id: 'biz_mock_001',
      thread_id: 'thread_001',
      sender_id: 'usr_mock_001',
      sender_name: 'Matt Butler',
      sender_role: 'client',
      content: 'Let\'s go with seasonal menu items! We have some great new pastries launching.',
      attachments: [],
      read_at: '2025-03-05T14:00:00Z',
      created_at: '2025-03-05T12:30:00Z',
    },
  ]

  return useMockQuery(mock)
}

// ---------------------------------------------------------------------------
// useAnalytics — returns analytics data for the business
// ---------------------------------------------------------------------------

export interface UseAnalyticsParams {
  businessId?: string
  platform?: Platform
  dateFrom?: string
  dateTo?: string
}

// TODO: Replace with Supabase query
// const query = supabase
//   .from('analytics_snapshots')
//   .select('*')
//   .eq('business_id', businessId)
//   .order('date', { ascending: false })
// if (platform) query = query.eq('platform', platform)
// if (dateFrom) query = query.gte('date', dateFrom)
// if (dateTo) query = query.lte('date', dateTo)

export function useAnalytics(params?: UseAnalyticsParams): UseQueryResult<AnalyticsSnapshot[]> {
  void params

  const mock: AnalyticsSnapshot[] = [
    {
      id: 'snap_001',
      business_id: 'biz_mock_001',
      platform: 'instagram',
      date: '2025-03-01',
      metrics: {
        followers: 2340,
        followers_change: 87,
        reach: 18200,
        impressions: 24300,
        engagement_rate: 4.2,
        posts_count: 12,
        website_clicks: 156,
        profile_visits: 430,
      },
      created_at: '2025-03-01T00:00:00Z',
    },
    {
      id: 'snap_002',
      business_id: 'biz_mock_001',
      platform: 'facebook',
      date: '2025-03-01',
      metrics: {
        followers: 1120,
        followers_change: 23,
        reach: 8400,
        impressions: 11200,
        engagement_rate: 2.8,
        posts_count: 8,
        website_clicks: 89,
        profile_visits: 210,
      },
      created_at: '2025-03-01T00:00:00Z',
    },
    {
      id: 'snap_003',
      business_id: 'biz_mock_001',
      platform: 'google_business',
      date: '2025-03-01',
      metrics: {
        impressions: 5600,
        website_clicks: 320,
        profile_visits: 890,
      },
      created_at: '2025-03-01T00:00:00Z',
    },
  ]

  return useMockQuery(mock)
}
