'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MessageCircle, Mail, Grid, Loader2, Send, Trash2, Edit3, X,
  Camera, Globe, Heart, ExternalLink, Check, AlertCircle,
  Image as ImageIcon, RefreshCw, Tv, Briefcase, ChevronDown,
  MoreHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ClientOption { id: string; name: string; slug: string }
interface Comment { id: string; platform: string; postId: string; postCaption?: string; postImageUrl?: string; author: string; text: string; timestamp: string; replies?: Comment[]; likeCount?: number }
interface Post { id: string; platform: string; caption: string; mediaUrl?: string; mediaType: string; permalink: string; timestamp: string; likeCount: number; commentCount: number; shareCount?: number }

const PLATFORM_TABS = [
  { id: 'all', label: 'All Platforms', icon: Grid },
  { id: 'instagram', label: 'Instagram', icon: Camera, gradient: 'from-purple-500 via-pink-500 to-orange-400' },
  { id: 'facebook', label: 'Facebook', icon: Globe, gradient: 'from-blue-600 to-blue-500' },
  { id: 'tiktok', label: 'TikTok', icon: Tv, gradient: 'from-gray-900 to-gray-700' },
  { id: 'linkedin', label: 'LinkedIn', icon: Briefcase, gradient: 'from-blue-700 to-blue-600' },
]

