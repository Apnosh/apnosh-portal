'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, X, Camera, Globe, Video, Mail,
  Clock, User, AlertCircle, CheckCircle2, Clapperboard, Aperture,
  PhoneCall, Search, FileBarChart, ClipboardCheck, Star, MapPin,
  Calendar as CalendarIcon, ExternalLink, Filter,
} from 'lucide-react'
import { type Platform } from '@/lib/mock-deliverables'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/supabase/hooks'
import Link from 'next/link'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type EventCategory =
  | 'social' | 'video-shoot' | 'photo-shoot' | 'strategy'
  | 'email' | 'seo' | 'report' | 'website' | 'content-review' | 'milestone'

type EventStatus = 'published' | 'completed' | 'scheduled' | 'pending' | 'changes_requested' | 'confirmed' | 'upcoming' | 'delivered' | 'needs_approval'

interface TimelineEvent {
  id: string
  title: string
  category: EventCategory
  date: number // day of month
  time?: string
  endTime?: string
  duration?: string
  status: EventStatus
  platforms?: Platform[]
  caption?: string
  hashtags?: string[]
  creator?: string
  location?: string
  description?: string
  agenda?: string[]
  subject?: string
  audience?: string
  audienceSize?: number
  reportType?: string
  deadline?: string
  milestoneNote?: string
  seoDetails?: string[]
  shotList?: string[]
  teamMembers?: string[]
  prepNotes?: string
  performanceMetrics?: { impressions?: number; reach?: number; engagement?: string }
}

type FilterCategory = 'all' | 'social' | 'video-photo' | 'strategy' | 'email' | 'seo' | 'reports' | 'milestones'
type FilterStatus = 'all' | 'completed' | 'upcoming' | 'needs_attention'

/* ------------------------------------------------------------------ */
/*  Category config                                                    */
/* ------------------------------------------------------------------ */
const CATEGORY_CONFIG: Record<EventCategory, {
  icon: typeof Camera; label: string; barColor: string; bgColor: string; textColor: string
}> = {
  social:         { icon: Camera,         label: 'Social Post',    barColor: 'bg-rose-400',    bgColor: 'bg-rose-50',    textColor: 'text-rose-700' },
  'video-shoot':  { icon: Clapperboard,   label: 'Video Shoot',    barColor: 'bg-purple-400',  bgColor: 'bg-purple-50',  textColor: 'text-purple-700' },
  'photo-shoot':  { icon: Aperture,       label: 'Photo Shoot',    barColor: 'bg-indigo-400',  bgColor: 'bg-indigo-50',  textColor: 'text-indigo-700' },
  strategy:       { icon: PhoneCall,       label: 'Strategy Call',  barColor: 'bg-blue-400',    bgColor: 'bg-blue-50',    textColor: 'text-blue-700' },
  email:          { icon: Mail,            label: 'Email Campaign', barColor: 'bg-violet-400',  bgColor: 'bg-violet-50',  textColor: 'text-violet-700' },
  seo:            { icon: Search,          label: 'SEO Update',     barColor: 'bg-teal-400',    bgColor: 'bg-teal-50',    textColor: 'text-teal-700' },
  report:         { icon: FileBarChart,    label: 'Report',         barColor: 'bg-green-400',   bgColor: 'bg-green-50',   textColor: 'text-green-700' },
  website:        { icon: Globe,           label: 'Website Update', barColor: 'bg-sky-400',     bgColor: 'bg-sky-50',     textColor: 'text-sky-700' },
  'content-review': { icon: ClipboardCheck, label: 'Content Review', barColor: 'bg-amber-400', bgColor: 'bg-amber-50',   textColor: 'text-amber-700' },
  milestone:      { icon: Star,            label: 'Milestone',      barColor: 'bg-[#4abd98]',   bgColor: 'bg-[#eaf7f3]',  textColor: 'text-[#2e9a78]' },
}

const PLATFORM_ICON: Record<Platform, typeof Camera> = { instagram: Camera, facebook: Globe, tiktok: Video, email: Mail }
const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'IG', facebook: 'FB', tiktok: 'TT', email: 'Email' }

const FILTER_TABS: { key: FilterCategory; label: string; cats: EventCategory[] }[] = [
  { key: 'all',         label: 'All',            cats: [] },
  { key: 'social',      label: 'Social Posts',   cats: ['social'] },
  { key: 'video-photo', label: 'Video & Photo',  cats: ['video-shoot', 'photo-shoot'] },
  { key: 'strategy',    label: 'Strategy',       cats: ['strategy'] },
  { key: 'email',       label: 'Email',          cats: ['email'] },
  { key: 'seo',         label: 'SEO',            cats: ['seo'] },
  { key: 'reports',     label: 'Reports',        cats: ['report', 'content-review'] },
  { key: 'milestones',  label: 'Milestones',     cats: ['milestone', 'website'] },
]

