'use client'

/**
 * WHAT THE POST WILL ACTUALLY LOOK LIKE, WHERE IT LANDS.
 * =====================================================
 * The first preview showed one card and changed its colour per platform. That
 * was the wrong thing to vary. A caption that reads well on LinkedIn, where the
 * text comes FIRST and runs to 140 characters before a "see more", disappears
 * under a square photo on Instagram and is a single overlaid line on TikTok. The
 * owner cannot see that from a colour.
 *
 * So each platform gets its own frame: its crop, its order, its fold, its action
 * row. Close enough to recognise at a glance, not a pixel copy -- the job is to
 * answer "will this read?" before it goes out, not to be Instagram.
 *
 * THE CROP IS THE POINT. A landscape photo is a square on Instagram, a tall
 * 9:16 on TikTok and a wide 16:9 on YouTube, and an owner who has only ever seen
 * their photo in the picker has no idea their dish is about to lose its edges.
 */

import React from 'react'
import { Heart, MessageCircle, Send, Bookmark, ThumbsUp, Repeat2, Share2, MoreHorizontal, Music, Globe, Play, Plus, Image as ImageIcon } from 'lucide-react'
import { C, DISPLAY } from './tokens'
import { tint } from './hues'

export interface PreviewPost {
  /** the account name as it will appear */
  name: string
  /** the caption that platform will actually get */
  caption: string
  media: { preview: string; isVideo: boolean } | null
  tagged: string[]
  firstComment: string
  location: string | null
  /** "Monday 4 PM", "Going out now" */
  whenWords: string
}

/* Roughly where each feed stops and puts the rest behind a "more". Approximate
   on purpose: the exact count moves whenever a platform reflows its feed, and
   the useful thing is not the number, it is seeing which half a scrolling
   customer reads. */
export const FOLD: Record<string, number> = { instagram: 125, tiktok: 100, linkedin: 140, facebook: 250, youtube: 157 }

/* Only the platforms that ACTUALLY force a crop get a ratio, and an owner should
   find out here rather than afterwards. Facebook and LinkedIn are deliberately
   absent: their feeds keep a photo's own shape, so drawing them at 1.91 would
   warn about a crop that never happens, which is a worse preview than none. */
const RATIO: Record<string, number> = { instagram: 1, tiktok: 9 / 16, youtube: 16 / 9 }

const PLACEHOLDER = `linear-gradient(160deg, ${tint('mint', .1)}, ${tint('brand', .1)})`

