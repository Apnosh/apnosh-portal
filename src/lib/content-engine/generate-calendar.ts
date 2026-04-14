'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { ClientContext } from './context'

const anthropic = new Anthropic()

interface CalendarItem {
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_type: string
  concept_title: string
  concept_description: string
  strategic_goal: string
  filming_batch: string
  source: string
}

export async function generateCalendar(
  cycleId: string,
  clientId: string,
  context: ClientContext,
  strategyNotes: string
): Promise<{ success: boolean; error?: string; count?: number }> {
  const supabase = await createClient()

  const now = new Date()
  const month = now.toLocaleDateString('en-US', { month: 'long' })
  const year = now.getFullYear()

  const d = context.deliverables
  const total = d.reels + d.feed_posts + d.stories + d.carousels

  // Build rich context blocks
  const blocks: string[] = []

  blocks.push(`BUSINESS: ${context.businessName}
TYPE: ${context.businessType ?? 'local business'}
LOCATION: ${context.location ?? 'Unknown'}
WEBSITE: ${context.website ?? 'N/A'}
SOCIAL HANDLES: ${Object.entries(context.socialHandles).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', ') || 'None set'}`)

  blocks.push(`GOALS: ${context.goals.join(', ') || 'general growth'}`)
  blocks.push(`VOICE: ${context.voiceNotes ?? 'friendly, professional'}`)

  if (context.targetAudience) {
    const ta = context.targetAudience
    blocks.push(`TARGET AUDIENCE:
- Age: ${ta.age_range ?? 'All ages'}
- Lifestyle: ${ta.lifestyle ?? 'General'}
- Pain points: ${ta.pain_points?.join(', ') ?? 'None specified'}`)
  }

  if (context.offerings.length > 0) {
    blocks.push(`KEY OFFERINGS TO HIGHLIGHT:\n${context.offerings.map((o) => `- ${o}`).join('\n')}`)
  }

  if (context.contentPillars.length > 0) {
    blocks.push(`CONTENT PILLARS (distribute content across these themes):\n${context.contentPillars.map((p) => `- ${p}`).join('\n')}`)
  }

  if (context.contentAvoid.length > 0) {
    blocks.push(`AVOID (never include in content):\n${context.contentAvoid.map((a) => `- ${a}`).join('\n')}`)
  }

  if (context.keyPeople.length > 0) {
    blocks.push(`KEY PEOPLE TO FEATURE:\n${context.keyPeople.map((p) => `- ${p.name} (${p.role})${p.comfortable_on_camera ? ' — comfortable on camera' : ''}${p.notes ? ': ' + p.notes : ''}`).join('\n')}`)
  }

  if (context.filmingLocations.length > 0) {
    blocks.push(`FILMING LOCATIONS:\n${context.filmingLocations.map((l) => `- ${l.name}${l.good_for ? ' — good for: ' + l.good_for.join(', ') : ''}${l.notes ? ' (' + l.notes + ')' : ''}`).join('\n')}`)
  }

  if (context.competitors.length > 0) {
    blocks.push(`COMPETITORS (differentiate from):\n${context.competitors.map((c) => `- ${c.name}${c.notes ? ': ' + c.notes : ''}`).join('\n')}`)
  }

  if (context.seasonalNotes) {
    blocks.push(`SEASONAL CONTEXT: ${context.seasonalNotes}`)
  }

  if (context.ctaPreferences.length > 0) {
    blocks.push(`PREFERRED CTAs (use these in captions):\n${context.ctaPreferences.map((c) => `- "${c}"`).join('\n')}`)
  }

  if (context.hashtagSets) {
    const hs = context.hashtagSets
    const parts: string[] = []
    if (hs.branded?.length) parts.push(`Branded: ${hs.branded.join(' ')}`)
    if (hs.community?.length) parts.push(`Community: ${hs.community.join(' ')}`)
    if (hs.location?.length) parts.push(`Location: ${hs.location.join(' ')}`)
    if (parts.length) blocks.push(`HASHTAG STRATEGY:\n${parts.join('\n')}`)
  }

  // Content defaults
  const defaults = context.contentDefaults as Record<string, unknown> ?? {}
  const defaultTimes = defaults.default_times as Record<string, string> | undefined
  const defaultPlatforms = defaults.default_platforms as string[] | undefined
  const defaultGoal = defaults.default_goal as string | undefined

  if (defaultTimes) {
    blocks.push(`DEFAULT POSTING TIMES (use these unless performance data suggests better times):
${Object.entries(defaultTimes).map(([day, time]) => `- ${day}: ${time}`).join('\n')}`)
  }

  if (defaultGoal) {
    blocks.push(`DEFAULT STRATEGIC GOAL: ${defaultGoal} (vary across calendar for balance, but weight toward this)`)
  }

  if (context.performance) {
    blocks.push(`PERFORMANCE DATA (last 60 days):
- Reach trend: ${context.performance.reachTrend}
- Best performing days: ${context.performance.bestDays.join(', ')}
- Follower growth: +${context.performance.followerGrowth}
- Top performing day: ${context.performance.topPosts[0]?.date ?? 'N/A'} (${context.performance.topPosts[0]?.reach.toLocaleString() ?? 0} reach)`)
  }

  if (context.goldenPosts.length > 0) {
    blocks.push(`TOP-PERFORMING CAPTIONS (match this style and tone):\n${context.goldenPosts.slice(0, 5).map((p) => `- [${p.platform ?? 'post'}] "${p.caption.slice(0, 150)}..."${p.performance_notes ? ' — ' + p.performance_notes : ''}`).join('\n')}`)
  }

  if (context.recentContent.length > 0) {
    blocks.push(`RECENT CONTENT (avoid repeating these themes):\n${context.recentContent.slice(0, 15).map((c) => `- ${c.date}: ${c.title} (${c.type})`).join('\n')}`)
  }

  if (context.templates.length > 0) {
    blocks.push(`PROVEN TEMPLATES:\n${context.templates.map((t) => `- ${t.title} (${t.type}) ${t.performance ? '— ' + t.performance : ''}`).join('\n')}`)
  }

  if (context.upcomingEvents.length > 0) {
    blocks.push(`UPCOMING EVENTS:\n${context.upcomingEvents.map((e) => `- ${e}`).join('\n')}`)
  }

  if (strategyNotes) {
    blocks.push(`STRATEGIST DIRECTION: ${strategyNotes}`)
  }

  const userPrompt = `Create a content calendar for ${month} ${year} with exactly:
- ${d.reels} reels
- ${d.feed_posts} feed posts
- ${d.carousels} carousels
- ${d.stories} stories
for ${context.deliverables.platforms.join(', ')}.

${blocks.join('\n\n')}

For each item, return a JSON object:
{
  "scheduled_date": "YYYY-MM-DD",
  "scheduled_time": "HH:MM",
  "platform": "instagram",
  "content_type": "reel",
  "concept_title": "short descriptive title",
  "concept_description": "2-3 sentence description of the concept and why it matters strategically",
  "strategic_goal": "awareness|engagement|conversion|community",
  "filming_batch": "A|B|C",
  "source": "ai"
}

Rules:
- Schedule posts on best performing days at optimal times
- Group content filmable at the same location into the same filming_batch (use filming locations above)
- Distribute across content pillars — balance all themes
- Feature key people where natural (especially for reels/video)
- Reference specific offerings/products in concepts
- Write concept descriptions in the brand voice
- Never include topics from the AVOID list
- Spread content types across the month evenly
- ${d.carousels > 0 ? 'Use carousels for educational/tip content aligned with content pillars' : ''}
- Return EXACTLY ${total} items as a JSON array

Return ONLY a valid JSON array. No markdown, no explanation.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.7,
      system: `You are a world-class social media strategist for a local business marketing agency.
You create content calendars that are data-informed, on-brand, and production-efficient.
Every piece of content has a clear strategic purpose.
You never repeat concepts from recent months.
You group content for efficient batch filming.
You write in the client's brand voice.
Respond ONLY with valid JSON — no preamble, no markdown, no explanation.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text
    if (!text) return { success: false, error: 'No response from AI' }

    // Parse JSON — handle potential markdown wrapping
    let items: CalendarItem[]
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      items = JSON.parse(cleaned)
    } catch {
      return { success: false, error: 'AI returned invalid JSON. Try again.' }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'AI returned empty calendar. Try again.' }
    }

    // Sanitize AI output to valid enum values
    const VALID_TYPES = new Set(['reel', 'feed_post', 'carousel', 'story', 'static_post', 'video', 'image', 'short_form_video'])
    const VALID_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'linkedin'])
    const VALID_GOALS = new Set(['awareness', 'engagement', 'conversion', 'community'])

    const normalizeType = (t: string): string => {
      const lower = t.toLowerCase().replace(/\s+/g, '_')
      if (VALID_TYPES.has(lower)) return lower
      if (lower.includes('reel') || lower.includes('video') || lower.includes('short')) return 'reel'
      if (lower.includes('carousel') || lower.includes('slide')) return 'carousel'
      if (lower.includes('story') || lower.includes('stories')) return 'story'
      return 'feed_post'
    }

    const normalizePlatform = (p: string): string => {
      const lower = p.toLowerCase()
      if (VALID_PLATFORMS.has(lower)) return lower
      return 'instagram'
    }

    const normalizeGoal = (g: string): string => {
      const lower = g.toLowerCase()
      if (VALID_GOALS.has(lower)) return lower
      return 'awareness'
    }

    // Apply auto_cross_post: if enabled, add all default platforms except the primary
    const autoCrossPost = defaults.auto_cross_post as boolean ?? false
    const crossPostPlatforms = autoCrossPost && defaultPlatforms
      ? defaultPlatforms.filter((p) => p !== 'all')
      : []

    // Insert items
    const rows = items.map((item, i) => {
      const primaryPlatform = normalizePlatform(item.platform)
      const additional = autoCrossPost
        ? crossPostPlatforms.filter((p) => p !== primaryPlatform)
        : []

      return {
        cycle_id: cycleId,
        client_id: clientId,
        scheduled_date: item.scheduled_date,
        scheduled_time: item.scheduled_time,
        platform: primaryPlatform,
        additional_platforms: additional.length > 0 ? additional : [],
        content_type: normalizeType(item.content_type),
        concept_title: item.concept_title,
        concept_description: item.concept_description,
        strategic_goal: normalizeGoal(item.strategic_goal),
        filming_batch: item.filming_batch,
        source: item.source ?? 'ai',
        status: 'draft',
        sort_order: i,
      }
    })

    const { error } = await supabase.from('content_calendar_items').insert(rows)
    if (error) return { success: false, error: error.message }

    // Update cycle status
    await supabase
      .from('content_cycles')
      .update({ status: 'calendar_draft', updated_at: new Date().toISOString() })
      .eq('id', cycleId)

    return { success: true, count: rows.length }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function refineCalendarItem(
  itemId: string,
  direction: string,
  context: ClientContext
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('content_calendar_items')
    .select('*')
    .eq('id', itemId)
    .single()

  if (!item) return { success: false, error: 'Item not found' }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.7,
      system: 'You refine social media content concepts. Return ONLY valid JSON with the same structure. No markdown.',
      messages: [{
        role: 'user',
        content: `Current concept:
Title: ${item.concept_title}
Description: ${item.concept_description}
Type: ${item.content_type}, Platform: ${item.platform}
Business: ${context.businessName} (${context.businessType})
Voice: ${context.voiceNotes ?? 'friendly, professional'}

Strategist direction: "${direction}"

Return a JSON object with updated "concept_title" and "concept_description" fields only.`,
      }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text
    if (!text) return { success: false, error: 'No response' }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const updates = JSON.parse(cleaned)

    await supabase
      .from('content_calendar_items')
      .update({
        concept_title: updates.concept_title ?? item.concept_title,
        concept_description: updates.concept_description ?? item.concept_description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
