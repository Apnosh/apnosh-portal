'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ArrowRight, Check, Pencil, MessageSquare, Clock,
  Camera, Globe, Video, Hash, Heart, MessageCircle, Send, Bookmark,
  MoreHorizontal, ChevronLeft, ChevronRight, Calendar, Layers, User,
  FileType, Monitor, Sparkles, AlertTriangle, Target, Lightbulb,
  TrendingUp, X, Wifi, BatteryFull, Signal,
} from 'lucide-react'
import {
  initialDeliverables,
  platformLabel,
  statusColor,
  type Deliverable,
  type DeliverableStatus,
  type Platform,
} from '@/lib/mock-deliverables'

/* ------------------------------------------------------------------ */
/*  Local types                                                        */
/* ------------------------------------------------------------------ */

type Priority = 'normal' | 'urgent'

interface VersionEntry {
  version: number
  date: string
  time: string
  note: string
  captionSnapshot: string
}

interface FeedbackEntry {
  id: string
  author: string
  date: string
  text: string
  categories: string[]
  resolution?: string
}

/* ------------------------------------------------------------------ */
/*  Mock supplemental data (for the detail view)                       */
/* ------------------------------------------------------------------ */

const versionHistory: VersionEntry[] = [
  {
    version: 1,
    date: 'Mar 22, 2026',
    time: '10:00 AM',
    note: 'Original submission',
    captionSnapshot: `Spring has sprung at Casa Priya! \u{1F338}\u{1F33F}\n\nWe're excited to share our new Spring Menu. Swipe through to see what's cooking!\n\nAvailable this Thursday. Link in bio to reserve.`,
  },
  {
    version: 2,
    date: 'Mar 23, 2026',
    time: '2:00 PM',
    note: 'Updated caption per feedback \u2014 added dish descriptions to each slide reference, extended hashtag set',
    captionSnapshot: `Spring has sprung at Casa Priya! \u{1F338}\u{1F33F}

We're thrilled to unveil our brand-new Spring Menu \u2014 a celebration of seasonal flavors, locally sourced ingredients, and dishes that feel like sunshine on a plate.

Swipe through to discover:
\u2192 Slide 1: Mango Lassi Panna Cotta
\u2192 Slide 2: Grilled Asparagus & Paneer Tikka
\u2192 Slide 3: Coconut Lime Shrimp Curry
\u2192 Slide 4: Spring Pea & Mint Risotto
\u2192 Slide 5: Lavender Cardamom Creme Brulee

Available starting this Thursday. Reserve your table through the link in our bio \u2014 we can't wait to share these flavors with you!`,
  },
]

const feedbackHistory: FeedbackEntry[] = [
  {
    id: 'fb-001',
    author: 'Priya Sharma',
    date: 'Mar 22, 2026 at 3:15 PM',
    text: 'Love the dish photography! But the caption feels a bit generic \u2014 can we add specific dish names for each slide so people know what they\'re swiping through? Also, let\'s beef up the hashtag game with more Austin-specific ones.',
    categories: ['Caption', 'Hashtags'],
    resolution: 'Updated caption with dish-by-dish breakdown and added 8 new targeted hashtags including #AustinFood and #FoodieAustin.',
  },
]

const feedbackCategories = [
  'Caption',
  'Image/Graphic',
  'Colors/Branding',
  'Timing',
  'Hashtags',
  'Other',
]

/* ------------------------------------------------------------------ */
/*  Slides mock (used by phone preview)                                */
/* ------------------------------------------------------------------ */

interface Slide {
  id: number
  label: string
  color: string
}

const defaultSlides: Slide[] = [
  { id: 1, label: 'Mango Lassi Panna Cotta', color: 'bg-amber-100' },
  { id: 2, label: 'Grilled Asparagus & Paneer Tikka', color: 'bg-green-100' },
  { id: 3, label: 'Coconut Lime Shrimp Curry', color: 'bg-orange-100' },
  { id: 4, label: 'Spring Pea & Mint Risotto', color: 'bg-emerald-100' },
  { id: 5, label: 'Lavender Cardamom Creme Brulee', color: 'bg-purple-100' },
]

