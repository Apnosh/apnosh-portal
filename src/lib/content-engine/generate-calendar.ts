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

  const performanceBlock = context.performance
    ? `
PERFORMANCE DATA (last 60 days):
- Reach trend: ${context.performance.reachTrend}
- Best performing days: ${context.performance.bestDays.join(', ')}
- Follower growth: +${context.performance.followerGrowth}
- Top performing day: ${context.performance.topPosts[0]?.date ?? 'N/A'} (${context.performance.topPosts[0]?.reach.toLocaleString() ?? 0} reach)
`
    : 'No performance data available yet.'

  const historyBlock = context.recentContent.length > 0
    ? `RECENT CONTENT (avoid repeating):\n${context.recentContent.slice(0, 15).map((c) => `- ${c.date}: ${c.title} (${c.type})`).join('\n')}`
    : 'No recent content history.'

  const templatesBlock = context.templates.length > 0
    ? `PROVEN TEMPLATES (use where appropriate):\n${context.templates.map((t) => `- ${t.title} (${t.type}) ${t.performance ? '— ' + t.performance : ''}`).join('\n')}`
    : ''

  const eventsBlock = context.upcomingEvents.length > 0
    ? `UPCOMING EVENTS:\n${context.upcomingEvents.map((e) => `- ${e}`).join('\n')}`
    : ''

  const userPrompt = `Create a content calendar for ${month} ${year} with exactly:
- ${d.reels} reels
- ${d.feed_posts} feed posts
- ${d.carousels} carousels
- ${d.stories} stories
for ${context.deliverables.platforms.join(', ')}.

BUSINESS: ${context.businessName}
TYPE: ${context.businessType ?? 'local business'}
LOCATION: ${context.location ?? 'Unknown'}
GOALS: ${context.goals.join(', ') || 'general growth'}
VOICE: ${context.voiceNotes ?? 'friendly, professional'}

${performanceBlock}

${historyBlock}

${templatesBlock}

${eventsBlock}

${strategyNotes ? `STRATEGIST DIRECTION: ${strategyNotes}` : ''}

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
- Schedule posts on best performing days at optimal times based on performance data
- Group content that can be filmed at the same location/setup into the same filming_batch
- Balance: awareness, engagement, conversion, community
- Spread content types across the month — don't cluster all reels in week 1
- ${d.carousels > 0 ? 'Include educational carousels for authority building' : ''}
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

    // Insert items
    const rows = items.map((item, i) => ({
      cycle_id: cycleId,
      client_id: clientId,
      scheduled_date: item.scheduled_date,
      scheduled_time: item.scheduled_time,
      platform: item.platform,
      content_type: item.content_type,
      concept_title: item.concept_title,
      concept_description: item.concept_description,
      strategic_goal: item.strategic_goal,
      filming_batch: item.filming_batch,
      source: item.source ?? 'ai',
      status: 'draft',
      sort_order: i,
    }))

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