/* ------------------------------------------------------------------ */
/*  Mock data — March 2026                                             */
/* ------------------------------------------------------------------ */
const EVENTS: TimelineEvent[] = [
  // Week 1
  { id:'e1',  title:'Spring Collection Launch',    category:'social',  date:2,  time:'10:00 AM', status:'published', platforms:['instagram'], caption:'Spring is here and so is our new collection! Fresh flavors, vibrant plates.', hashtags:['#SpringMenu','#FreshFlavors','#LocalEats'], creator:'Sarah K.', performanceMetrics:{impressions:2840,reach:1920,engagement:'6.8%'} },
  { id:'e2',  title:'GBP Spring Hours Updated',    category:'seo',     date:3,  status:'completed', seoDetails:['Updated Google Business Profile hours for spring','Added seasonal photos','Updated menu link'] },
  { id:'e3',  title:'Behind the Scenes',           category:'social',  date:4,  time:'2:00 PM',  status:'published', platforms:['tiktok'], caption:'Ever wondered what happens before doors open? Take a peek behind the curtain.', hashtags:['#BTS','#RestaurantLife'], creator:'Mike R.', performanceMetrics:{impressions:5200,reach:3800,engagement:'8.2%'} },
  { id:'e4',  title:'Newsletter #11',              category:'email',   date:5,  time:'9:00 AM',  status:'published', subject:'Spring Has Sprung — New Menu Inside!', audience:'All Subscribers', audienceSize:2340 },
  { id:'e5',  title:'Monthly Strategy Session',    category:'strategy', date:5,  time:'2:00 PM',  duration:'1 hour', status:'completed', agenda:['Review February performance','Spring campaign strategy','Content themes for March','Q2 planning preview'], description:'Monthly strategy alignment call.' },
  { id:'e6',  title:'Customer Spotlight',           category:'social',  date:7,  time:'11:00 AM', status:'published', platforms:['instagram'], caption:'Meet our regulars! This week we spotlight the Johnson family.', hashtags:['#CustomerLove','#Community'], creator:'Sarah K.', performanceMetrics:{impressions:1800,reach:1200,engagement:'7.1%'} },
  // Week 2
  { id:'e7',  title:'Recipe Tip Tuesday',           category:'social',  date:10, time:'12:00 PM', status:'published', platforms:['instagram','facebook'], caption:'Chef\'s secret: a pinch of smoked paprika changes everything.', hashtags:['#RecipeTip','#ChefSecrets'], creator:'Sarah K.', performanceMetrics:{impressions:3100,reach:2200,engagement:'5.9%'} },
  { id:'e8',  title:'Spring Menu Photography',      category:'photo-shoot', date:11, time:'9:00 AM', endTime:'2:00 PM', duration:'5 hours', status:'completed', location:'Main Restaurant — Kitchen & Dining Room', shotList:['Hero shots of 8 new dishes','Ingredient flat-lays','Chef action shots','Ambiance / interior'], teamMembers:['Sarah K. (Creative Director)','James L. (Photographer)','Chef Marco'], prepNotes:'Please have all spring menu dishes prepped by 8:30am. Clean dining area for ambiance shots.' },
  { id:'e9',  title:'Flash Sale Story',             category:'social',  date:12, time:'3:00 PM',  status:'published', platforms:['instagram'], caption:'24 HOURS ONLY — 20% off our spring tasting menu!', hashtags:['#FlashSale','#LimitedTime'], creator:'Mike R.', performanceMetrics:{impressions:4100,reach:2900,engagement:'9.3%'} },
  { id:'e10', title:'February Performance Report',  category:'report',  date:13, status:'delivered', reportType:'Monthly Performance', description:'Full breakdown of February social media, email, and SEO performance.' },
  { id:'e11', title:'St. Patrick\'s Promo',         category:'social',  date:14, time:'10:00 AM', status:'published', platforms:['instagram','facebook','email'], caption:'Go green with us! Special St. Paddy\'s menu this weekend.', hashtags:['#StPatricks','#GoGreen','#SpecialMenu'], creator:'Sarah K.', performanceMetrics:{impressions:3600,reach:2500,engagement:'7.5%'} },
  // Week 3
  { id:'e12', title:'St. Paddy\'s Reel',           category:'social',  date:17, time:'6:00 PM',  status:'published', platforms:['tiktok'], caption:'The greenest day of the year deserves the greenest smoothie bowl.', hashtags:['#StPaddys','#GreenSmoothie'], creator:'Mike R.', performanceMetrics:{impressions:7800,reach:5400,engagement:'11.2%'} },
  { id:'e13', title:'April Content Calendar',       category:'content-review', date:18, status:'needs_approval', description:'April content calendar is ready for your review. Includes 20 social posts, 1 video shoot, and 2 email campaigns.', deadline:'March 22, 2026' },
  { id:'e14', title:'Team Appreciation',            category:'social',  date:19, time:'1:00 PM',  status:'published', platforms:['instagram'], caption:'The people who make the magic happen every single day.', hashtags:['#TeamLove','#BehindTheScenes'], creator:'Sarah K.', performanceMetrics:{impressions:2100,reach:1500,engagement:'8.0%'} },
  { id:'e15', title:'Jazz Night Announcement',      category:'social',  date:20, time:'12:00 PM', status:'published', platforms:['facebook'], caption:'Live jazz this Friday! Reservations filling fast.', hashtags:['#JazzNight','#LiveMusic','#FridayVibes'], creator:'Mike R.', performanceMetrics:{impressions:2800,reach:1900,engagement:'6.1%'} },
  { id:'e16', title:'Weekend Brunch',               category:'social',  date:21, time:'9:00 AM',  status:'published', platforms:['facebook','instagram'], caption:'Your weekend plans just got a whole lot tastier.', hashtags:['#WeekendBrunch','#BrunchGoals'], creator:'Sarah K.', performanceMetrics:{impressions:2400,reach:1700,engagement:'5.5%'} },
  // Week 4 — current
  { id:'e17', title:'Monday Motivation',            category:'social',  date:23, time:'9:00 AM',  status:'published', platforms:['instagram','facebook'], caption:'New week, new flavors. Let\'s make it a great one.', hashtags:['#MondayMotivation','#NewWeek'], creator:'Sarah K.', performanceMetrics:{impressions:1900,reach:1300,engagement:'5.2%'} },
  { id:'e18', title:'Taco Tuesday',                 category:'social',  date:24, time:'11:00 AM', status:'published', platforms:['instagram','tiktok'], caption:'It\'s Taco Tuesday and we\'re going ALL out.', hashtags:['#TacoTuesday','#Tacos'], creator:'Mike R.', performanceMetrics:{impressions:4300,reach:3100,engagement:'9.8%'} },
  { id:'e19', title:'Jazz Night Event Banner',      category:'social',  date:25, time:'12:00 PM', status:'pending', platforms:['facebook','instagram'], caption:'This Friday: Live jazz, craft cocktails, and a 5-course tasting menu.', hashtags:['#JazzNight','#FridayDinner'], creator:'Sarah K.' },
  { id:'e20', title:'Recipe Tuesday — Pesto',       category:'social',  date:25, time:'12:00 PM', status:'changes_requested', platforms:['instagram','facebook','tiktok'], caption:'Our house-made basil pesto — the recipe you\'ve been asking for.', hashtags:['#Recipe','#HomemadePesto','#CookingTips'], creator:'Sarah K.' },
  { id:'e21', title:'Spring Menu Launch',           category:'social',  date:26, time:'10:00 AM', status:'pending', platforms:['instagram','facebook','tiktok'], caption:'It\'s official — the Spring 2026 menu is LIVE.', hashtags:['#SpringMenu','#NewMenu','#FreshStart'], creator:'Sarah K.' },
  { id:'e22', title:'April Reel Batch',             category:'video-shoot', date:26, time:'10:00 AM', endTime:'4:00 PM', duration:'6 hours', status:'confirmed', location:'Main Restaurant', shotList:['4 recipe reels','2 ambiance clips','1 team intro reel','B-roll for April campaigns'], teamMembers:['Mike R. (Videographer)','Sarah K. (Director)','Chef Marco','Front-of-house team'], prepNotes:'Please have featured dishes prepped. Staff should wear branded aprons. Dining room reserved 10am-4pm.' },
  { id:'e23', title:'Customer Spotlight — Maria',   category:'social',  date:27, time:'11:30 AM', status:'pending', platforms:['instagram','facebook'], caption:'Maria has been dining with us since day one. Here\'s her story.', hashtags:['#CustomerSpotlight','#Community'], creator:'Sarah K.' },
  { id:'e24', title:'Q2 Planning Session',          category:'strategy', date:27, time:'3:00 PM', duration:'1 hour', status:'upcoming', agenda:['Q1 results review','Q2 campaign themes','Summer content strategy','Budget allocation','New service opportunities'], description:'Quarterly planning session to align on Q2 goals.' },
  { id:'e25', title:'Weekend Brunch Promo',         category:'social',  date:28, time:'8:00 AM',  status:'scheduled', platforms:['facebook','instagram'], caption:'Brunch is calling and you must answer.', hashtags:['#Brunch','#WeekendPlans'], creator:'Mike R.' },
  { id:'e26', title:'Happy Hour',                   category:'social',  date:28, time:'3:00 PM',  status:'pending', platforms:['instagram','facebook','email'], caption:'Half-price craft cocktails 4-7pm. Bring your crew.', hashtags:['#HappyHour','#CraftCocktails'], creator:'Sarah K.' },
  // Week 5
  { id:'e27', title:'Easter Menu Preview',          category:'social',  date:30, time:'10:00 AM', status:'pending', platforms:['instagram','tiktok','facebook'], caption:'A sneak peek at our Easter Sunday feast menu.', hashtags:['#Easter','#EasterBrunch','#SpecialMenu'], creator:'Sarah K.' },
  { id:'e28', title:'Newsletter #13',               category:'email',   date:30, time:'9:00 AM',  status:'scheduled', subject:'Easter Weekend — Reserve Your Table', audience:'All Subscribers', audienceSize:2410 },
  { id:'e29', title:'March Performance Report',     category:'report',  date:31, status:'upcoming', reportType:'Monthly Performance', description:'Full March performance report covering all channels.' },
  { id:'e30', title:'Q1 Citation Audit',            category:'seo',     date:31, status:'upcoming', seoDetails:['Full citation audit across 40+ directories','NAP consistency check','Competitor ranking comparison','Recommendations for Q2'] },
  { id:'e31', title:'3 Month Anniversary',          category:'milestone', date:31, status:'completed', milestoneNote:'First quarter complete! In 3 months: 45 social posts published, 2 shoots completed, 12% follower growth, 28% increase in website traffic from social.' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const TODAY = 25
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MARCH_2026_OFFSET = 0 // March 1 2026 is Sunday

function statusBadge(s: EventStatus) {
  switch (s) {
    case 'published': case 'completed': case 'delivered':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5"><CheckCircle2 size={10}/>{s === 'delivered' ? 'Delivered' : s === 'completed' ? 'Completed' : 'Published'}</span>
    case 'scheduled': case 'confirmed':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-0.5"><Clock size={10}/>{s === 'confirmed' ? 'Confirmed' : 'Scheduled'}</span>
    case 'pending': case 'upcoming':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#424245] bg-[#f0f0f5] rounded-full px-2 py-0.5"><Clock size={10}/>{s === 'upcoming' ? 'Upcoming' : 'Pending'}</span>
    case 'changes_requested': case 'needs_approval':
      return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"><AlertCircle size={10}/>{s === 'needs_approval' ? 'Needs Approval' : 'Changes Requested'}</span>
    default: return null
  }
}

function isCompleted(s: EventStatus) { return ['published','completed','delivered'].includes(s) }
function isUpcoming(s: EventStatus) { return ['scheduled','confirmed','pending','upcoming'].includes(s) }
function needsAttention(s: EventStatus) { return ['changes_requested','needs_approval'].includes(s) }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapCalendarEntry(c: any): TimelineEvent {
  const scheduled = c.scheduled_at ? new Date(c.scheduled_at) : null
  const day = scheduled ? scheduled.getDate() : 1
  const time = scheduled ? scheduled.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : undefined

  const platformCategoryMap: Record<string, EventCategory> = {
    instagram: 'social', facebook: 'social', tiktok: 'social',
    linkedin: 'social', twitter: 'social', youtube: 'social',
    email: 'email', website: 'website', google_business: 'seo',
  }
  const statusMap: Record<string, EventStatus> = {
    draft: 'pending', scheduled: 'scheduled', published: 'published', failed: 'needs_approval',
  }

  return {
    id: c.id,
    title: c.title || 'Untitled',
    category: platformCategoryMap[c.platform] || 'social',
    date: day,
    time,
    status: statusMap[c.status] || 'scheduled',
    platforms: c.platform ? [c.platform as Platform] : [],
    caption: c.caption || undefined,
  }
}

export default function MarketingTimeline() {
  const { data: business } = useBusiness()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [filterCat, setFilterCat] = useState<FilterCategory>('all')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)

  // Load real calendar entries from Supabase
  useEffect(() => {
    if (!business?.id) {
      setDataLoading(false)
      return
    }
    const supabase = createClient()

    async function fetchCalendar() {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const { data } = await supabase
        .from('content_calendar')
        .select('id, platform, title, caption, scheduled_at, status')
        .eq('business_id', business!.id)
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd)
        .order('scheduled_at', { ascending: true })

      setEvents(data && data.length > 0 ? data.map(mapCalendarEntry) : [])
      setDataLoading(false)
    }

    fetchCalendar()
  }, [business?.id])

  const filtered = useMemo(() => {
    let list = events
    const tab = FILTER_TABS.find(t => t.key === filterCat)
    if (tab && tab.cats.length > 0) list = list.filter(e => tab.cats.includes(e.category))
    if (filterStatus === 'completed') list = list.filter(e => isCompleted(e.status))
    if (filterStatus === 'upcoming') list = list.filter(e => isUpcoming(e.status))
    if (filterStatus === 'needs_attention') list = list.filter(e => needsAttention(e.status))
    return list
  }, [filterCat, filterStatus])

  const tabCounts = useMemo(() => {
    const counts: Record<FilterCategory, number> = { all: events.length, social: 0, 'video-photo': 0, strategy: 0, email: 0, seo: 0, reports: 0, milestones: 0 }
    events.forEach(e => {
      FILTER_TABS.forEach(t => { if (t.cats.includes(e.category)) counts[t.key]++ })
    })
    return counts
  }, [events])

  const summaryLine = useMemo(() => {
    const social = events.filter(e => e.category === 'social').length
    const shoots = events.filter(e => e.category === 'video-shoot' || e.category === 'photo-shoot').length
    const calls = events.filter(e => e.category === 'strategy').length
    const reports = events.filter(e => e.category === 'report').length
    const attention = events.filter(e => needsAttention(e.status) || (e.status === 'pending' && e.date >= TODAY)).length
    return { total: events.length, social, shoots, calls, reports, attention }
  }, [events])

  // Build calendar grid
  const daysInMonth = 31
  const blanks = MARCH_2026_OFFSET
  const cells: (number | null)[] = []
  for (let i = 0; i < blanks; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsForDay = (day: number) => filtered.filter(e => e.date === day)

  if (dataLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 bg-ink-6 rounded animate-pulse" />
        <div className="h-64 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold font-[family-name:var(--font-display)] text-[#1d1d1f] tracking-tight">Marketing Timeline</h1>
          <p className="text-sm text-[#6e6e73] mt-1">Everything we&rsquo;re doing for your business, all in one place</p>
        </div>
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CalendarIcon className="w-10 h-10 text-ink-4 mx-auto mb-3" />
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-1">No content scheduled yet</h2>
          <p className="text-ink-3 text-sm max-w-md mx-auto">
            Your content calendar will populate once your Apnosh team starts scheduling posts, shoots, and campaigns for your business.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold font-[family-name:var(--font-display)] text-[#1d1d1f] tracking-tight">Marketing Timeline</h1>
          <p className="text-sm text-[#6e6e73] mt-1">Everything we&rsquo;re doing for your business, all in one place</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm text-[#1d1d1f]">
            <button className="p-1.5 rounded-lg hover:bg-[#f0f0f5] transition-colors"><ChevronLeft size={16}/></button>
            <span className="font-medium min-w-[120px] text-center">March 2026</span>
            <button className="p-1.5 rounded-lg hover:bg-[#f0f0f5] transition-colors"><ChevronRight size={16}/></button>
          </div>
          <div className="flex bg-[#f0f0f5] rounded-lg p-0.5">
            {(['month','agenda'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view === v ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#424245]'}`}>
                {v === 'month' ? 'Month' : 'Agenda'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SUMMARY BAR */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f5f5f7] rounded-xl text-xs text-[#424245] mb-4 flex-wrap">
        <span className="font-medium text-[#1d1d1f]">March:</span>
        <span>{summaryLine.total} events</span><span className="text-[#d2d2d7]">&middot;</span>
        <span>{summaryLine.social} social posts</span><span className="text-[#d2d2d7]">&middot;</span>
        <span>{summaryLine.shoots} shoots</span><span className="text-[#d2d2d7]">&middot;</span>
        <span>{summaryLine.calls} strategy calls</span><span className="text-[#d2d2d7]">&middot;</span>
        <span>{summaryLine.reports} reports</span>
        {summaryLine.attention > 0 && <><span className="text-[#d2d2d7]">&middot;</span><span className="text-amber-600 font-medium">&#9888; {summaryLine.attention} need your attention</span></>}
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2 scrollbar-hide">
        {FILTER_TABS.map(t => {
          const active = filterCat === t.key
          return (
            <button key={t.key} onClick={() => setFilterCat(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${active ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#424245] border-[#d2d2d7] hover:border-[#aeaeb2]'}`}>
              {t.label}
              <span className={`text-[10px] ${active ? 'text-white/70' : 'text-[#aeaeb2]'}`}>{tabCounts[t.key]}</span>
            </button>
          )
        })}
      </div>

      {/* STATUS FILTER */}
      <div className="flex items-center gap-1.5 mb-4">
        <Filter size={12} className="text-[#aeaeb2]"/>
        {([['all','All Statuses'],['completed','Completed'],['upcoming','Upcoming'],['needs_attention','Needs Attention']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setFilterStatus(k)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${filterStatus === k ? 'bg-[#f0f0f5] text-[#1d1d1f]' : 'text-[#aeaeb2] hover:text-[#6e6e73]'}`}>
            {l}{k === 'needs_attention' && ' \u26A0'}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* MAIN CONTENT */}
        <div className={`flex-1 min-w-0 ${selectedEvent ? 'hidden sm:block' : ''}`}>
          {view === 'month' ? (
            /* ---- MONTH GRID ---- */
            <div className="border border-[#d2d2d7] rounded-2xl overflow-hidden bg-white">
              <div className="grid grid-cols-7">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[11px] font-medium text-[#6e6e73] py-2 bg-[#f5f5f7] border-b border-[#d2d2d7]">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((day, i) => {
                  const events = day ? eventsForDay(day) : []
                  const isToday = day === TODAY
                  return (
                    <div key={i}
                      className={`min-h-[100px] border-b border-r border-[#f0f0f5] p-1 ${!day ? 'bg-[#f5f5f7]/40' : ''} ${isToday ? 'bg-[#eaf7f3]/40' : ''}`}>
                      {day && (
                        <>
                          <div className={`text-[11px] font-medium mb-0.5 px-1 ${isToday ? 'text-white bg-[#4abd98] rounded-full w-5 h-5 flex items-center justify-center' : day < TODAY ? 'text-[#aeaeb2]' : 'text-[#1d1d1f]'}`}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {events.slice(0, 3).map(ev => {
                              const cfg = CATEGORY_CONFIG[ev.category]
                              const Icon = cfg.icon
                              return (
                                <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                                  className={`w-full flex items-center gap-1 rounded-md text-left transition-all hover:shadow-sm group ${cfg.bgColor} ${selectedEvent?.id === ev.id ? 'ring-1 ring-[#4abd98]' : ''}`}>
                                  <div className={`w-[3px] self-stretch rounded-l-md ${cfg.barColor} shrink-0`}/>
                                  <div className="flex items-center gap-1 py-0.5 px-1 min-w-0 flex-1">
                                    {ev.time && <span className="text-[9px] text-[#6e6e73] font-mono shrink-0">{ev.time.replace(':00','').replace(' ','').toLowerCase()}</span>}
                                    <Icon size={10} className={`${cfg.textColor} shrink-0 opacity-70`}/>
                                    <span className={`text-[10px] font-medium truncate ${cfg.textColor}`}>{ev.title}</span>
                                    {ev.platforms && ev.platforms.length > 0 && (
                                      <span className="flex items-center gap-0.5 ml-auto shrink-0">
                                        {ev.platforms.slice(0, 3).map(p => { const PI = PLATFORM_ICON[p]; return <PI key={p} size={8} className="text-[#aeaeb2]"/> })}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                            {events.length > 3 && (
                              <button onClick={() => { setView('agenda'); setFilterCat('all') }}
                                className="text-[10px] text-[#4abd98] font-medium px-1 hover:underline">
                                +{events.length - 3} more
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ---- AGENDA VIEW ---- */
            <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
              {Array.from(new Set(filtered.map(e => e.date))).sort((a, b) => a - b).map(day => {
                const dayEvents = filtered.filter(e => e.date === day)
                const isToday = day === TODAY
                const isPast = day < TODAY
                return (
                  <div key={day} className="mb-4">
                    <div className={`flex items-center gap-2 mb-1.5 sticky top-0 bg-white/90 backdrop-blur-sm py-1 z-10 ${isToday ? 'text-[#4abd98]' : isPast ? 'text-[#aeaeb2]' : 'text-[#1d1d1f]'}`}>
                      <span className={`text-xs font-semibold ${isToday ? 'bg-[#4abd98] text-white px-2 py-0.5 rounded-full' : ''}`}>
                        {isToday ? 'Today' : ''} Mar {day}
                      </span>
                      <div className="h-px flex-1 bg-[#f0f0f5]"/>
                    </div>
                    <div className="space-y-1.5 pl-2">
                      {dayEvents.map(ev => {
                        const cfg = CATEGORY_CONFIG[ev.category]
                        const Icon = cfg.icon
                        return (
                          <button key={ev.id} onClick={() => setSelectedEvent(ev)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all hover:shadow-sm text-left ${cfg.bgColor} ${selectedEvent?.id === ev.id ? 'ring-1 ring-[#4abd98]' : ''}`}>
                            <div className={`w-8 h-8 rounded-lg ${cfg.barColor} flex items-center justify-center shrink-0`}>
                              <Icon size={14} className="text-white"/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-[#1d1d1f] truncate">{ev.title}</span>
                                {statusBadge(ev.status)}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#6e6e73]">
                                <span className="font-medium">{cfg.label}</span>
                                {ev.time && <><span>&middot;</span><span>{ev.time}{ev.endTime ? ` — ${ev.endTime}` : ''}{ev.duration ? ` \u00B7 ${ev.duration}` : ''}</span></>}
                                {ev.category === 'report' && ev.reportType && <><span>&middot;</span><span>{ev.reportType}{ev.status === 'delivered' ? ' — Ready to view' : ''}</span></>}
                              </div>
                            </div>
                            {ev.platforms && (
                              <div className="flex items-center gap-1 shrink-0">
                                {ev.platforms.map(p => { const PI = PLATFORM_ICON[p]; return <PI key={p} size={12} className="text-[#aeaeb2]"/> })}
                              </div>
                            )}
                            <ChevronRight size={14} className="text-[#d2d2d7] shrink-0"/>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* DETAIL PANEL */}
        {selectedEvent && (
          <div className="w-full sm:w-[360px] shrink-0 bg-white border border-[#d2d2d7] rounded-2xl overflow-y-auto max-h-[calc(100vh-280px)]">
            <DetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail Panel                                                       */
/* ------------------------------------------------------------------ */
function DetailPanel({ event: ev, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const cfg = CATEGORY_CONFIG[ev.category]
  const Icon = cfg.icon

  return (
    <div className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${cfg.barColor} flex items-center justify-center`}>
          <Icon size={18} className="text-white"/>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#f0f0f5] transition-colors"><X size={16} className="text-[#aeaeb2]"/></button>
      </div>

      <h2 className="text-lg font-semibold text-[#1d1d1f] font-[family-name:var(--font-display)] leading-snug mb-1">{ev.title}</h2>
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs font-medium ${cfg.textColor}`}>{cfg.label}</span>
        {statusBadge(ev.status)}
      </div>

      {/* Meta */}
      <div className="space-y-2 text-sm text-[#424245] mb-5">
        <div className="flex items-center gap-2"><CalendarIcon size={14} className="text-[#aeaeb2]"/><span>March {ev.date}, 2026</span></div>
        {ev.time && <div className="flex items-center gap-2"><Clock size={14} className="text-[#aeaeb2]"/><span>{ev.time}{ev.endTime ? ` — ${ev.endTime}` : ''}{ev.duration ? ` \u00B7 ${ev.duration}` : ''}</span></div>}
        {ev.location && <div className="flex items-center gap-2"><MapPin size={14} className="text-[#aeaeb2]"/><span>{ev.location}</span></div>}
        {ev.creator && <div className="flex items-center gap-2"><User size={14} className="text-[#aeaeb2]"/><span>{ev.creator}</span></div>}
      </div>

      {ev.platforms && ev.platforms.length > 0 && (
        <div className="flex items-center gap-1.5 mb-5">
          {ev.platforms.map(p => {
            const PI = PLATFORM_ICON[p]
            return <span key={p} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#f0f0f5] text-[11px] font-medium text-[#424245]"><PI size={10}/>{PLATFORM_LABEL[p]}</span>
          })}
        </div>
      )}

      <div className="h-px bg-[#f0f0f5] mb-4"/>

      {/* SOCIAL POST DETAILS */}
      {ev.category === 'social' && (
        <div className="space-y-4">
          {ev.caption && <div><p className="text-xs font-medium text-[#6e6e73] mb-1">Caption</p><p className="text-sm text-[#1d1d1f] leading-relaxed">{ev.caption}</p></div>}
          {ev.hashtags && ev.hashtags.length > 0 && <div className="flex flex-wrap gap-1">{ev.hashtags.map(h => <span key={h} className="text-[11px] text-[#4abd98] bg-[#eaf7f3] px-2 py-0.5 rounded-full">{h}</span>)}</div>}
          {ev.performanceMetrics && (
            <div>
              <p className="text-xs font-medium text-[#6e6e73] mb-2">Performance</p>
              <div className="grid grid-cols-3 gap-2">
                {ev.performanceMetrics.impressions && <div className="bg-[#f5f5f7] rounded-xl p-2.5 text-center"><p className="text-base font-semibold text-[#1d1d1f]">{(ev.performanceMetrics.impressions / 1000).toFixed(1)}K</p><p className="text-[10px] text-[#6e6e73]">Impressions</p></div>}
                {ev.performanceMetrics.reach && <div className="bg-[#f5f5f7] rounded-xl p-2.5 text-center"><p className="text-base font-semibold text-[#1d1d1f]">{(ev.performanceMetrics.reach / 1000).toFixed(1)}K</p><p className="text-[10px] text-[#6e6e73]">Reach</p></div>}
                {ev.performanceMetrics.engagement && <div className="bg-[#f5f5f7] rounded-xl p-2.5 text-center"><p className="text-base font-semibold text-[#1d1d1f]">{ev.performanceMetrics.engagement}</p><p className="text-[10px] text-[#6e6e73]">Engagement</p></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIDEO / PHOTO SHOOT DETAILS */}
      {(ev.category === 'video-shoot' || ev.category === 'photo-shoot') && (
        <div className="space-y-4">
          {ev.shotList && <div><p className="text-xs font-medium text-[#6e6e73] mb-1.5">Shot List / Goals</p><ul className="space-y-1">{ev.shotList.map((s, i) => <li key={i} className="text-sm text-[#424245] flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#aeaeb2] shrink-0"/>{s}</li>)}</ul></div>}
          {ev.teamMembers && <div><p className="text-xs font-medium text-[#6e6e73] mb-1.5">Team</p><div className="space-y-1">{ev.teamMembers.map((m, i) => <div key={i} className="text-sm text-[#424245] flex items-center gap-2"><User size={12} className="text-[#aeaeb2]"/>{m}</div>)}</div></div>}
          {ev.prepNotes && <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs font-medium text-amber-700 mb-1">What to Prepare</p><p className="text-sm text-amber-800">{ev.prepNotes}</p></div>}
        </div>
      )}

      {/* STRATEGY CALL DETAILS */}
      {ev.category === 'strategy' && (
        <div className="space-y-4">
          {ev.agenda && <div><p className="text-xs font-medium text-[#6e6e73] mb-1.5">Agenda</p><ul className="space-y-1.5">{ev.agenda.map((a, i) => <li key={i} className="text-sm text-[#424245] flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"/>{a}</li>)}</ul></div>}
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors">
            <CalendarIcon size={14}/>Add to My Calendar
          </button>
        </div>
      )}

      {/* EMAIL CAMPAIGN DETAILS */}
      {ev.category === 'email' && (
        <div className="space-y-3">
          {ev.subject && <div><p className="text-xs font-medium text-[#6e6e73] mb-1">Subject Line</p><p className="text-sm font-medium text-[#1d1d1f]">{ev.subject}</p></div>}
          {ev.audience && <div><p className="text-xs font-medium text-[#6e6e73] mb-1">Audience</p><p className="text-sm text-[#424245]">{ev.audience}{ev.audienceSize ? ` \u00B7 ${ev.audienceSize.toLocaleString()} recipients` : ''}</p></div>}
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-colors">
            <ExternalLink size={14}/>Preview Email
          </button>
        </div>
      )}

      {/* SEO DETAILS */}
      {ev.category === 'seo' && ev.seoDetails && (
        <div><p className="text-xs font-medium text-[#6e6e73] mb-1.5">Updates</p><ul className="space-y-1.5">{ev.seoDetails.map((s, i) => <li key={i} className="text-sm text-[#424245] flex items-start gap-2"><CheckCircle2 size={12} className="text-teal-500 mt-0.5 shrink-0"/>{s}</li>)}</ul></div>
      )}

      {/* REPORT DETAILS */}
      {ev.category === 'report' && (
        <div className="space-y-3">
          {ev.reportType && <div><p className="text-xs font-medium text-[#6e6e73] mb-1">Report Type</p><p className="text-sm text-[#424245]">{ev.reportType}</p></div>}
          {ev.description && <p className="text-sm text-[#424245]">{ev.description}</p>}
          <Link href="/dashboard/analytics" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors">
            <FileBarChart size={14}/>View Report
          </Link>
        </div>
      )}

      {/* CONTENT REVIEW DETAILS */}
      {ev.category === 'content-review' && (
        <div className="space-y-3">
          {ev.description && <p className="text-sm text-[#424245]">{ev.description}</p>}
          {ev.deadline && <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs font-medium text-amber-700">Deadline to approve: {ev.deadline}</p></div>}
          <Link href="/dashboard/approvals" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
            <ClipboardCheck size={14}/>Review Content
          </Link>
        </div>
      )}

      {/* MILESTONE DETAILS */}
      {ev.category === 'milestone' && ev.milestoneNote && (
        <div className="bg-[#eaf7f3] rounded-xl p-4">
          <p className="text-sm text-[#2e9a78] leading-relaxed">{ev.milestoneNote}</p>
        </div>
      )}
    </div>
  )
}
