'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import type { ClientContext } from './context'

const anthropic = new Anthropic()

interface BriefFields {
  script?: string
  hook?: string
  shot_list?: Array<{ shot_number: number; description: string; setup_notes: string; angle: string }>
  props?: string[]
  location_notes?: string
  music_direction?: string
  estimated_duration?: string
  caption?: string
  hashtags?: string[]
  editor_notes?: string
  platform_specs?: Record<string, string>
}

export async function generateBriefs(
  cycleId: string,
  clientId: string,
  context: ClientContext,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; error?: string; count?: number }> {
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('content_calendar_items')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('status', 'strategist_approved')
    .order('sort_order')

  if (!items || items.length === 0) {
    return { success: false, error: 'No approved calendar items to generate briefs for' }
  }

  let completed = 0
  const errors: string[] = []

  for (const item of items) {
    try {
      const isVideo = ['reel'].includes(item.content_type)
      const brief = await generateSingleBrief(item, context, isVideo)

      await supabase
        .from('content_calendar_items')
        .update({
          ...brief,
          status: 'draft',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)

      completed++
    } catch (err) {
      errors.push(`${item.concept_title}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Update cycle status
  await supabase
    .from('content_cycles')
    .update({ status: 'briefs_draft', updated_at: new Date().toISOString() })
    .eq('id', cycleId)

  if (errors.length > 0 && completed === 0) {
    return { success: false, error: errors.join('; ') }
  }

  return { success: true, count: completed }
}

async function generateSingleBrief(
  item: Record<string, unknown>,
  context: ClientContext,
  isVideo: boolean
): Promise<BriefFields> {
  const contentType = item.content_type as string
  const platform = item.platform as string
  const aspectRatio = contentType === 'story' || contentType === 'reel' ? '9:16' : contentType === 'feed_post' ? '4:5' : '1:1'

  const videoFields = isVideo
    ? `
- "script": Full script with [HOOK] (first 3 seconds), [BODY], [CTA] sections
- "hook": The opening line/first 3 seconds (separated for easy review)
- "shot_list": Array of { "shot_number", "description", "setup_notes", "angle" }
- "props": Array of items needed on set
- "location_notes": Where to film and setup needed
- "music_direction": Mood, style, tempo
- "estimated_duration": Target length (e.g. "30-60 seconds")
- "editor_notes": Pacing, text overlays, transitions`
    : ''

  // Build rich context for higher quality briefs
  const contextBlocks: string[] = []
  contextBlocks.push(`CONCEPT: ${item.concept_title}`)
  contextBlocks.push(`DESCRIPTION: ${item.concept_description ?? ''}`)
  contextBlocks.push(`TYPE: ${contentType}`)
  contextBlocks.push(`PLATFORM: ${platform}`)
  contextBlocks.push(`GOAL: ${item.strategic_goal ?? 'awareness'}`)
  contextBlocks.push(`BUSINESS: ${context.businessName} (${context.businessType ?? 'local business'})`)
  contextBlocks.push(`VOICE: ${context.voiceNotes ?? 'friendly and professional'}`)

  if (context.targetAudience) {
    const ta = context.targetAudience
    contextBlocks.push(`AUDIENCE: ${ta.lifestyle ?? 'general'} | Age: ${ta.age_range ?? 'all'} | Pain points: ${ta.pain_points?.join(', ') ?? 'none specified'}`)
  }

  if (context.offerings.length > 0) {
    contextBlocks.push(`KEY OFFERINGS (reference where natural): ${context.offerings.slice(0, 5).join(', ')}`)
  }

  if (context.contentPillars.length > 0) {
    contextBlocks.push(`CONTENT PILLAR: This post falls under "${context.contentPillars[0] ?? 'general'}" theme`)
  }

  if (context.ctaPreferences.length > 0) {
    contextBlocks.push(`PREFERRED CTAs: ${context.ctaPreferences.slice(0, 3).map((c) => `"${c}"`).join(' OR ')}`)
  }

  if (context.hashtagSets) {
    const hs = context.hashtagSets
    const allTags: string[] = [...(hs.branded ?? []), ...(hs.community ?? []).slice(0, 5), ...(hs.location ?? []).slice(0, 3)]
    if (allTags.length > 0) {
      contextBlocks.push(`HASHTAG STRATEGY (always include branded, mix in community/location): ${allTags.join(' ')}`)
    }
  }

  if (context.goldenPosts.length > 0) {
    const example = context.goldenPosts[0]
    contextBlocks.push(`CAPTION STYLE EXAMPLE (match this tone): "${example.caption.slice(0, 200)}..."`)
  }

  if (context.keyPeople.length > 0) {
    const onCamera = context.keyPeople.filter((p) => p.comfortable_on_camera)
    if (onCamera.length > 0 && isVideo) {
      contextBlocks.push(`TALENT: Feature ${onCamera[0].name} (${onCamera[0].role})`)
    }
  }

  // Platform-specific guidance
  const platformGuidance = platform === 'tiktok'
    ? 'TikTok: Hook in first 1-2 seconds. Conversational, raw, authentic. Trending audio reference if possible. Shorter captions.'
    : platform === 'instagram'
      ? 'Instagram: Hook in first 3 seconds for Reels. Polished but authentic. Longer captions work. Use line breaks for readability.'
      : platform === 'linkedin'
        ? 'LinkedIn: Professional but human. Lead with an insight or surprising stat. No hashtags in body, add at end.'
        : ''

  if (platformGuidance) contextBlocks.push(`PLATFORM NOTES: ${platformGuidance}`)

  const prompt = `Generate a production brief for this content piece:

${contextBlocks.join('\n')}

Return a JSON object with:
- "caption": Full caption with line breaks, emoji per brand voice (max 2200 chars). Use a preferred CTA. Include branded hashtags.
- "hashtags": Array of 15-20 relevant hashtags (always include branded ones from the strategy)
- "platform_specs": { "aspect_ratio": "${aspectRatio}" }
${videoFields}

${isVideo ? 'Make the script conversational and authentic. The hook MUST stop the scroll — it\'s the single most important line. Reference specific offerings/products where natural. Feature the talent by name.' : 'Focus on a compelling caption that drives the strategic goal. Use the brand voice consistently. End with a clear CTA from the preferred list.'}

Return ONLY valid JSON. No markdown.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.5,
    system: 'You write production-ready content briefs for social media. Return ONLY valid JSON.',
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('No response from AI')

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as BriefFields
}

export async function refineBriefField(
  itemId: string,
  field: string,
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

  const currentValue = (item as Record<string, unknown>)[field]

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.5,
      system: 'You refine content briefs. Return ONLY the refined value — no JSON wrapping, no explanation.',
      messages: [{
        role: 'user',
        content: `Refine this ${field} for "${item.concept_title}" (${item.content_type}, ${item.platform}).

Current ${field}:
${typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue)}

Direction: "${direction}"

Business voice: ${context.voiceNotes ?? 'friendly, professional'}

Return ONLY the refined ${field}. No explanation.`,
      }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text
    if (!text) return { success: false, error: 'No response' }

    // For array fields, try to parse as JSON
    let value: unknown = text.trim()
    if (field === 'hashtags' || field === 'shot_list' || field === 'props') {
      try { value = JSON.parse(text.trim()) } catch { /* keep as string */ }
    }

    await supabase
      .from('content_calendar_items')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', itemId)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
