'use client'

import { useState, useCallback } from 'react'
import {
  Sparkles, Lightbulb, MessageSquare, Hash, ClipboardCheck, Eye,
  Copy, Check, ChevronLeft, Loader2, Star, Calendar, ToggleLeft, ToggleRight
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToolId = 'caption' | 'ideas' | 'review' | 'hashtag' | 'audit' | 'competitor'

interface ToolDef {
  id: ToolId
  name: string
  description: string
  icon: React.ElementType
  comingSoon?: boolean
}

/* ------------------------------------------------------------------ */
/*  Tool definitions                                                   */
/* ------------------------------------------------------------------ */

const tools: ToolDef[] = [
  { id: 'caption', name: 'Caption Generator', description: 'Generate on-brand captions for any platform', icon: Sparkles },
  { id: 'ideas', name: 'Content Idea Generator', description: 'Get fresh content ideas for your industry', icon: Lightbulb },
  { id: 'review', name: 'Review Response Generator', description: 'Draft professional responses to customer reviews', icon: MessageSquare },
  { id: 'hashtag', name: 'Hashtag Research', description: 'Find the best hashtags for your posts', icon: Hash },
  { id: 'audit', name: 'Social Media Audit', description: 'Automated profile health check across all platforms', icon: ClipboardCheck, comingSoon: true },
  { id: 'competitor', name: 'Competitor Analysis', description: 'Track competitor posting frequency, engagement, and content strategy', icon: Eye, comingSoon: true },
]

/* ------------------------------------------------------------------ */
/*  Mock data generators                                               */
/* ------------------------------------------------------------------ */

const mockCaptions = (platform: string, topic: string, tone: string, hashtags: boolean, cta: boolean): string[] => {
  const ht = hashtags ? '\n\n#SmallBusiness #MarketingTips #GrowYourBrand #ContentCreator #DigitalMarketing' : ''
  const ctaText = cta ? '\n\n👉 Link in bio to learn more!' : ''
  const base = topic || 'your brand'
  if (platform === 'TikTok') {
    return [
      `POV: You finally figured out the secret to ${base} ✨ And no, it's not what you think…${ctaText}${ht}`,
      `Stop scrolling — this ${base} tip is about to change everything 🔥 Save this for later.${ctaText}${ht}`,
      `The ${base} hack nobody talks about 👀 Watch till the end.${ctaText}${ht}`,
    ]
  }
  if (tone === 'Professional') {
    return [
      `We're excited to share our latest insight on ${base}. Quality and consistency remain the cornerstones of brand growth.${ctaText}${ht}`,
      `Building a strong presence around ${base} takes strategy. Here's what we've learned from helping hundreds of businesses grow.${ctaText}${ht}`,
      `Our approach to ${base} is rooted in data-driven decisions and creative excellence. The results speak for themselves.${ctaText}${ht}`,
    ]
  }
  return [
    `Here's the thing about ${base} — when you show up authentically, your audience notices ✨ Consistency over perfection, always.${ctaText}${ht}`,
    `We've been working on something special related to ${base} and we can't wait to share it with you 🎉 Stay tuned!${ctaText}${ht}`,
    `Real talk: ${base} doesn't have to be complicated. Start simple, stay consistent, and watch the magic happen 🚀${ctaText}${ht}`,
  ]
}

interface ContentIdea {
  title: string
  description: string
  platform: string
  bestDay: string
  contentType: string
}

const mockIdeas: ContentIdea[] = [
  { title: 'Behind-the-Scenes Monday', description: 'Show your workspace, morning routine, or team meeting to humanise your brand.', platform: 'Instagram Stories', bestDay: 'Monday', contentType: 'Stories' },
  { title: 'Quick Tip Carousel', description: '5 actionable tips in your niche — easy to save and share.', platform: 'Instagram', bestDay: 'Tuesday', contentType: 'Carousels' },
  { title: 'Industry Myth-Buster Reel', description: 'Debunk a common misconception with a punchy 30-second reel.', platform: 'Reels/TikTok', bestDay: 'Wednesday', contentType: 'Reels/TikTok' },
  { title: 'Client Spotlight', description: 'Feature a customer win or testimonial. Tag them for extra reach.', platform: 'Facebook', bestDay: 'Wednesday', contentType: 'Feed posts' },
  { title: 'Trending Audio + Your Niche', description: 'Jump on a trending sound and tie it back to your service or product.', platform: 'TikTok', bestDay: 'Thursday', contentType: 'Reels/TikTok' },
  { title: '"This or That" Poll', description: 'Interactive poll related to your industry — boosts engagement and saves.', platform: 'Instagram Stories', bestDay: 'Thursday', contentType: 'Stories' },
  { title: 'Value-Packed Email', description: 'Send a mid-week newsletter with one big takeaway and a clear CTA.', platform: 'Email', bestDay: 'Friday', contentType: 'Email' },
  { title: 'Transformation Post', description: 'Before/after or process breakdown showing real results.', platform: 'Instagram', bestDay: 'Friday', contentType: 'Feed posts' },
  { title: 'Weekend Engagement Post', description: 'Ask a low-effort question — "What are you working on this weekend?"', platform: 'Facebook', bestDay: 'Saturday', contentType: 'Feed posts' },
  { title: 'Motivational Monday Prep', description: 'Sunday evening post with a motivational quote relevant to your audience.', platform: 'Instagram', bestDay: 'Sunday', contentType: 'Feed posts' },
]

const mockReviewResponses = (rating: number, tone: string): { responses: string[]; tips: string[] } => {
  const isPositive = rating >= 4
  if (isPositive) {
    const responses = tone === 'Grateful'
      ? [
        'Thank you so much for your incredibly kind words! Your support means the world to our team. We truly appreciate you taking the time to share your experience, and we look forward to serving you again soon!',
        'We\'re absolutely thrilled to hear this! Feedback like yours is what motivates our team every single day. Thank you for choosing us — it\'s been a pleasure working with you!',
      ]
      : [
        'Thank you for the wonderful review! We\'re glad we could deliver a great experience. Our team works hard to maintain these standards, and your feedback inspires us to keep going. See you next time!',
        'We really appreciate you sharing this! It\'s always great to know our efforts are hitting the mark. We\'d love to welcome you back anytime — thanks for being a valued customer!',
      ]
    return {
      responses,
      tips: [
        'Respond within 24 hours to show you value the feedback',
        'Mention specifics from their review to show you read it carefully',
        'Invite them back or suggest a next step to build loyalty',
        'Keep it concise — 2-4 sentences is the sweet spot',
      ],
    }
  }
  const responses = tone === 'Apologetic'
    ? [
      'We sincerely apologise for your experience. This is not the standard we hold ourselves to, and we take your feedback very seriously. We\'d love the opportunity to make this right — please reach out to us directly at your convenience so we can address your concerns personally.',
      'Thank you for bringing this to our attention, and we\'re truly sorry we fell short. Your experience matters to us, and we\'re already looking into this. Could you contact us directly? We want to ensure this is resolved to your satisfaction.',
    ]
    : [
      'Thank you for your honest feedback. We\'re sorry to hear your experience didn\'t meet expectations. We\'re reviewing your comments carefully and would appreciate the chance to discuss this further. Please don\'t hesitate to reach out to us directly.',
      'We appreciate you taking the time to share your concerns. We understand your frustration and are committed to improving. We\'d like to learn more about your experience — please contact us so we can work toward a resolution.',
    ]
  return {
    responses,
    tips: [
      'Respond calmly and avoid being defensive',
      'Acknowledge the issue without making excuses',
      'Take the conversation offline — invite them to contact you directly',
      'Follow up privately to ensure the issue is resolved',
      'Use it as an opportunity to show other readers you care',
    ],
  }
}

interface HashtagItem { tag: string; posts: string; relevance: number }

const mockHashtags = (topic: string): { high: HashtagItem[]; medium: HashtagItem[]; niche: HashtagItem[] } => {
  const t = topic || 'marketing'
  return {
    high: [
      { tag: `#${t}`, posts: '4.2M', relevance: 98 },
      { tag: `#${t}tips`, posts: '1.8M', relevance: 95 },
      { tag: '#smallbusiness', posts: '3.5M', relevance: 88 },
      { tag: '#entrepreneur', posts: '2.9M', relevance: 82 },
      { tag: '#growthmindset', posts: '1.2M', relevance: 76 },
    ],
    medium: [
      { tag: `#${t}strategy`, posts: '340K', relevance: 94 },
      { tag: `#${t}agency`, posts: '180K', relevance: 91 },
      { tag: '#brandbuilding', posts: '260K', relevance: 87 },
      { tag: '#contentcreation', posts: '420K', relevance: 85 },
      { tag: '#socialmediamanager', posts: '150K', relevance: 80 },
    ],
    niche: [
      { tag: `#${t}for${t === 'marketing' ? 'startups' : 'growth'}`, posts: '12K', relevance: 97 },
      { tag: `#${t}hacks`, posts: '28K', relevance: 93 },
      { tag: '#localbusinesstips', posts: '8.4K', relevance: 90 },
      { tag: '#organicgrowth', posts: '35K', relevance: 86 },
      { tag: `#${t}community`, posts: '6.1K', relevance: 83 },
    ],
  }
}

/* ------------------------------------------------------------------ */
/*  Reusable small components                                          */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand-dark transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-ink-2">
      {checked ? <ToggleRight className="w-5 h-5 text-brand" /> : <ToggleLeft className="w-5 h-5 text-ink-4" />}
      {label}
    </button>
  )
}

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        selected ? 'bg-brand text-white shadow-sm' : 'bg-ink-6 text-ink-3 hover:bg-ink-5'
      }`}
    >
      {label}
    </button>
  )
}

function MultiPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        selected ? 'bg-brand-tint border-brand text-brand-dark' : 'bg-white border-ink-5 text-ink-3 hover:border-ink-4'
      }`}
    >
      {label}
    </button>
  )
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} onClick={() => onChange(s)} className="transition-transform hover:scale-110">
          <Star className={`w-6 h-6 ${s <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-5'}`} />
        </button>
      ))}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="relative">
        <Loader2 className="w-8 h-8 text-brand animate-spin" />
        <Sparkles className="w-4 h-4 text-brand absolute -top-1 -right-1 animate-pulse" />
      </div>
      <p className="text-sm text-ink-3 animate-pulse">Generating with AI...</p>
    </div>
  )
}

