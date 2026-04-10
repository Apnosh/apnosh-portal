'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Send, Clock, Loader2, Check, X, Upload, Plus,
  Image as ImageIcon, Film, Globe, Camera, Tv, Briefcase,
  AlertCircle, Calendar, ChevronDown, Heart, MessageCircle,
  Share2, Bookmark, MoreHorizontal, ThumbsUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ClientOption { id: string; name: string; slug: string }
interface PlatformConnection { platform: string; username: string | null; page_name: string | null; access_token: string | null }

const PLATFORMS: { id: string; label: string; icon: typeof Camera; gradient: string; charLimit: number }[] = [
  { id: 'instagram', label: 'Instagram', icon: Camera, gradient: 'from-purple-500 via-pink-500 to-orange-400', charLimit: 2200 },
  { id: 'facebook', label: 'Facebook', icon: Globe, gradient: 'from-blue-600 to-blue-500', charLimit: 63206 },
  { id: 'tiktok', label: 'TikTok', icon: Tv, gradient: 'from-gray-900 to-gray-700', charLimit: 2200 },
  { id: 'linkedin', label: 'LinkedIn', icon: Briefcase, gradient: 'from-blue-700 to-blue-600', charLimit: 3000 },
]

export default function AdminPublishPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-ink-4 animate-spin" /></div>}>
      <AdminPublishPage />
    </Suspense>
  )
}

function AdminPublishPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const prefillClientId = searchParams.get('clientId') || ''
  const prefillText = searchParams.get('text') || ''
  const prefillImage = searchParams.get('image') || ''

  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState(prefillClientId)
  const [connections, setConnections] = useState<PlatformConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)

  const [text, setText] = useState(prefillText)
  const [mediaUrls, setMediaUrls] = useState<string[]>(prefillImage ? [prefillImage] : [])
  const [linkUrl, setLinkUrl] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now')
  const [scheduledFor, setScheduledFor] = useState('')
  const [previewPlatform, setPreviewPlatform] = useState('instagram')

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [firstComment, setFirstComment] = useState('')
  const [altText, setAltText] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationId, setLocationId] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [collaborators, setCollaborators] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [userTagInput, setUserTagInput] = useState('')
  const [userTags, setUserTags] = useState<{ username: string; x: number; y: number }[]>([])

  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; status: string; results: Record<string, { status: string; error?: string }> } | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clients').select('id, name, slug').order('name')
      setClients((data ?? []) as ClientOption[])
    })()
  }, [supabase])

  const loadConnections = useCallback(async () => {
    if (!selectedClientId) { setConnections([]); return }
    setLoadingConnections(true)
    const { data } = await supabase.from('platform_connections').select('platform, username, page_name, access_token').eq('client_id', selectedClientId).not('access_token', 'is', null)
    setConnections((data ?? []) as PlatformConnection[])
    setLoadingConnections(false)
  }, [selectedClientId, supabase])

  useEffect(() => { loadConnections() }, [loadConnections])

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      return next
    })
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `publish/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('post-drafts').upload(path, file, { upsert: false })
      if (!error) {
        const { data } = supabase.storage.from('post-drafts').getPublicUrl(path)
        setMediaUrls(prev => [...prev, data.publicUrl])
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handlePublish() {
    if (!selectedClientId || !text.trim() || selectedPlatforms.size === 0) return
    setPublishing(true); setResult(null)
    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId, text: text.trim(), mediaUrls, linkUrl: linkUrl || null,
          mediaType: mediaUrls.length > 1 ? 'carousel' : mediaUrls.length > 0 ? (mediaUrls[0].match(/\.(mp4|mov|webm)(\?|$)/i) ? 'video' : 'image') : null,
          platforms: Array.from(selectedPlatforms),
          scheduledFor: scheduleMode === 'later' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
          firstComment: firstComment.trim() || null,
          altText: altText.trim() || null,
          locationId: locationId || null,
          locationName: locationName || null,
          coverUrl: coverUrl || null,
          collaborators: collaborators ? collaborators.split(',').map(s => s.trim()).filter(Boolean) : null,
          userTags: userTags.length > 0 ? userTags : null,
        }),
      })
      setResult(await res.json())
    } catch { setResult({ success: false, status: 'failed', results: {} }) }
    setPublishing(false)
  }

  const connectedPlatforms = connections.map(c => c.platform)
  const minCharLimit = Array.from(selectedPlatforms).reduce((min, p) => Math.min(min, PLATFORMS.find(x => x.id === p)?.charLimit ?? 99999), 99999)
  const overLimit = minCharLimit < 99999 && text.length > minCharLimit
  const isVideo = mediaUrls.length > 0 && !!mediaUrls[0].match(/\.(mp4|mov|webm)(\?|$)/i)
  const isCarousel = mediaUrls.length > 1
  const selectedClient = clients.find(c => c.id === selectedClientId)
  const previewConn = connections.find(c => c.platform === previewPlatform)

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-ink-4 hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Create Post</h1>
          <p className="text-ink-3 text-sm mt-0.5">Compose and publish to multiple platforms at once.</p>
        </div>
        {selectedClient && (
          <div className="flex items-center gap-2 bg-bg-2 rounded-lg px-3 py-1.5">
            <div className="w-6 h-6 rounded-full bg-brand-tint flex items-center justify-center text-brand-dark text-[10px] font-bold">
              {selectedClient.name[0]}
            </div>
            <span className="text-xs font-medium text-ink">{selectedClient.name}</span>
          </div>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`mb-6 rounded-2xl border p-5 ${
          result.status === 'published' ? 'bg-emerald-50 border-emerald-200' :
          result.status === 'scheduled' ? 'bg-indigo-50 border-indigo-200' :
          result.status === 'partially_failed' ? 'bg-amber-50 border-amber-200' :
          'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            {result.status === 'published' ? <Check className="w-5 h-5 text-emerald-600 mt-0.5" /> :
             result.status === 'scheduled' ? <Clock className="w-5 h-5 text-indigo-600 mt-0.5" /> :
             <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />}
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink">
                {result.status === 'published' ? 'Published!' : result.status === 'scheduled' ? 'Scheduled!' : result.status === 'partially_failed' ? 'Partially published' : 'Failed'}
              </p>
              <div className="mt-2 space-y-1">
                {Object.entries(result.results || {}).map(([p, r]) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'published' ? 'bg-emerald-500' : r.status === 'not_connected' ? 'bg-ink-4' : 'bg-red-500'}`} />
                    <span className="text-xs text-ink-2 capitalize">{p}:</span>
                    <span className="text-xs text-ink-4">{r.status === 'published' ? 'Posted' : r.error || r.status}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setResult(null); setText(''); setMediaUrls([]); setSelectedPlatforms(new Set()) }} className="text-xs text-brand font-medium mt-3">
                Create another post →
              </button>
            </div>
          </div>
        </div>
      )}

      {!result && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* ═══ LEFT: Compose ═══ */}
          <div className="space-y-5">
            {/* Client + platform row */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">Client</label>
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  >
                    <option value="">Select client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">When</label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setScheduleMode('now')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${scheduleMode === 'now' ? 'bg-brand-tint text-brand-dark border-brand/30' : 'bg-white text-ink-3 border-ink-6'}`}>
                      <Send className="w-3 h-3" /> Now
                    </button>
                    <button onClick={() => setScheduleMode('later')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${scheduleMode === 'later' ? 'bg-brand-tint text-brand-dark border-brand/30' : 'bg-white text-ink-3 border-ink-6'}`}>
                      <Calendar className="w-3 h-3" /> Schedule
                    </button>
                  </div>
                  {scheduleMode === 'later' && (
                    <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="w-full mt-2 border border-ink-6 rounded-lg px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/20" />
                  )}
                </div>
              </div>

              {/* Platforms */}
              {selectedClientId && (
                <div>
                  <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-2 block">Publish to</label>
                  {loadingConnections ? <Loader2 className="w-4 h-4 text-ink-4 animate-spin" /> : (
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map(p => {
                        const connected = connectedPlatforms.includes(p.id)
                        const selected = selectedPlatforms.has(p.id)
                        const conn = connections.find(c => c.platform === p.id)
                        const Icon = p.icon
                        return (
                          <button
                            key={p.id}
                            onClick={() => connected && togglePlatform(p.id)}
                            disabled={!connected}
                            className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium border transition-all ${
                              selected ? 'bg-brand-tint text-brand-dark border-brand/30 ring-1 ring-brand/20' :
                              connected ? 'bg-white text-ink-2 border-ink-6 hover:border-brand/30' :
                              'bg-bg-2 text-ink-4 border-ink-6 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${p.gradient} flex items-center justify-center`}>
                              <Icon className="w-2.5 h-2.5 text-white" />
                            </div>
                            {p.label}
                            {selected && <Check className="w-3 h-3" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Compose area */}
            <div className="bg-white rounded-2xl border border-ink-6 p-5 space-y-4">
              {/* Text */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider">Caption</label>
                  <span className={`text-[10px] font-medium ${overLimit ? 'text-red-600' : 'text-ink-4'}`}>
                    {text.length}{minCharLimit < 99999 ? ` / ${minCharLimit.toLocaleString()}` : ''}
                  </span>
                </div>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Write your caption..."
                  rows={5}
                  className="w-full border border-ink-6 rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none leading-relaxed"
                />
              </div>

              {/* Media */}
              <div>
                <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-2 block">
                  Media {isVideo && <span className="text-purple-600 normal-case">(Video/Reel)</span>} {isCarousel && <span className="text-blue-600 normal-case">(Carousel — {mediaUrls.length} slides)</span>}
                </label>
                <div className="flex flex-wrap gap-3">
                  {mediaUrls.map((url, i) => (
                    <div key={url} className="relative group">
                      {url.match(/\.(mp4|mov|webm)(\?|$)/i) ? (
                        <video src={url} className="w-24 h-24 rounded-xl object-cover border border-ink-6 bg-black" muted />
                      ) : (
                        <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-ink-6" />
                      )}
                      <button onClick={() => setMediaUrls(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-ink text-white flex items-center justify-center hover:bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                      {isCarousel && <span className="absolute bottom-1 left-1 text-[8px] font-bold text-white bg-black/60 px-1 py-0.5 rounded">{i + 1}</span>}
                    </div>
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-ink-5 hover:border-brand/50 hover:bg-brand-tint/10 flex flex-col items-center justify-center gap-1.5 text-ink-4 hover:text-brand-dark transition-all"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    <span className="text-[9px] font-medium">{mediaUrls.length > 0 ? 'Add more' : 'Upload'}</span>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => handleFileUpload(e.target.files)} />
                <p className="text-[9px] text-ink-4 mt-2">Images: JPG, PNG, WebP. Videos: MP4, MOV. Multiple images = carousel.</p>
              </div>

              {/* Link */}
              <div>
                <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">Link (optional)</label>
                <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand" />
              </div>

              {/* Hashtag helper */}
              {selectedPlatforms.size > 0 && (
                <div>
                  <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">Hashtags</label>
                  <textarea
                    value={hashtags}
                    onChange={e => setHashtags(e.target.value)}
                    placeholder="#restaurant #foodie #localfood (added to caption or first comment)"
                    rows={2}
                    className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => { setText(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n\n') + hashtags); setHashtags('') }}
                      disabled={!hashtags.trim()}
                      className="text-[9px] text-brand font-medium disabled:opacity-30"
                    >
                      Add to caption
                    </button>
                    <span className="text-[9px] text-ink-5">|</span>
                    <button
                      onClick={() => { setFirstComment(prev => prev + (prev ? ' ' : '') + hashtags); setHashtags(''); setShowAdvanced(true) }}
                      disabled={!hashtags.trim()}
                      className="text-[9px] text-brand font-medium disabled:opacity-30"
                    >
                      Add as first comment (IG)
                    </button>
                  </div>
                </div>
              )}

              {/* Advanced options toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between py-2 text-xs text-ink-3 hover:text-ink transition-colors"
              >
                <span className="font-medium">Advanced options</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t border-ink-6">
                  {/* First comment (Instagram) */}
                  {selectedPlatforms.has('instagram') && (
                    <div>
                      <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                        First comment <span className="text-ink-4 font-normal normal-case">(Instagram — great for hashtags)</span>
                      </label>
                      <textarea
                        value={firstComment}
                        onChange={e => setFirstComment(e.target.value)}
                        placeholder="Hashtags or additional context posted as the first comment..."
                        rows={2}
                        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none"
                      />
                    </div>
                  )}

                  {/* Alt text */}
                  <div>
                    <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                      Alt text <span className="text-ink-4 font-normal normal-case">(accessibility — describes the image for screen readers)</span>
                    </label>
                    <input
                      type="text"
                      value={altText}
                      onChange={e => setAltText(e.target.value)}
                      placeholder="Describe the image..."
                      className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                      Location tag <span className="text-ink-4 font-normal normal-case">(Instagram + Facebook)</span>
                    </label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={e => setLocationName(e.target.value)}
                      placeholder="Search for a location..."
                      className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                    />
                    <p className="text-[8px] text-ink-4 mt-1">Location tagging requires a Facebook Place ID. Enter the location name for now — we&apos;ll add search in a future update.</p>
                  </div>

                  {/* Reel cover image */}
                  {isVideo && selectedPlatforms.has('instagram') && (
                    <div>
                      <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                        Reel cover image <span className="text-ink-4 font-normal normal-case">(Instagram Reels — optional)</span>
                      </label>
                      <input
                        type="url"
                        value={coverUrl}
                        onChange={e => setCoverUrl(e.target.value)}
                        placeholder="https://... (URL to cover image)"
                        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                    </div>
                  )}

                  {/* Collaborators */}
                  {selectedPlatforms.has('instagram') && (
                    <div>
                      <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                        Collaborators <span className="text-ink-4 font-normal normal-case">(Instagram collab posts)</span>
                      </label>
                      <input
                        type="text"
                        value={collaborators}
                        onChange={e => setCollaborators(e.target.value)}
                        placeholder="anchoviesandsalt, vinasonpho (exact usernames, no @)"
                        className="w-full border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                      />
                      <p className="text-[8px] text-ink-4 mt-1">Enter exact Instagram usernames separated by commas. No @ symbol. They&apos;ll receive a collab invite to accept.</p>
                    </div>
                  )}

                  {/* User tags (photo tags) */}
                  {selectedPlatforms.has('instagram') && mediaUrls.length > 0 && !isVideo && (
                    <div>
                      <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider mb-1.5 block">
                        Tag people in photo <span className="text-ink-4 font-normal normal-case">(Instagram)</span>
                      </label>
                      {userTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {userTags.map((tag, i) => (
                            <span key={i} className="text-[10px] bg-brand-tint text-brand-dark px-2 py-0.5 rounded-full flex items-center gap-1">
                              @{tag.username}
                              <button onClick={() => setUserTags(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-600">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={userTagInput}
                          onChange={e => setUserTagInput(e.target.value.replace('@', ''))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && userTagInput.trim()) {
                              e.preventDefault()
                              setUserTags(prev => [...prev, { username: userTagInput.trim(), x: 0.5, y: 0.5 }])
                              setUserTagInput('')
                            }
                          }}
                          placeholder="Exact username, no @ (e.g. anchoviesandsalt)"
                          className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                        />
                        <button
                          onClick={() => {
                            if (userTagInput.trim()) {
                              setUserTags(prev => [...prev, { username: userTagInput.trim(), x: 0.5, y: 0.5 }])
                              setUserTagInput('')
                            }
                          }}
                          disabled={!userTagInput.trim()}
                          className="text-xs text-brand font-medium px-3 disabled:opacity-30"
                        >
                          Add
                        </button>
                      </div>
                      <p className="text-[8px] text-ink-4 mt-1">Enter exact usernames without @. Tags appear at center of image. Tagged accounts must be public.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Publish button */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-ink-4">
                {selectedPlatforms.size > 0 ? `Publishing to ${selectedPlatforms.size} platform${selectedPlatforms.size > 1 ? 's' : ''}` : 'Select platforms above'}
              </p>
              <button
                onClick={handlePublish}
                disabled={publishing || !selectedClientId || !text.trim() || selectedPlatforms.size === 0 || overLimit || (scheduleMode === 'later' && !scheduledFor)}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-semibold rounded-xl px-8 py-3 flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduleMode === 'later' ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {publishing ? 'Publishing...' : scheduleMode === 'later' ? 'Schedule post' : 'Publish now'}
              </button>
            </div>
          </div>

          {/* ═══ RIGHT: Preview ═══ */}
          <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-ink-4 font-bold uppercase tracking-wider">Preview</label>
              <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5">
                {PLATFORMS.filter(p => selectedPlatforms.has(p.id)).map(p => {
                  const Icon = p.icon
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPreviewPlatform(p.id)}
                      className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${previewPlatform === p.id ? 'bg-white shadow-sm' : 'text-ink-4 hover:text-ink'}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Phone frame */}
            <div className="bg-white rounded-[28px] border-2 border-ink-5 shadow-lg overflow-hidden mx-auto" style={{ maxWidth: 340 }}>
              {/* Status bar */}
              <div className="h-6 bg-black flex items-center justify-center">
                <div className="w-16 h-1.5 bg-ink-3 rounded-full" />
              </div>

              {/* Platform header */}
              <div className="px-4 py-2.5 border-b border-ink-6 flex items-center gap-2.5 bg-white">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white text-xs font-bold">
                  {selectedClient?.name?.[0] || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-ink truncate">{previewConn?.username || previewConn?.page_name || selectedClient?.name || 'Account'}</p>
                  <p className="text-[9px] text-ink-4">
                    {previewPlatform === 'instagram' ? 'Instagram' : previewPlatform === 'facebook' ? 'Facebook Page' : previewPlatform === 'linkedin' ? 'LinkedIn' : 'TikTok'}
                  </p>
                </div>
                <MoreHorizontal className="w-4 h-4 text-ink-3" />
              </div>

              {/* Media */}
              {mediaUrls.length > 0 ? (
                <div className={`bg-bg-2 overflow-hidden relative ${previewPlatform === 'instagram' ? 'aspect-square' : 'aspect-video'}`}>
                  {isVideo ? (
                    <video src={mediaUrls[0]} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={mediaUrls[0]} alt="" className="w-full h-full object-cover" />
                  )}
                  {isCarousel && (
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                      1/{mediaUrls.length}
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-square bg-bg-2 flex items-center justify-center">
                  <div className="text-center">
                    <ImageIcon className="w-8 h-8 text-ink-5 mx-auto mb-1" />
                    <p className="text-[9px] text-ink-4">No media added</p>
                  </div>
                </div>
              )}

              {/* Engagement bar */}
              {previewPlatform === 'instagram' ? (
                <div className="px-3 py-2 flex items-center gap-4">
                  <Heart className="w-5 h-5 text-ink" />
                  <MessageCircle className="w-5 h-5 text-ink" />
                  <Share2 className="w-5 h-5 text-ink" />
                  <div className="flex-1" />
                  <Bookmark className="w-5 h-5 text-ink" />
                </div>
              ) : previewPlatform === 'facebook' ? (
                <div className="px-3 py-2 flex items-center gap-4 border-b border-ink-6">
                  <span className="text-[10px] text-ink-3 flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> Like</span>
                  <span className="text-[10px] text-ink-3 flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Comment</span>
                  <span className="text-[10px] text-ink-3 flex items-center gap-1"><Share2 className="w-3 h-3" /> Share</span>
                </div>
              ) : (
                <div className="px-3 py-2 flex items-center gap-4">
                  <span className="text-[10px] text-ink-3">👍 Like</span>
                  <span className="text-[10px] text-ink-3">💬 Comment</span>
                  <span className="text-[10px] text-ink-3">↗ Share</span>
                </div>
              )}

              {/* Caption */}
              <div className="px-3 py-2">
                {text ? (
                  <>
                    <p className="text-[11px] text-ink leading-relaxed">
                      <span className="font-semibold">{previewConn?.username || selectedClient?.name || 'account'}</span>{' '}
                      {text.length > 125 ? text.slice(0, 125) + '...' : text}
                    </p>
                    {text.length > 125 && <button className="text-[10px] text-ink-4">more</button>}
                  </>
                ) : (
                  <p className="text-[11px] text-ink-4 italic">Your caption will appear here...</p>
                )}
              </div>

              {/* Bottom safe area */}
              <div className="h-4" />
            </div>

            {selectedPlatforms.size === 0 && (
              <p className="text-center text-xs text-ink-4 italic">Select platforms to see preview</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