function Media({ post, platform, dark }: { post: PreviewPost; platform: string; dark?: boolean }) {
  const ratio = RATIO[platform]
  const common: React.CSSProperties = ratio
    ? { display: 'block', width: '100%', aspectRatio: String(ratio), objectFit: 'cover', background: dark ? '#000' : '#0d0d0d' }
    /* No forced ratio: the photo keeps its own shape. The ground is the card's
       own white, not black -- a landscape photo sitting in black bars looked
       like something had gone wrong with it, when nothing had. */
    : { display: 'block', width: '100%', height: 'auto', maxHeight: 340, objectFit: 'contain', background: '#fff' }
  if (!post.media) {
    return (
      <div style={{ ...common, ...(ratio ? {} : { height: 130 }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: dark ? '#16161a' : PLACEHOLDER, color: dark ? '#7b7b85' : C.faint, fontSize: 12.5 }}>
        <ImageIcon size={15} /> No photo yet
      </div>
    )
  }
  return post.media.isVideo
    ? <video src={post.media.preview} muted playsInline style={common} />
    : <img src={post.media.preview} alt="" style={common} />
}

/** Caption, cut where that feed cuts it, with the remainder greyed rather than hidden. */
function Caption({ text, fold, more, dark, size = 13.5 }: { text: string; fold: number; more: string; dark?: boolean; size?: number }) {
  const t = text.trim()
  const ink = dark ? '#fff' : C.ink
  const off = dark ? 'rgba(255,255,255,.5)' : C.faint
  if (!t) return <span style={{ color: off, fontSize: size }}>Your caption will show here.</span>
  const cut = fold > 0 && t.length > fold
  return (
    <span style={{ fontSize: size, lineHeight: 1.45, color: ink, whiteSpace: 'pre-wrap' }}>
      {cut ? t.slice(0, fold) : t}
      {cut && (
        <>
          <span style={{ color: off, fontWeight: 600 }}>… {more}</span>
          <span style={{ display: 'block', marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${dark ? 'rgba(255,255,255,.18)' : C.line}`, color: off, fontSize: 12.5, lineHeight: 1.4 }}>
            {t.slice(fold)}
          </span>
        </>
      )}
    </span>
  )
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const stamp: React.CSSProperties = { fontSize: 11.5, color: C.mute }

/* ── INSTAGRAM ──────────────────────────────────────────────────────────────
   Square. Photo first, then the actions, then the caption behind the username,
   which is why a caption that opens with the point survives and one that warms
   up for a sentence does not. */
function Instagram({ post }: { post: PreviewPost }) {
  return (
    <div style={{ background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px' }}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', padding: 2, background: 'linear-gradient(135deg,#f9a13d 0%,#e1306c 55%,#7b3fbf 100%)', flexShrink: 0 }}>
          <span style={{ display: 'flex', width: '100%', height: '100%', borderRadius: '50%', background: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, color: C.ink }}>
            {post.name.trim().charAt(0).toUpperCase()}
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{post.name}</span>
          {post.location && <span style={{ display: 'block', fontSize: 11, color: C.ink, lineHeight: 1.2 }}>{post.location}</span>}
        </span>
        <MoreHorizontal size={16} color={C.ink} />
      </div>
      <Media post={post} platform="instagram" />
      <div style={{ padding: '9px 12px 12px' }}>
        <div style={{ ...row, marginBottom: 8 }}>
          <Heart size={21} color={C.ink} strokeWidth={1.7} />
          <MessageCircle size={21} color={C.ink} strokeWidth={1.7} />
          <Send size={21} color={C.ink} strokeWidth={1.7} />
          <Bookmark size={21} color={C.ink} strokeWidth={1.7} style={{ marginLeft: 'auto' }} />
        </div>
        <div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginRight: 6 }}>{post.name}</span>
          <Caption text={post.caption} fold={FOLD.instagram} more="more" />
        </div>
        {post.tagged.length > 0 && (
          <div style={{ fontSize: 12.5, color: C.ink, marginTop: 4 }}>with {post.tagged.map((h) => '@' + h).join(' ')}</div>
        )}
        {post.firstComment.trim() && (
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>
            <span style={{ fontWeight: 600, color: C.ink }}>{post.name}</span> {post.firstComment.trim()}
          </div>
        )}
        <div style={{ ...stamp, marginTop: 6 }}>{post.whenWords}</div>
      </div>
    </div>
  )
}

/* ── TIKTOK ─────────────────────────────────────────────────────────────────
   The caption sits ON the video with the buttons beside it, so only a line or
   two is ever read and a wide photo loses both its sides. */
function TikTok({ post }: { post: PreviewPost }) {
  const btn: React.CSSProperties = { width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  return (
    <div style={{ position: 'relative', background: '#000' }}>
      <Media post={post} platform="tiktok" dark />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,.75) 0%, rgba(0,0,0,0) 45%)' }} />
      <div style={{ position: 'absolute', right: 10, bottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: C.ink, position: 'relative' }}>
          {post.name.trim().charAt(0).toUpperCase()}
          <span style={{ position: 'absolute', bottom: -5, width: 15, height: 15, borderRadius: '50%', background: '#fe2c55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={10} color="#fff" strokeWidth={3} />
          </span>
        </span>
        <span style={btn}><Heart size={17} color="#fff" fill="#fff" /></span>
        <span style={btn}><MessageCircle size={17} color="#fff" fill="#fff" /></span>
        <span style={btn}><Bookmark size={17} color="#fff" fill="#fff" /></span>
        <span style={btn}><Share2 size={17} color="#fff" /></span>
      </div>
      <div style={{ position: 'absolute', left: 12, right: 62, bottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 4 }}>@{post.name}</div>
        <Caption text={post.caption} fold={FOLD.tiktok} more="more" dark size={12.5} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 11.5, color: 'rgba(255,255,255,.9)' }}>
          <Music size={11} color="#fff" />original sound - {post.name}
        </div>
      </div>
    </div>
  )
}

/* ── LINKEDIN ───────────────────────────────────────────────────────────────
   Text FIRST, then the photo. The only feed here where a paragraph is read
   before an image is seen, which is why the same caption cannot serve both it
   and Instagram. */
function LinkedIn({ post }: { post: PreviewPost }) {
  const act = (icon: React.ReactNode, label: string) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: C.mute }}>{icon}{label}</span>
  )
  return (
    <div style={{ background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 12px 8px' }}>
        <span style={{ width: 40, height: 40, borderRadius: 6, background: '#0a66c2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: '#fff' }}>
          {post.name.trim().charAt(0).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{post.name}</span>
          {post.location && <span style={{ display: 'block', fontSize: 11.5, color: C.mute, lineHeight: 1.3 }}>{post.location}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.mute, marginTop: 1 }}>
            {post.whenWords} · <Globe size={11} />
          </span>
        </span>
        <MoreHorizontal size={16} color={C.mute} />
      </div>
      <div style={{ padding: '0 12px 10px' }}>
        <Caption text={post.caption} fold={FOLD.linkedin} more="see more" />
      </div>
      <Media post={post} platform="linkedin" />
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '9px 8px', borderTop: `1px solid ${C.line}` }}>
        {act(<ThumbsUp size={15} strokeWidth={1.9} />, 'Like')}
        {act(<MessageCircle size={15} strokeWidth={1.9} />, 'Comment')}
        {act(<Repeat2 size={15} strokeWidth={1.9} />, 'Repost')}
        {act(<Send size={15} strokeWidth={1.9} />, 'Send')}
      </div>
    </div>
  )
}

/* ── FACEBOOK ───────────────────────────────────────────────────────────────
   Text above the photo, and the most forgiving fold of the five. */
function Facebook({ post }: { post: PreviewPost }) {
  const act = (icon: React.ReactNode, label: string) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: C.mute }}>{icon}{label}</span>
  )
  return (
    <div style={{ background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px 8px' }}>
        <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#1877f2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: '#fff' }}>
          {post.name.trim().charAt(0).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{post.name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: C.mute }}>{post.whenWords} · <Globe size={11} /></span>
        </span>
        <MoreHorizontal size={16} color={C.mute} />
      </div>
      <div style={{ padding: '0 12px 10px' }}>
        <Caption text={post.caption} fold={FOLD.facebook} more="See more" />
      </div>
      <Media post={post} platform="facebook" />
      {post.firstComment.trim() && (
        <div style={{ fontSize: 12.5, color: C.mute, padding: '9px 12px 0' }}>
          <span style={{ fontWeight: 600, color: C.ink }}>{post.name}</span> {post.firstComment.trim()}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '9px 8px', margin: '9px 12px 0', borderTop: `1px solid ${C.line}` }}>
        {act(<ThumbsUp size={15} strokeWidth={1.9} />, 'Like')}
        {act(<MessageCircle size={15} strokeWidth={1.9} />, 'Comment')}
        {act(<Share2 size={15} strokeWidth={1.9} />, 'Share')}
      </div>
      <div style={{ height: 10 }} />
    </div>
  )
}

/* ── YOUTUBE ────────────────────────────────────────────────────────────────
   The caption is a TITLE on one or two lines under a 16:9 frame. Everything
   past that lives in a description nobody opens. */
function YouTube({ post }: { post: PreviewPost }) {
  const title = post.caption.trim() || 'Your caption becomes the title'
  return (
    <div style={{ background: '#fff' }}>
      <div style={{ position: 'relative' }}>
        <Media post={post} platform="youtube" dark />
        <span style={{ position: 'absolute', right: 8, bottom: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,.8)', color: '#fff', fontSize: 11, fontWeight: 600 }}>0:30</span>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 40, height: 28, borderRadius: 7, background: 'rgba(255,0,51,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={14} color="#fff" fill="#fff" />
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '11px 12px 13px' }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#ff0033', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, color: '#fff' }}>
          {post.name.trim().charAt(0).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {/* YouTube clamps a title to two lines and hides the rest in a
              description nobody opens, so the clamp IS the fold here. */}
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
            {title}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: C.mute, marginTop: 3 }}>{post.name} · No views · {post.whenWords}</span>
        </span>
        <MoreHorizontal size={15} color={C.mute} />
      </div>
    </div>
  )
}

/* ── ALL AT ONCE ────────────────────────────────────────────────────────────
   No platform picked: the post as one thing, which is how it is written. */
function Together({ post, marks }: { post: PreviewPost; marks: React.ReactNode }) {
  return (
    <div style={{ background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4abd98,#2e9a78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>
          {post.name.trim().charAt(0).toUpperCase()}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{post.name}</span>
          {post.location && <span style={{ display: 'block', fontSize: 11.5, color: C.greenDk, marginTop: 1 }}>{post.location}</span>}
        </span>
        {marks}
      </div>
      <Media post={post} platform="facebook" />
      <div style={{ padding: '12px 14px 14px' }}>
        <Caption text={post.caption} fold={0} more="" size={14} />
        {post.tagged.length > 0 && (
          <div style={{ fontSize: 12.5, color: C.greenDk, marginTop: 6 }}>with {post.tagged.map((h) => '@' + h).join(' ')}</div>
        )}
        {post.firstComment.trim() && (
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
            <b style={{ fontWeight: 600, color: C.ink }}>First comment</b> {post.firstComment.trim()}
          </div>
        )}
        <div style={{ ...stamp, marginTop: 10 }}>{post.whenWords}</div>
      </div>
    </div>
  )
}

export default function PostPreview({ platform, post, marks }: { platform: string | null; post: PreviewPost; marks?: React.ReactNode }) {
  if (platform === 'instagram') return <Instagram post={post} />
  if (platform === 'tiktok') return <TikTok post={post} />
  if (platform === 'linkedin') return <LinkedIn post={post} />
  if (platform === 'facebook') return <Facebook post={post} />
  if (platform === 'youtube') return <YouTube post={post} />
  return <Together post={post} marks={marks} />
}