function Badge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'Feed posts': 'bg-blue-50 text-blue-600',
    'Stories': 'bg-purple-50 text-purple-600',
    'Reels/TikTok': 'bg-pink-50 text-pink-600',
    'Carousels': 'bg-amber-50 text-amber-600',
    'Email': 'bg-green-50 text-green-600',
  }
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[type] || 'bg-ink-6 text-ink-3'}`}>
      {type}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool 1 — Caption Generator                                        */
/* ------------------------------------------------------------------ */

function CaptionTool() {
  const [platform, setPlatform] = useState('Instagram')
  const [postType, setPostType] = useState('Promotional')
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('Use my brand voice')
  const [hashtags, setHashtags] = useState(true)
  const [cta, setCta] = useState(true)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<string[] | null>(null)

  const generate = () => {
    setLoading(true)
    setResults(null)
    setTimeout(() => {
      setResults(mockCaptions(platform, topic, tone, hashtags, cta))
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="space-y-5">
      {/* Platform */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Platform</label>
        <div className="flex gap-2 flex-wrap">
          {['Instagram', 'Facebook', 'TikTok'].map((p) => (
            <Pill key={p} label={p} selected={platform === p} onClick={() => setPlatform(p)} />
          ))}
        </div>
      </div>

      {/* Post type */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Post Type</label>
        <div className="flex gap-2 flex-wrap">
          {['Promotional', 'Educational', 'Behind the Scenes', 'Engagement', 'Announcement'].map((t) => (
            <Pill key={t} label={t} selected={postType === t} onClick={() => setPostType(t)} />
          ))}
        </div>
      </div>

      {/* Topic */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">What&apos;s this post about?</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Launching our new spring collection this Friday..."
          className="w-full rounded-lg border border-ink-5 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none h-20"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Tone</label>
        <div className="flex gap-2 flex-wrap">
          {['Use my brand voice', 'Casual', 'Professional', 'Playful', 'Bold'].map((t) => (
            <Pill key={t} label={t} selected={tone === t} onClick={() => setTone(t)} />
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex gap-6">
        <Toggle checked={hashtags} onChange={setHashtags} label="Include hashtags" />
        <Toggle checked={cta} onChange={setCta} label="Include CTA" />
      </div>

      {/* Generate */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-dark text-white font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? 'Generating...' : 'Generate Caption'}
      </button>

      {/* Results */}
      {loading && <LoadingState />}
      {results && (
        <div className="space-y-3 animate-in fade-in duration-500">
          <h4 className="text-xs font-medium text-ink-3 uppercase tracking-wider">3 Variations</h4>
          {results.map((caption, i) => (
            <div key={i} className="bg-bg-2 rounded-lg p-4 border border-ink-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-ink whitespace-pre-line leading-relaxed flex-1">{caption}</p>
                <CopyButton text={caption} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool 2 — Content Idea Generator                                    */
/* ------------------------------------------------------------------ */

function IdeasTool() {
  const [period, setPeriod] = useState('This week')
  const [types, setTypes] = useState<string[]>(['Feed posts', 'Stories', 'Reels/TikTok'])
  const [events, setEvents] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ContentIdea[] | null>(null)
  const [saved, setSaved] = useState<Set<number>>(new Set())

  const toggleType = (t: string) => {
    setTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  const generate = () => {
    setLoading(true)
    setResults(null)
    setSaved(new Set())
    setTimeout(() => {
      const filtered = mockIdeas.filter((idea) => types.includes(idea.contentType))
      setResults(filtered.length > 0 ? filtered : mockIdeas.slice(0, 8))
      setLoading(false)
    }, 1500)
  }

  const saveToCalendar = (index: number) => {
    setSaved((prev) => new Set(prev).add(index))
  }

  return (
    <div className="space-y-5">
      {/* Period */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Time Period</label>
        <div className="flex gap-2 flex-wrap">
          {['This week', 'Next 2 weeks', 'This month'].map((p) => (
            <Pill key={p} label={p} selected={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>
      </div>

      {/* Content types */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Content Types</label>
        <div className="flex gap-2 flex-wrap">
          {['Feed posts', 'Stories', 'Reels/TikTok', 'Carousels', 'Email'].map((t) => (
            <MultiPill key={t} label={t} selected={types.includes(t)} onClick={() => toggleType(t)} />
          ))}
        </div>
      </div>

      {/* Events */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Any upcoming events or promotions?</label>
        <textarea
          value={events}
          onChange={(e) => setEvents(e.target.value)}
          placeholder="e.g. Black Friday sale, new product launch, team anniversary..."
          className="w-full rounded-lg border border-ink-5 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none h-20"
        />
      </div>

      {/* Generate */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-dark text-white font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? 'Generating...' : 'Generate Ideas'}
      </button>

      {/* Results */}
      {loading && <LoadingState />}
      {results && (
        <div className="space-y-3 animate-in fade-in duration-500">
          <h4 className="text-xs font-medium text-ink-3 uppercase tracking-wider">{results.length} Content Ideas</h4>
          {results.map((idea, i) => (
            <div key={i} className="bg-bg-2 rounded-lg p-4 border border-ink-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h5 className="text-sm font-semibold text-ink">{idea.title}</h5>
                    <Badge type={idea.contentType} />
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed mb-2">{idea.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-ink-4">
                    <span>{idea.platform}</span>
                    <span>•</span>
                    <span>Best on {idea.bestDay}</span>
                  </div>
                </div>
                <button
                  onClick={() => saveToCalendar(i)}
                  disabled={saved.has(i)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                    saved.has(i) ? 'bg-brand-tint text-brand-dark' : 'bg-white border border-ink-5 text-ink-3 hover:border-brand hover:text-brand-dark'
                  }`}
                >
                  {saved.has(i) ? <Check className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {saved.has(i) ? 'Saved' : 'Save to Calendar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool 3 — Review Response Generator                                 */
/* ------------------------------------------------------------------ */

function ReviewTool() {
  const [rating, setRating] = useState(5)
  const [review, setReview] = useState('')
  const [tone, setTone] = useState('Grateful')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ responses: string[]; tips: string[] } | null>(null)

  const generate = () => {
    setLoading(true)
    setResults(null)
    setTimeout(() => {
      setResults(mockReviewResponses(rating, tone))
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="space-y-5">
      {/* Rating */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Customer Rating</label>
        <StarRating value={rating} onChange={setRating} />
      </div>

      {/* Review text */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Paste the customer&apos;s review</label>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Paste the review text here..."
          className="w-full rounded-lg border border-ink-5 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none h-24"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Response Tone</label>
        <div className="flex gap-2 flex-wrap">
          {['Grateful', 'Apologetic', 'Professional', 'Friendly'].map((t) => (
            <Pill key={t} label={t} selected={tone === t} onClick={() => setTone(t)} />
          ))}
        </div>
      </div>

      {/* Generate */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-dark text-white font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? 'Generating...' : 'Generate Response'}
      </button>

      {/* Results */}
      {loading && <LoadingState />}
      {results && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <h4 className="text-xs font-medium text-ink-3 uppercase tracking-wider">2 Response Variations</h4>
          {results.responses.map((resp, i) => (
            <div key={i} className="bg-bg-2 rounded-lg p-4 border border-ink-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-ink leading-relaxed flex-1">{resp}</p>
                <CopyButton text={resp} />
              </div>
            </div>
          ))}

          {/* Tips */}
          <div className="bg-brand-tint rounded-lg p-4 border border-brand/10">
            <h5 className="text-xs font-semibold text-brand-dark mb-2">
              Best practices for responding to {rating >= 4 ? 'positive' : 'negative'} reviews
            </h5>
            <ul className="space-y-1.5">
              {results.tips.map((tip, i) => (
                <li key={i} className="text-xs text-ink-2 flex items-start gap-2">
                  <Check className="w-3 h-3 text-brand mt-0.5 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tool 4 — Hashtag Research                                          */
/* ------------------------------------------------------------------ */

function HashtagTool() {
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ReturnType<typeof mockHashtags> | null>(null)
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null)

  const generate = () => {
    setLoading(true)
    setResults(null)
    setTimeout(() => {
      setResults(mockHashtags(topic.toLowerCase().replace(/\s+/g, '') || 'marketing'))
      setLoading(false)
    }, 1500)
  }

  const copyGroup = (group: HashtagItem[], name: string) => {
    navigator.clipboard.writeText(group.map((h) => h.tag).join(' '))
    setCopiedGroup(name)
    setTimeout(() => setCopiedGroup(null), 2000)
  }

  const RelevanceBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-ink-6 rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full" style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-ink-4">{score}%</span>
    </div>
  )

  const HashtagGroup = ({ title, subtitle, items, name }: { title: string; subtitle: string; items: HashtagItem[]; name: string }) => (
    <div className="bg-bg-2 rounded-lg p-4 border border-ink-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h5 className="text-sm font-semibold text-ink">{title}</h5>
          <p className="text-[10px] text-ink-4">{subtitle}</p>
        </div>
        <button
          onClick={() => copyGroup(items, name)}
          className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-brand-dark transition-colors"
        >
          {copiedGroup === name ? <Check className="w-3.5 h-3.5 text-brand" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedGroup === name ? 'Copied' : 'Copy all'}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((h) => (
          <div key={h.tag} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-brand-dark">{h.tag}</span>
              <span className="text-[10px] text-ink-4">{h.posts} posts</span>
            </div>
            <RelevanceBar score={h.relevance} />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Topic */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Topic or keyword</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. coffee shop, fitness, real estate..."
          className="w-full rounded-lg border border-ink-5 bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>

      {/* Platform */}
      <div>
        <label className="text-xs font-medium text-ink-3 uppercase tracking-wider mb-2 block">Platform</label>
        <div className="flex gap-2">
          {['Instagram', 'TikTok'].map((p) => (
            <Pill key={p} label={p} selected={platform === p} onClick={() => setPlatform(p)} />
          ))}
        </div>
      </div>

      {/* Generate */}
      <button
        onClick={generate}
        disabled={loading}
        className="w-full bg-brand hover:bg-brand-dark text-white font-medium text-sm py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? 'Researching...' : 'Research Hashtags'}
      </button>

      {/* Results */}
      {loading && <LoadingState />}
      {results && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <HashtagGroup title="High Reach" subtitle="500K+ posts" items={results.high} name="high" />
          <HashtagGroup title="Medium Reach" subtitle="50K – 500K posts" items={results.medium} name="medium" />
          <HashtagGroup title="Niche / Targeted" subtitle="<50K posts" items={results.niche} name="niche" />

          {/* Recommendation */}
          <div className="bg-brand-tint rounded-lg p-4 border border-brand/10">
            <p className="text-xs text-brand-dark font-medium flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Recommended mix: Use <strong>3 high</strong> + <strong>5 medium</strong> + <strong>7 niche</strong> hashtags for best results</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null)

  const activeToolDef = tools.find((t) => t.id === activeTool)

  const renderTool = useCallback(() => {
    switch (activeTool) {
      case 'caption': return <CaptionTool />
      case 'ideas': return <IdeasTool />
      case 'review': return <ReviewTool />
      case 'hashtag': return <HashtagTool />
      default: return null
    }
  }, [activeTool])

  /* ---- Grid view ---- */
  if (!activeTool) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">AI Tools</h1>
          <p className="text-ink-3 text-sm mt-1">Powered by AI, tailored to your brand</p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon
            if (tool.comingSoon) {
              return (
                <div
                  key={tool.id}
                  className="relative bg-white rounded-xl border border-ink-6 p-5 opacity-60 cursor-default"
                >
                  <div className="absolute top-4 right-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-ink-6 text-ink-4 px-2.5 py-1 rounded-full">
                      Coming Soon
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-ink-6 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-ink-4" />
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-base text-ink-3">{tool.name}</h3>
                  <p className="text-xs text-ink-4 mt-1 leading-relaxed">{tool.description}</p>
                </div>
              )
            }
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className="text-left bg-white rounded-xl border border-ink-6 p-5 hover:shadow-md hover:border-brand/30 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-tint flex items-center justify-center mb-3 group-hover:bg-brand/10 transition-colors">
                  <Icon className="w-5 h-5 text-brand-dark" />
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-base text-ink group-hover:text-brand-dark transition-colors">{tool.name}</h3>
                <p className="text-xs text-ink-4 mt-1 leading-relaxed">{tool.description}</p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ---- Expanded tool view ---- */
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveTool(null)}
          className="w-8 h-8 rounded-lg border border-ink-6 flex items-center justify-center text-ink-3 hover:bg-bg-2 hover:text-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2.5">
          {activeToolDef && (
            <div className="w-8 h-8 rounded-lg bg-brand-tint flex items-center justify-center">
              <activeToolDef.icon className="w-4 h-4 text-brand-dark" />
            </div>
          )}
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl text-ink">{activeToolDef?.name}</h1>
            <p className="text-xs text-ink-4">{activeToolDef?.description}</p>
          </div>
        </div>
      </div>

      {/* Tool body */}
      <div className="bg-white rounded-xl border border-ink-6 p-5 lg:p-6">
        {renderTool()}
      </div>
    </div>
  )
}