/* ------------------------------------------------------------------ */
/*  Platform icon helper                                               */
/* ------------------------------------------------------------------ */

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  switch (platform) {
    case 'instagram': return <Camera className={className} />
    case 'facebook': return <Globe className={className} />
    case 'tiktok': return <Video className={className} />
    default: return <Globe className={className} />
  }
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: DeliverableStatus }) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <Check className="w-3.5 h-3.5" /> Approved
        </span>
      )
    case 'changes_requested':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
          <MessageSquare className="w-3.5 h-3.5" /> Changes Requested
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full">
          <Clock className="w-3.5 h-3.5" /> Pending Review
        </span>
      )
  }
}

/* ------------------------------------------------------------------ */
/*  Instagram Phone Preview                                            */
/* ------------------------------------------------------------------ */

function InstagramPhonePreview({
  slides,
  currentSlide,
  onSlideChange,
  caption,
  hashtags,
  activeVersion,
}: {
  slides: Slide[]
  currentSlide: number
  onSlideChange: (n: number) => void
  caption: string
  hashtags: string[]
  activeVersion: number
}) {
  return (
    <div className="mx-auto" style={{ maxWidth: 375 }}>
      {/* Phone frame */}
      <div className="bg-black rounded-[2.5rem] p-2 shadow-2xl">
        <div className="bg-white rounded-[2rem] overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 py-2 bg-white">
            <span className="text-xs font-semibold text-ink">9:41</span>
            <div className="w-24 h-5 bg-black rounded-full mx-auto" />
            <div className="flex items-center gap-1">
              <Signal className="w-3.5 h-3.5 text-ink" />
              <Wifi className="w-3.5 h-3.5 text-ink" />
              <BatteryFull className="w-3.5 h-3.5 text-ink" />
            </div>
          </div>

          {/* Instagram header */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-100">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                <span className="text-[9px] font-bold text-ink">CP</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight">casapriya</p>
              <p className="text-[10px] text-ink-4 leading-tight">Austin, Texas</p>
            </div>
            <MoreHorizontal className="w-5 h-5 text-ink" />
          </div>

          {/* Carousel image area */}
          <div className="relative aspect-square bg-gray-50">
            <div className={`absolute inset-0 ${slides[currentSlide]?.color ?? 'bg-gray-100'} flex flex-col items-center justify-center transition-colors duration-300`}>
              <Sparkles className="w-12 h-12 text-ink-4/20 mb-3" />
              <p className="text-xs font-medium text-ink-3 text-center px-4">{slides[currentSlide]?.label}</p>
              <p className="text-[10px] text-ink-4 mt-1">1080 x 1080</p>
            </div>

            {/* Version badge */}
            <span className="absolute top-3 right-3 text-[10px] font-bold text-white bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full">
              v{activeVersion}
            </span>

            {/* Slide navigation arrows */}
            {currentSlide > 0 && (
              <button
                onClick={() => onSlideChange(currentSlide - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-ink-2" />
              </button>
            )}
            {currentSlide < slides.length - 1 && (
              <button
                onClick={() => onSlideChange(currentSlide + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-ink-2" />
              </button>
            )}

            {/* Slide counter */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full">
              Slide {currentSlide + 1} of {slides.length}
            </div>
          </div>

          {/* Carousel dots */}
          <div className="flex items-center justify-center gap-1.5 py-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => onSlideChange(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                  i === currentSlide ? 'bg-blue-500 w-2' : 'bg-ink-5'
                }`}
              />
            ))}
          </div>

          {/* Action icons */}
          <div className="px-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Heart className="w-6 h-6 text-ink" />
              <MessageCircle className="w-6 h-6 text-ink" />
              <Send className="w-6 h-6 text-ink" />
            </div>
            <Bookmark className="w-6 h-6 text-ink" />
          </div>

          {/* Like count */}
          <div className="px-3 pt-2">
            <p className="text-[13px] font-semibold text-ink">
              Liked by <span>foodie_austin</span> and <span>234 others</span>
            </p>
          </div>

          {/* Caption */}
          <div className="px-3 pt-1 pb-2">
            <p className="text-[13px] text-ink leading-[1.4]">
              <span className="font-semibold">casapriya</span>{' '}
              {caption.split('\n').map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          </div>

          {/* Hashtags */}
          <div className="px-3 pb-2">
            <p className="text-[13px] text-blue-900/60 leading-[1.4]">
              {hashtags.join(' ')}
            </p>
          </div>

          {/* Timestamp */}
          <div className="px-3 pb-3">
            <p className="text-[10px] text-ink-4 uppercase tracking-wide">2 hours ago</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Facebook Post Preview                                              */
/* ------------------------------------------------------------------ */

function FacebookPostPreview({
  slides,
  currentSlide,
  caption,
}: {
  slides: Slide[]
  currentSlide: number
  caption: string
}) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center">
          <span className="text-white text-sm font-bold">CP</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Casa Priya</p>
          <div className="flex items-center gap-1 text-xs text-ink-4">
            <span>2h</span>
            <span>&middot;</span>
            <Globe className="w-3 h-3" />
          </div>
        </div>
        <MoreHorizontal className="w-5 h-5 text-ink-4" />
      </div>
      {/* Caption */}
      <div className="px-4 pb-3">
        <p className="text-sm text-ink whitespace-pre-line">{caption.substring(0, 200)}...</p>
      </div>
      {/* Image */}
      <div className={`aspect-square ${slides[currentSlide]?.color ?? 'bg-gray-100'} flex items-center justify-center`}>
        <Sparkles className="w-16 h-16 text-ink-4/20" />
      </div>
      {/* Reactions */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1">
            <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[8px] text-white">{'\u{1F44D}'}</span>
            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[8px] text-white">{'\u2764\uFE0F'}</span>
          </div>
          <span className="text-xs text-ink-4 ml-1">128</span>
        </div>
        <span className="text-xs text-ink-4">24 comments &middot; 12 shares</span>
      </div>
      {/* Actions */}
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        {['Like', 'Comment', 'Share'].map(action => (
          <button key={action} className="py-2.5 text-xs font-medium text-ink-3 hover:bg-gray-50 transition-colors">
            {action}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TikTok Preview                                                     */
/* ------------------------------------------------------------------ */

function TikTokPreview({
  caption,
}: {
  caption: string
}) {
  return (
    <div className="mx-auto" style={{ maxWidth: 375 }}>
      <div className="bg-black rounded-[2.5rem] p-2 shadow-2xl">
        <div className="bg-gray-900 rounded-[2rem] overflow-hidden aspect-[9/16] relative flex flex-col justify-end">
          {/* Placeholder content area */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Video className="w-16 h-16 text-white/20" />
          </div>
          {/* Bottom overlay */}
          <div className="relative z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-xs font-semibold mb-1">@casapriya</p>
            <p className="text-white/80 text-[11px] leading-relaxed line-clamp-3">{caption.substring(0, 150)}...</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-4 h-4 rounded-full bg-white/20" />
              <p className="text-white/60 text-[10px]">Original Sound - Casa Priya</p>
            </div>
          </div>
          {/* Right side actions */}
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
            {[
              { icon: Heart, label: '1.2K' },
              { icon: MessageCircle, label: '48' },
              { icon: Bookmark, label: '89' },
              { icon: Send, label: '23' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <Icon className="w-6 h-6 text-white" />
                <span className="text-[9px] text-white/70">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Toast Component                                                    */
/* ------------------------------------------------------------------ */

function ApproveToast({
  visible,
  scheduledDate,
  onUndo,
}: {
  visible: boolean
  scheduledDate: string
  onUndo: () => void
}) {
  if (!visible) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-2xl">
        <Check className="w-5 h-5 text-emerald-200 shrink-0" />
        <span className="text-sm font-medium">
          Approved! Posting {scheduledDate}
        </span>
        <button
          onClick={onUndo}
          className="ml-2 text-sm font-semibold text-emerald-200 hover:text-white underline underline-offset-2 transition-colors"
        >
          Undo
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function DeliverableDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  /* ---- Pending queue navigation ---- */
  const pendingQueue = initialDeliverables.filter(
    d => d.status === 'pending' || d.status === 'changes_requested'
  )
  const currentIndex = pendingQueue.findIndex(d => d.id === id)
  const deliverable = initialDeliverables.find(d => d.id === id) ?? pendingQueue[0]
  const prevItem = currentIndex > 0 ? pendingQueue[currentIndex - 1] : null
  const nextItem = currentIndex < pendingQueue.length - 1 ? pendingQueue[currentIndex + 1] : null

  /* ---- Determine platforms for this deliverable ---- */
  const platforms: Platform[] = deliverable
    ? deliverable.platforms
      ? deliverable.platforms.map(v => v.platform)
      : [deliverable.platform]
    : ['instagram']

  /* State */
  const [status, setStatus] = useState<DeliverableStatus>(deliverable?.status ?? 'pending')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [activeVersion, setActiveVersion] = useState(2)
  const [activePlatform, setActivePlatform] = useState<Platform>(platforms[0])
  const [caption, setCaption] = useState(deliverable?.caption ?? '')
  const [editingCaption, setEditingCaption] = useState(false)
  const [hashtags, setHashtags] = useState<string[]>(deliverable?.hashtags ?? [])
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackChecks, setFeedbackChecks] = useState<string[]>([])
  const [feedbackPriority, setFeedbackPriority] = useState<Priority>('normal')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Sync state when navigating between deliverables */
  useEffect(() => {
    if (deliverable) {
      setStatus(deliverable.status)
      setCaption(deliverable.caption)
      setHashtags(deliverable.hashtags ?? [])
      setCurrentSlide(0)
      setActiveVersion(2)
      setActivePlatform(platforms[0])
      setEditingCaption(false)
      setFeedbackOpen(false)
      setToastVisible(false)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* Version switching */
  const handleVersionChange = (v: number) => {
    setActiveVersion(v)
    const entry = versionHistory.find(e => e.version === v)
    if (entry) setCaption(entry.captionSnapshot)
  }

  /* Actions */
  const handleApprove = useCallback(() => {
    setStatus('approved')
    setFeedbackOpen(false)
    setToastVisible(true)

    // Auto-navigate to next after 3 seconds
    const timer = setTimeout(() => {
      setToastVisible(false)
      if (nextItem) {
        router.push(`/dashboard/approvals/${nextItem.id}`)
      }
    }, 3000)
    toastTimer.current = timer
  }, [nextItem, router])

  const handleUndoApprove = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setStatus('pending')
    setToastVisible(false)
  }, [])

  const handleRequestChanges = useCallback(() => {
    setFeedbackOpen(true)
  }, [])

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim() && feedbackChecks.length === 0) return
    setStatus('changes_requested')
    setFeedbackOpen(false)
    setFeedbackText('')
    setFeedbackChecks([])
    setFeedbackPriority('normal')
  }

  const toggleFeedbackCheck = (cat: string) => {
    setFeedbackChecks(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const removeHashtag = (tag: string) => {
    setHashtags(prev => prev.filter(t => t !== tag))
  }

  /* Keyboard shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'a':
        case 'A':
          if (status === 'pending' || status === 'changes_requested') handleApprove()
          break
        case 'e':
        case 'E':
          if (status === 'pending' || status === 'changes_requested') {
            setEditingCaption(true)
          }
          break
        case 'r':
        case 'R':
          if (status === 'pending' || status === 'changes_requested') handleRequestChanges()
          break
        case 'ArrowLeft':
          if (prevItem) {
            router.push(`/dashboard/approvals/${prevItem.id}`)
          }
          break
        case 'ArrowRight':
          if (nextItem) {
            router.push(`/dashboard/approvals/${nextItem.id}`)
          }
          break
        case 'Escape':
          if (feedbackOpen) setFeedbackOpen(false)
          else if (editingCaption) setEditingCaption(false)
          break
        case '?':
          setShowShortcuts(s => !s)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [status, feedbackOpen, editingCaption, handleApprove, handleRequestChanges, prevItem, nextItem, router])

  /* Cleanup toast timer */
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const scheduledDate = deliverable?.scheduledFor ?? 'Thursday, Mar 26 at 10:00 AM'
  const scheduledTime = deliverable?.scheduledFor?.split(' at ')[1] ?? '10:00 AM CST'
  const slides = defaultSlides

  /* ---- Render preview for active platform ---- */
  const renderPreview = () => {
    switch (activePlatform) {
      case 'facebook':
        return <FacebookPostPreview slides={slides} currentSlide={currentSlide} caption={caption} />
      case 'tiktok':
        return <TikTokPreview caption={caption} />
      case 'instagram':
      default:
        return (
          <InstagramPhonePreview
            slides={slides}
            currentSlide={currentSlide}
            onSlideChange={setCurrentSlide}
            caption={caption}
            hashtags={hashtags}
            activeVersion={activeVersion}
          />
        )
    }
  }

  return (
    <div className="min-h-screen bg-bg-2">
      {/* ============================================================ */}
      {/*  STICKY TOP BAR                                               */}
      {/* ============================================================ */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-ink-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Left: Back + Title + Creator */}
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/dashboard/approvals"
                className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back to Approvals</span>
              </Link>
              <div className="h-5 w-px bg-ink-6 hidden sm:block" />
              <h1 className="font-[family-name:var(--font-display)] text-lg text-ink truncate hidden sm:block">
                {deliverable?.title}
              </h1>
              <StatusBadge status={status} />
              <span className="hidden lg:inline text-xs text-ink-4">
                Created by <span className="font-medium text-ink-3">Sarah K.</span> &middot; Designer
              </span>
            </div>

            {/* Right: Action buttons */}
            {(status === 'pending' || status === 'changes_requested') && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleApprove}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">Approve</span>
                </button>
                <button
                  onClick={() => setEditingCaption(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ink-5 text-ink-2 text-sm font-medium hover:bg-bg-2 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden md:inline">Edit & Approve</span>
                </button>
                <button
                  onClick={handleRequestChanges}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ink-5 text-ink-2 text-sm font-medium hover:bg-bg-2 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden md:inline">Request Changes</span>
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowShortcuts(s => !s)}
                    className="w-9 h-9 rounded-lg border border-ink-5 text-ink-4 text-xs font-mono flex items-center justify-center hover:bg-bg-2 transition-colors"
                    title="Keyboard shortcuts"
                  >
                    ?
                  </button>
                  {showShortcuts && (
                    <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl border border-ink-6 shadow-xl p-4 space-y-2 text-xs z-50">
                      <p className="text-ink font-semibold text-sm mb-3">Keyboard Shortcuts</p>
                      {[
                        ['A', 'Approve'],
                        ['E', 'Edit & Approve'],
                        ['R', 'Request Changes'],
                        ['\u2190', 'Previous item'],
                        ['\u2192', 'Next item'],
                        ['Esc', 'Close / Back'],
                        ['?', 'Toggle shortcuts'],
                      ].map(([key, desc]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-ink-3">{desc}</span>
                          <kbd className="px-2 py-0.5 bg-bg-2 border border-ink-6 rounded text-ink-2 font-mono text-[11px]">{key}</kbd>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {status === 'approved' && !toastVisible && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check className="w-4 h-4" /> Approved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  MAIN CONTENT                                                 */}
      {/* ============================================================ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile title */}
        <h1 className="font-[family-name:var(--font-display)] text-xl text-ink mb-2 lg:hidden">
          {deliverable?.title}
        </h1>
        <p className="text-xs text-ink-4 mb-6 lg:hidden">
          Created by <span className="font-medium text-ink-3">Sarah K.</span> &middot; Designer
        </p>

        <div className="grid lg:grid-cols-[1fr_420px] gap-8">
          {/* ======================================================== */}
          {/*  LEFT COLUMN -- Platform Preview                          */}
          {/* ======================================================== */}
          <div className="space-y-6">
            {/* Phone Preview */}
            <div className="bg-white rounded-2xl border border-ink-6 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={activePlatform} className="w-4 h-4 text-ink-3" />
                  <span className="text-sm font-medium text-ink">{platformLabel(activePlatform)} Preview</span>
                </div>
                <span className="text-xs text-ink-4 bg-bg-2 px-2.5 py-1 rounded-full">
                  {deliverable?.contentType}
                </span>
              </div>

              {renderPreview()}

              {/* Cross-platform tabs */}
              {platforms.length > 1 && (
                <div className="mt-6 flex items-center gap-1 border-t border-ink-6 pt-4">
                  {platforms.map(p => (
                    <button
                      key={p}
                      onClick={() => setActivePlatform(p)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        activePlatform === p
                          ? 'bg-brand-tint text-brand-dark border border-brand/30'
                          : 'text-ink-3 hover:bg-bg-2 border border-transparent'
                      }`}
                    >
                      <PlatformIcon platform={p} className="w-3.5 h-3.5" />
                      {platformLabel(p)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Caption & Hashtags Section */}
            <div className="bg-white rounded-2xl border border-ink-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Caption</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-4">{caption.length} characters</span>
                  {!editingCaption ? (
                    <button
                      onClick={() => setEditingCaption(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit caption
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingCaption(false)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Done editing
                    </button>
                  )}
                </div>
              </div>

              {editingCaption ? (
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full h-60 px-4 py-3 rounded-xl border border-ink-5 bg-bg-2 text-sm text-ink leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-shadow"
                />
              ) : (
                <div className="text-sm text-ink leading-relaxed whitespace-pre-line bg-bg-2 rounded-xl p-4">
                  {caption}
                </div>
              )}

              {/* Hashtags */}
              {hashtags.length > 0 && (
                <div className="mt-4 pt-4 border-t border-ink-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Hash className="w-4 h-4 text-ink-4" />
                    <span className="text-sm font-medium text-ink">Hashtags ({hashtags.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {hashtags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full group"
                      >
                        {tag}
                        <button
                          onClick={() => removeHashtag(tag)}
                          className="w-3.5 h-3.5 rounded-full hover:bg-blue-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Scheduled time */}
              <div className="mt-4 pt-4 border-t border-ink-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-tint flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-brand-dark" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-ink-4">Scheduled Posting Time</p>
                    <p className="text-sm font-medium text-ink">{scheduledDate} at {scheduledTime}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/*  RIGHT COLUMN -- Decision Panel                           */}
          {/* ======================================================== */}
          <div className="space-y-5">
            {/* Approved confirmation */}
            {status === 'approved' && !toastVisible && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-base font-semibold text-emerald-800">Deliverable Approved</p>
                <p className="text-sm text-emerald-600">This content is cleared for publishing on {scheduledDate}.</p>
              </div>
            )}

            {/* Status & Deadline Card */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              <h3 className="font-[family-name:var(--font-display)] text-base text-ink">Status & Deadline</h3>

              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-3">Status</span>
                <StatusBadge status={status} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-3">Review Deadline</span>
                <span className="text-sm font-semibold text-amber-600">
                  {deliverable?.deadline ?? 'Due in 4 hours'}
                </span>
              </div>

              <div className="bg-bg-2 rounded-xl p-3">
                <p className="text-xs text-ink-4 mb-0.5">Deadline</p>
                <p className="text-sm text-ink font-medium">{deliverable?.deadline ?? 'Mar 26, 2026 at 6:00 PM'}</p>
              </div>

              {status === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">This was scheduled for Thursday 10 AM. Approving now will post at the next available slot.</p>
                </div>
              )}
            </div>

            {/* Strategy Context Card */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              <h3 className="font-[family-name:var(--font-display)] text-base text-ink flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" /> Strategy Context
              </h3>

              <div>
                <p className="text-xs font-medium text-ink-4 uppercase tracking-wide mb-1">Why this content</p>
                <p className="text-sm text-ink-2 leading-relaxed">
                  Carousels drive 3x higher engagement than single-image posts for restaurants. A 5-slide carousel showcasing individual dishes encourages saves and shares.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full">
                  <Target className="w-3 h-3" /> Promotional
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 bg-bg-2 border border-ink-6 px-2.5 py-1 rounded-full">
                  Spring 2026 Menu Launch
                </span>
              </div>

              <div className="bg-brand-tint rounded-xl p-3 flex gap-3">
                <TrendingUp className="w-4 h-4 text-brand-dark shrink-0 mt-0.5" />
                <p className="text-xs text-brand-dark leading-relaxed font-medium">Carousels with 5+ slides get 2x more saves in your industry</p>
              </div>
            </div>

            {/* Version History Card -- oldest to newest */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-[family-name:var(--font-display)] text-base text-ink flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ink-4" /> Version History
                </h3>
                {versionHistory.length > 1 && (
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className="text-xs font-medium text-brand hover:text-brand-dark transition-colors"
                  >
                    {showDiff ? 'Hide diff' : 'Show diff'}
                  </button>
                )}
              </div>

              {/* Timeline -- oldest first (v1 at top) */}
              <div className="relative">
                {versionHistory.map((v, idx) => (
                  <div key={v.version} className="relative flex gap-4">
                    {/* Timeline line */}
                    {idx < versionHistory.length - 1 && (
                      <div className="absolute left-[11px] top-8 bottom-0 w-px bg-ink-6" />
                    )}
                    {/* Dot */}
                    <div className={`relative z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      activeVersion === v.version
                        ? 'border-brand bg-brand-tint'
                        : 'border-ink-5 bg-white'
                    }`}>
                      {activeVersion === v.version && (
                        <div className="w-2 h-2 rounded-full bg-brand" />
                      )}
                    </div>
                    {/* Content */}
                    <button
                      onClick={() => handleVersionChange(v.version)}
                      className="flex-1 text-left pb-5 group"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-semibold ${
                          activeVersion === v.version ? 'text-brand-dark' : 'text-ink group-hover:text-brand-dark'
                        } transition-colors`}>
                          Version {v.version}
                        </span>
                        {idx === versionHistory.length - 1 && (
                          <span className="text-[10px] font-medium text-brand bg-brand-tint px-1.5 py-0.5 rounded">Latest</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-3 mb-0.5">{v.note}</p>
                      <p className="text-[11px] text-ink-4">{v.date} at {v.time}</p>
                    </button>
                  </div>
                ))}
              </div>

              {/* Diff view */}
              {showDiff && versionHistory.length > 1 && (
                <div className="bg-bg-2 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-ink">Changes: v1 &rarr; v2</p>
                  <div className="space-y-2 text-xs">
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-red-500 mb-1">Removed (v1)</p>
                      <p className="text-red-700 line-through">We&apos;re excited to share our new Spring Menu. Swipe through to see what&apos;s cooking!</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-emerald-500 mb-1">Added (v2)</p>
                      <p className="text-emerald-700">We&apos;re thrilled to unveil our brand-new Spring Menu &mdash; a celebration of seasonal flavors, locally sourced ingredients, and dishes that feel like sunshine on a plate. (+ individual dish descriptions per slide)</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Feedback History Card */}
            {feedbackHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
                <h3 className="font-[family-name:var(--font-display)] text-base text-ink flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-ink-4" /> Feedback History
                </h3>

                {feedbackHistory.map(fb => (
                  <div key={fb.id} className="space-y-3">
                    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-amber-800">
                              {fb.author.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-ink">{fb.author}</span>
                        </div>
                        <span className="text-[11px] text-ink-4">{fb.date}</span>
                      </div>
                      <p className="text-sm text-ink-2 leading-relaxed">{fb.text}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fb.categories.map(cat => (
                          <span key={cat} className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                    {fb.resolution && (
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex gap-3">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide mb-1">Team Response</p>
                          <p className="text-sm text-emerald-800 leading-relaxed">{fb.resolution}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Deliverable Details Card */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              <h3 className="font-[family-name:var(--font-display)] text-base text-ink">Deliverable Details</h3>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <PlatformIcon platform={activePlatform} className="w-4 h-4" />, label: 'Platform', value: platformLabel(activePlatform) },
                  { icon: <Layers className="w-4 h-4" />, label: 'Content Type', value: deliverable?.contentType ?? 'Carousel' },
                  { icon: <Monitor className="w-4 h-4" />, label: 'Dimensions', value: '1080 x 1080px' },
                  { icon: <FileType className="w-4 h-4" />, label: 'Format', value: 'PNG' },
                  { icon: <User className="w-4 h-4" />, label: 'Created by', value: 'Sarah K. (Designer)' },
                  { icon: <Calendar className="w-4 h-4" />, label: 'Submitted', value: deliverable?.submittedDate ?? 'Mar 22, 2026' },
                ].map(item => (
                  <div key={item.label} className="bg-bg-2 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-ink-4">
                      {item.icon}
                      <span className="text-[10px] font-medium uppercase tracking-wide">{item.label}</span>
                    </div>
                    <p className="text-xs font-medium text-ink">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Request Changes Panel (expandable) */}
            {feedbackOpen && (
              <div className="bg-white rounded-2xl border-2 border-amber-200 p-5 space-y-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-[family-name:var(--font-display)] text-base text-ink">Request Changes</h3>
                  <button
                    onClick={() => {
                      setFeedbackOpen(false)
                      setFeedbackText('')
                      setFeedbackChecks([])
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-bg-2 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-ink-4" />
                  </button>
                </div>

                {/* Checkboxes */}
                <div>
                  <p className="text-xs font-medium text-ink-3 mb-2.5">What needs to change?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {feedbackCategories.map(cat => (
                      <label
                        key={cat}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                          feedbackChecks.includes(cat)
                            ? 'border-brand bg-brand-tint'
                            : 'border-ink-6 hover:bg-bg-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={feedbackChecks.includes(cat)}
                          onChange={() => toggleFeedbackCheck(cat)}
                          className="sr-only"
                        />
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          feedbackChecks.includes(cat)
                            ? 'border-brand bg-brand'
                            : 'border-ink-5'
                        }`}>
                          {feedbackChecks.includes(cat) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-xs font-medium text-ink">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Details */}
                <div>
                  <p className="text-xs font-medium text-ink-3 mb-2">Details</p>
                  <textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="Describe the specific changes you'd like to see..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-ink-5 bg-bg-2 text-sm text-ink placeholder:text-ink-4 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-shadow"
                  />
                </div>

                {/* Priority toggle */}
                <div>
                  <p className="text-xs font-medium text-ink-3 mb-2">Priority</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFeedbackPriority('normal')}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        feedbackPriority === 'normal'
                          ? 'border-brand bg-brand-tint text-brand-dark'
                          : 'border-ink-6 text-ink-3 hover:bg-bg-2'
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => setFeedbackPriority('urgent')}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        feedbackPriority === 'urgent'
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : 'border-ink-6 text-ink-3 hover:bg-bg-2'
                      }`}
                    >
                      Urgent
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitFeedback}
                  disabled={!feedbackText.trim() && feedbackChecks.length === 0}
                  className="w-full px-4 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Submit Change Request
                  {feedbackPriority === 'urgent' && ' (Urgent)'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/*  BOTTOM NAVIGATION                                           */}
        {/* ============================================================ */}
        <div className="mt-10 pt-6 border-t border-ink-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => prevItem && router.push(`/dashboard/approvals/${prevItem.id}`)}
              disabled={!prevItem}
              className="inline-flex items-center gap-2 text-sm text-ink-3 hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-xs text-ink-4 bg-bg px-3 py-1.5 rounded-full border border-ink-6">
              {currentIndex >= 0 ? `Reviewing ${currentIndex + 1} of ${pendingQueue.length} pending` : `${pendingQueue.length} pending`}
            </span>
            <button
              onClick={() => nextItem && router.push(`/dashboard/approvals/${nextItem.id}`)}
              disabled={!nextItem}
              className="inline-flex items-center gap-2 text-sm text-ink-3 hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  MOBILE STICKY APPROVE BUTTON                                 */}
      {/* ============================================================ */}
      {(status === 'pending' || status === 'changes_requested') && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden z-40 bg-white/90 backdrop-blur-xl border-t border-ink-6 px-4 py-3 safe-area-pb">
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
            >
              <Check className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={handleRequestChanges}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-ink-5 text-ink-2 text-sm font-medium hover:bg-bg-2 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Approve Toast */}
      <ApproveToast
        visible={toastVisible}
        scheduledDate={scheduledDate}
        onUndo={handleUndoApprove}
      />
    </div>
  )
}
