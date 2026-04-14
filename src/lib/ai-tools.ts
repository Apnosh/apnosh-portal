'use server'

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// Caption Generator
export async function generateCaptions(opts: {
  platform: string
  postType: string
  topic: string
  tone: string
  hashtags: boolean
  cta: boolean
  businessContext?: string
}): Promise<string[]> {
  const { platform, postType, topic, tone, hashtags, cta, businessContext } = opts

  const prompt = `Generate 3 unique social media captions for ${platform}.

Post type: ${postType}
Topic: ${topic || 'general brand content'}
Tone: ${tone}
${hashtags ? 'Include 5 relevant hashtags at the end.' : 'No hashtags.'}
${cta ? 'Include a call-to-action.' : 'No call-to-action needed.'}
${businessContext ? `Business context: ${businessContext}` : ''}

Return ONLY a JSON array of 3 caption strings. No explanation, no markdown. Just the raw JSON array.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.8,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  try {
    return JSON.parse(text)
  } catch {
    return text.split('\n\n').filter(Boolean).slice(0, 3)
  }
}

// Content Idea Generator
export async function generateIdeas(opts: {
  industry: string
  goals: string[]
  platforms: string[]
  businessContext?: string
}): Promise<Array<{ title: string; description: string; platform: string; bestDay: string; contentType: string }>> {
  const { industry, goals, platforms, businessContext } = opts

  const prompt = `Generate 10 content ideas for a ${industry || 'local'} business.

Goals: ${goals.length ? goals.join(', ') : 'grow audience'}
Platforms: ${platforms.length ? platforms.join(', ') : 'Instagram, TikTok, Facebook'}
${businessContext ? `Business context: ${businessContext}` : ''}

Return a JSON array of objects with these fields:
- title: catchy idea name (5-8 words)
- description: one sentence explaining the idea
- platform: which platform it's best for
- bestDay: which day of the week
- contentType: Feed posts, Stories, Reels/TikTok, Carousels, or Email

Return ONLY the JSON array. No explanation, no markdown.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    temperature: 0.8,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}

// Review Response Generator
export async function generateReviewResponse(opts: {
  rating: number
  reviewText: string
  tone: string
  businessContext?: string
}): Promise<{ responses: string[]; tips: string[] }> {
  const { rating, reviewText, tone, businessContext } = opts
  const sentiment = rating >= 4 ? 'positive' : rating >= 3 ? 'mixed' : 'negative'

  const prompt = `Generate 2 professional responses to a ${sentiment} customer review (${rating}/5 stars).

Review: "${reviewText || `The customer left a ${rating}-star rating.`}"
Tone: ${tone}
${businessContext ? `Business context: ${businessContext}` : ''}

Also provide 4 brief tips for responding to ${sentiment} reviews.

Return ONLY a JSON object with this shape:
{ "responses": ["response1", "response2"], "tips": ["tip1", "tip2", "tip3", "tip4"] }

No markdown, no explanation. Just the JSON object.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.6,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  try {
    return JSON.parse(text)
  } catch {
    return { responses: [text], tips: [] }
  }
}

// Hashtag Research
export async function generateHashtags(opts: {
  topic: string
  platform: string
  businessContext?: string
}): Promise<{ high: Array<{ tag: string; posts: string; relevance: number }>; medium: Array<{ tag: string; posts: string; relevance: number }>; niche: Array<{ tag: string; posts: string; relevance: number }> }> {
  const { topic, platform, businessContext } = opts

  const prompt = `Research and suggest hashtags for "${topic || 'marketing'}" on ${platform || 'Instagram'}.
${businessContext ? `Business context: ${businessContext}` : ''}

Group them into 3 tiers:
- high: 5 popular hashtags (100K+ posts, broader reach)
- medium: 5 mid-range hashtags (10K-100K posts, targeted)
- niche: 5 niche hashtags (under 10K posts, highly targeted)

For each hashtag, estimate:
- tag: the hashtag with #
- posts: estimated post count (e.g. "4.2M", "340K", "12K")
- relevance: relevance score 0-100

Return ONLY a JSON object with shape:
{ "high": [...], "medium": [...], "niche": [...] }

No markdown, no explanation. Just the JSON object.`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.5,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  try {
    return JSON.parse(text)
  } catch {
    return { high: [], medium: [], niche: [] }
  }
}