const VIEW_TABS = [
  { id: 'comments', label: 'Comments', icon: MessageCircle },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'posts', label: 'Posts', icon: Grid },
]

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SocialInboxPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [viewTab, setViewTab] = useState<'comments' | 'messages' | 'posts'>('comments')
  const [loading, setLoading] = useState(false)

  const [comments, setComments] = useState<Comment[]>([])
  const [posts, setPosts] = useState<Post[]>([])

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [editingPost, setEditingPost] = useState<string | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clients').select('id, name, slug').order('name')
      setClients((data ?? []) as ClientOption[])
    })()
  }, [supabase])

  async function callInbox(action: string, params: Record<string, unknown> = {}) {
    const res = await fetch('/api/social/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, clientId: selectedClientId, ...params }),
    })
    return res.json()
  }

  const loadData = useCallback(async () => {
    if (!selectedClientId) return
    setLoading(true)
    setActionResult(null)

    if (viewTab === 'comments') {
      const data = await callInbox('fetch_comments')
      setComments(data.comments || [])
      if (data.errors?.length) setActionResult({ success: false, message: 'Some platforms failed: ' + data.errors.join(', ') })
    } else if (viewTab === 'posts') {
      const data = await callInbox('fetch_posts')
      setPosts(data.posts || [])
      if (data.errors?.length) setActionResult({ success: false, message: 'Some platforms failed: ' + data.errors.join(', ') })
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId, viewTab])

  useEffect(() => { loadData() }, [loadData])

  // Filter by platform
  const filteredComments = platformFilter === 'all' ? comments : comments.filter(c => c.platform === platformFilter)

  // De-duplicate cross-posted content when viewing "All Platforms"
  // Group posts with similar captions (first 60 chars match) within 24 hours
  type GroupedPost = Post & { platforms: string[]; allIds: { platform: string; id: string }[] }
  const groupedPosts: GroupedPost[] = (() => {
    if (platformFilter !== 'all') {
      return posts.filter(p => p.platform === platformFilter).map(p => ({ ...p, platforms: [p.platform], allIds: [{ platform: p.platform, id: p.id }] }))
    }
    const groups: GroupedPost[] = []
    const used = new Set<string>()
    for (const post of posts) {
      if (used.has(post.id)) continue
      const key = post.caption.slice(0, 60).toLowerCase().trim()
      // Find matching posts (same caption prefix, within 24h)
      const matches = posts.filter(p =>
        !used.has(p.id) &&
        p.id !== post.id &&
        p.caption.slice(0, 60).toLowerCase().trim() === key &&
        key.length > 10 &&
        Math.abs(new Date(p.timestamp).getTime() - new Date(post.timestamp).getTime()) < 86400000
      )
      const allPosts = [post, ...matches]
      for (const p of allPosts) used.add(p.id)
      groups.push({
        ...post,
        platforms: allPosts.map(p => p.platform),
        allIds: allPosts.map(p => ({ platform: p.platform, id: p.id })),
        likeCount: allPosts.reduce((s, p) => s + p.likeCount, 0),
        commentCount: allPosts.reduce((s, p) => s + p.commentCount, 0),
      })
    }
    return groups
  })()

  async function handleReply(commentId: string, platform: string) {
    if (!replyText.trim()) return
    setSending(true)
    const result = await callInbox('reply_comment', { commentId, text: replyText, platform })
    setSending(false)
    if (result.success) {
      setReplyingTo(null); setReplyText('')
      setActionResult({ success: true, message: 'Reply sent!' })
      loadData()
    } else {
      setActionResult({ success: false, message: result.error || 'Failed to reply' })
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    const result = await callInbox('delete_comment', { commentId })
    setActionResult(result.success ? { success: true, message: 'Comment deleted' } : { success: false, message: result.error })
    if (result.success) loadData()
  }

  async function handleDeletePost(postId: string, platform: string) {
    if (!confirm('Delete this post? This cannot be undone.')) return
    const result = await callInbox('delete_post', { postId, platform })
    setActionResult(result.success ? { success: true, message: 'Post deleted' } : { success: false, message: result.error })
    if (result.success) loadData()
  }

  async function handleEditPost(postId: string, platform: string) {
    if (!editCaption.trim()) return
    setSending(true)
    const result = await callInbox('edit_post', { postId, newCaption: editCaption, platform })
    setSending(false)
    if (result.success) {
      setEditingPost(null); setEditCaption('')
      setActionResult({ success: true, message: 'Post updated' })
      loadData()
    } else {
      setActionResult({ success: false, message: result.error })
    }
  }

  const selectedClient = clients.find(c => c.id === selectedClientId)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Social Inbox</h1>
          <p className="text-ink-3 text-sm mt-0.5">Manage comments, messages, and posts across all platforms.</p>
        </div>
        <button onClick={loadData} disabled={loading || !selectedClientId} className="text-xs text-brand font-medium flex items-center gap-1 disabled:opacity-30">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Client + Platform + View selectors */}
      <div className="bg-white rounded-2xl border border-ink-6 p-4 space-y-3">
        {/* Top row: client selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            className="border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 min-w-[200px]"
          >
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {selectedClient && (
            <div className="flex items-center gap-1.5 bg-bg-2 rounded-lg px-2.5 py-1.5">
              <div className="w-5 h-5 rounded-full bg-brand-tint flex items-center justify-center text-brand-dark text-[9px] font-bold">
                {selectedClient.name[0]}
              </div>
              <span className="text-xs font-medium text-ink">{selectedClient.name}</span>
            </div>
          )}

          <div className="flex-1" />

          {/* View tabs */}
          <div className="flex gap-0.5 bg-bg-2 rounded-lg p-0.5">
            {VIEW_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setViewTab(t.id as 'comments' | 'messages' | 'posts')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewTab === t.id ? 'bg-white shadow-sm text-ink' : 'text-ink-3 hover:text-ink'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform filter pills */}
        {selectedClientId && (
          <div className="flex gap-1.5">
            {PLATFORM_TABS.map(p => {
              const Icon = p.icon
              const active = platformFilter === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPlatformFilter(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                    active ? 'bg-brand-tint text-brand-dark border-brand/30' : 'bg-white text-ink-3 border-ink-6 hover:border-ink-5'
                  }`}
                >
                  {p.gradient ? (
                    <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${p.gradient} flex items-center justify-center`}>
                      <Icon className="w-2.5 h-2.5 text-white" />
                    </div>
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Action result */}
      {actionResult && (
        <div className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
          actionResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {actionResult.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {actionResult.message}
          <button onClick={() => setActionResult(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Content */}
      {!selectedClientId ? (
        <div className="bg-white rounded-2xl border border-ink-6 p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-bg-2 flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 text-ink-4" />
          </div>
          <p className="text-sm font-medium text-ink-2">Select a client to manage their social inbox</p>
          <p className="text-xs text-ink-4 mt-1">Choose a client from the dropdown above to see their comments, messages, and posts.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-brand animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Comments ── */}
          {viewTab === 'comments' && (
            filteredComments.length === 0 ? (
              <EmptyState icon={MessageCircle} title="No comments yet" subtitle="Comments on Instagram and Facebook posts will appear here. Make sure accounts are connected." />
            ) : (
              <div className="space-y-2">
                {filteredComments.map(comment => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    isReplying={replyingTo === comment.id}
                    replyText={replyText}
                    sending={sending}
                    onToggleReply={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText('') }}
                    onReplyTextChange={setReplyText}
                    onReply={() => handleReply(comment.id, comment.platform)}
                    onDelete={() => handleDeleteComment(comment.id)}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Messages ── */}
          {viewTab === 'messages' && (
            <EmptyState
              icon={Mail}
              title="Messages coming soon"
              subtitle="Instagram DM access requires the app to be approved by Meta for production use. We're working on it."
            />
          )}

          {/* ── Posts ── */}
          {viewTab === 'posts' && (
            groupedPosts.length === 0 ? (
              <EmptyState icon={Grid} title="No published posts" subtitle="Posts published through the portal or directly on the platforms will appear here." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {groupedPosts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    isEditing={editingPost === post.id}
                    editCaption={editCaption}
                    sending={sending}
                    onStartEdit={() => { setEditingPost(post.id); setEditCaption(post.caption) }}
                    onCancelEdit={() => setEditingPost(null)}
                    onEditCaptionChange={setEditCaption}
                    onSaveEdit={() => handleEditPost(post.id, post.platform)}
                    onDelete={() => handleDeletePost(post.id, post.platform)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

/* ─── Empty State ───────────────────────────────────── */

function EmptyState({ icon: Icon, title, subtitle }: { icon: typeof MessageCircle; title: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6 text-ink-4" />
      </div>
      <p className="text-sm font-medium text-ink-2">{title}</p>
      <p className="text-xs text-ink-4 mt-1 max-w-md mx-auto">{subtitle}</p>
    </div>
  )
}

/* ─── Comment Card ──────────────────────────────────── */

function CommentCard({
  comment, isReplying, replyText, sending,
  onToggleReply, onReplyTextChange, onReply, onDelete,
}: {
  comment: Comment
  isReplying: boolean
  replyText: string
  sending: boolean
  onToggleReply: () => void
  onReplyTextChange: (v: string) => void
  onReply: () => void
  onDelete: () => void
}) {
  const platformGradient = comment.platform === 'instagram' ? 'from-purple-500 via-pink-500 to-orange-400' : 'from-blue-600 to-blue-500'
  const PlatformIcon = comment.platform === 'instagram' ? Camera : Globe

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 hover:border-ink-5 transition-colors">
      <div className="flex items-start gap-3">
        {/* Post thumbnail */}
        {comment.postImageUrl && (
          <img src={comment.postImageUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-ink-6" />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${platformGradient} flex items-center justify-center flex-shrink-0`}>
              <PlatformIcon className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs font-bold text-ink">@{comment.author}</span>
            <span className="text-[10px] text-ink-4">{timeAgo(comment.timestamp)}</span>
            {comment.likeCount != null && comment.likeCount > 0 && (
              <span className="text-[10px] text-ink-4 flex items-center gap-0.5 ml-auto"><Heart className="w-2.5 h-2.5" />{comment.likeCount}</span>
            )}
          </div>

          {/* Comment text */}
          <p className="text-sm text-ink-2 leading-relaxed">{comment.text}</p>

          {/* On which post */}
          {comment.postCaption && (
            <p className="text-[10px] text-ink-4 mt-1.5 truncate">on: &ldquo;{comment.postCaption}&rdquo;</p>
          )}

          {/* Existing replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-2.5 pl-4 border-l-2 border-brand/20 space-y-2">
              {comment.replies.map(reply => (
                <div key={reply.id}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-ink">@{reply.author}</span>
                    <span className="text-[9px] text-ink-4">{timeAgo(reply.timestamp)}</span>
                  </div>
                  <p className="text-xs text-ink-2">{reply.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2.5">
            <button onClick={onToggleReply} className="text-[10px] text-brand font-semibold flex items-center gap-1 hover:text-brand-dark transition-colors">
              <MessageCircle className="w-3 h-3" /> {isReplying ? 'Cancel' : 'Reply'}
            </button>
            {comment.platform === 'instagram' && (
              <button onClick={onDelete} className="text-[10px] text-ink-4 hover:text-red-500 font-medium flex items-center gap-1 transition-colors">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>

          {/* Reply input */}
          {isReplying && (
            <div className="mt-2.5 flex gap-2">
              <input
                value={replyText}
                onChange={e => onReplyTextChange(e.target.value)}
                placeholder="Write a reply..."
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onReply() } }}
                autoFocus
                className="flex-1 border border-ink-6 rounded-lg px-3 py-2 text-xs text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              />
              <button
                onClick={onReply}
                disabled={sending || !replyText.trim()}
                className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Post Card ─────────────────────────────────────── */

function PostCard({
  post, isEditing, editCaption, sending,
  onStartEdit, onCancelEdit, onEditCaptionChange, onSaveEdit, onDelete,
}: {
  post: Post & { platforms?: string[]; allIds?: { platform: string; id: string }[] }
  isEditing: boolean
  editCaption: string
  sending: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onEditCaptionChange: (v: string) => void
  onSaveEdit: () => void
  onDelete: () => void
}) {
  const platformGradient = post.platform === 'instagram' ? 'from-purple-500 via-pink-500 to-orange-400' : 'from-blue-600 to-blue-500'
  const PlatformIcon = post.platform === 'instagram' ? Camera : Globe

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden hover:shadow-sm transition-all group">
      {/* Media */}
      <div className="aspect-square bg-bg-2 overflow-hidden relative">
        {post.mediaUrl ? (
          post.mediaType === 'video' ? (
            <video src={post.mediaUrl} className="w-full h-full object-cover" muted />
          ) : (
            <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-ink-5" />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 flex gap-1">
          {(post.platforms || [post.platform]).map(plat => {
            const grad = plat === 'instagram' ? 'from-purple-500 via-pink-500 to-orange-400' : 'from-blue-600 to-blue-500'
            const Icon = plat === 'instagram' ? Camera : Globe
            return (
              <div key={plat} className={`w-6 h-6 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editCaption}
              onChange={e => onEditCaptionChange(e.target.value)}
              rows={3}
              className="w-full border border-ink-6 rounded-lg px-2.5 py-2 text-xs text-ink resize-none focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <div className="flex gap-2">
              <button onClick={onSaveEdit} disabled={sending} className="bg-brand text-white text-[10px] font-medium rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
                {sending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />} Save
              </button>
              <button onClick={onCancelEdit} className="text-[10px] text-ink-4 hover:text-ink">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-ink-2 line-clamp-2 leading-relaxed">{post.caption || 'No caption'}</p>

            {/* Stats */}
            <div className="flex items-center gap-3 mt-2.5 text-[10px] text-ink-4">
              <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" /> {post.likeCount}</span>
              <span className="flex items-center gap-0.5"><MessageCircle className="w-3 h-3" /> {post.commentCount}</span>
              {post.shareCount != null && post.shareCount > 0 && <span>{post.shareCount} shares</span>}
              <span className="ml-auto">{timeAgo(post.timestamp)}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5 mt-2.5 pt-2.5 border-t border-ink-6">
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-brand font-medium flex items-center gap-0.5 hover:text-brand-dark">
                <ExternalLink className="w-3 h-3" /> View
              </a>
              {post.platform === 'facebook' && (
                <button onClick={onStartEdit} className="text-[10px] text-ink-3 font-medium flex items-center gap-0.5 hover:text-ink">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              )}
              <button onClick={onDelete} className="text-[10px] text-ink-4 font-medium flex items-center gap-0.5 hover:text-red-500 ml-auto transition-colors">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
