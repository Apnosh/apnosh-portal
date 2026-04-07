import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a senior brand strategist working for Apnosh, a marketing agency. You are generating professional brand guidelines from raw business data.

You must respond with valid JSON only. No markdown, no backticks. Use this exact structure:

{
  "brand_overview": {
    "mission": "A concise mission statement (1-2 sentences)",
    "story": "A short brand story paragraph describing who they are and why they exist",
    "what_we_do": "A clear description of what the business does",
    "tagline": "A memorable tagline"
  },
  "visual_identity": {
    "primary_color": "#hex",
    "secondary_color": "#hex",
    "accent_colors": ["#hex"],
    "fonts": { "primary": "font name", "secondary": "font name", "body": "font name" },
    "logo_usage_notes": "Guidelines for logo usage",
    "imagery_style": "Description of the imagery style that fits this brand"
  },
  "voice_and_tone": {
    "voice_words": [
      { "word": "adjective", "description": "what this means for the brand", "examples": ["example sentence 1", "example sentence 2"] }
    ],
    "tone_description": "Overall tone description",
    "sample_phrases": ["on-brand phrase 1", "on-brand phrase 2", "on-brand phrase 3"],
    "sample_ctas": ["CTA 1", "CTA 2", "CTA 3"],
    "do_nots": ["thing to avoid 1", "thing to avoid 2"]
  },
  "audience_profile": {
    "persona": "Description of the ideal customer persona",
    "age_range": "e.g. 25-45",
    "location": "geographic location",
    "pain_points": ["pain point 1", "pain point 2"],
    "motivations": ["motivation 1", "motivation 2"],
    "where_they_hang_out": "Where this audience spends time online and offline"
  },
  "competitive_positioning": {
    "positioning_statement": "A clear positioning statement",
    "differentiators": ["differentiator 1", "differentiator 2"],
    "competitor_awareness": "Brief competitive landscape summary",
    "unique_value": "The unique value proposition"
  },
  "content_guidelines": {
    "topics": ["topic 1", "topic 2"],
    "avoid_topics": ["avoid 1", "avoid 2"],
    "posting_frequency": "Recommended posting schedule",
    "best_platforms": ["platform 1", "platform 2"],
    "content_pillars": ["pillar 1", "pillar 2", "pillar 3"]
  },
  "ai_generated_sections": ["brand_overview", "visual_identity", "voice_and_tone", "audience_profile", "competitive_positioning", "content_guidelines"]
}

Rules:
- Generate 3 voice words with descriptions and 2 example sentences each
- If brand voice words are provided, expand on them with descriptions and examples
- If brand colors are provided, use them; otherwise suggest colors appropriate for the industry
- Make the positioning statement specific, not generic
- Content pillars should be 3-5 specific themes
- All text should feel premium and professional
- Keep the tone confident but not arrogant
- Write at a 5th grade reading level. Simple, clear words.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      businessName, industry, description, differentiator,
      brandVoiceWords, brandTone, brandDoNots, brandColors,
      targetAudience, targetAgeRange, targetLocation, targetProblem,
      competitors, currentPlatforms, marketingGoals, contentTopics,
    } = body

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const userMessage = `Generate professional brand guidelines for this business:

BUSINESS NAME: ${businessName || 'Unknown'}
INDUSTRY: ${industry || 'Unknown'}
DESCRIPTION: ${description || 'Not provided'}
DIFFERENTIATOR: ${differentiator || 'Not provided'}

BRAND VOICE WORDS: ${Array.isArray(brandVoiceWords) ? brandVoiceWords.join(', ') : 'Not provided'}
BRAND TONE: ${brandTone || 'Not provided'}
BRAND DO NOTS: ${brandDoNots || 'Not provided'}
BRAND COLORS: ${brandColors ? JSON.stringify(brandColors) : 'Not provided'}

TARGET AUDIENCE: ${targetAudience || 'Not provided'}
TARGET AGE RANGE: ${targetAgeRange || 'Not provided'}
TARGET LOCATION: ${targetLocation || 'Not provided'}
TARGET PROBLEM: ${targetProblem || 'Not provided'}

COMPETITORS: ${Array.isArray(competitors) ? competitors.map((c: { name: string }) => c.name).join(', ') : 'Not provided'}
CURRENT PLATFORMS: ${Array.isArray(currentPlatforms) ? currentPlatforms.join(', ') : 'Not provided'}
MARKETING GOALS: ${Array.isArray(marketingGoals) ? marketingGoals.join(', ') : 'Not provided'}
CONTENT TOPICS: ${contentTopics || 'Not provided'}

Generate the brand guidelines now.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', response.status, errorText)
      return NextResponse.json({ error: 'AI generation failed' }, { status: response.status })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()

    try {
      const guidelines = JSON.parse(clean)
      return NextResponse.json({ guidelines })
    } catch {
      console.error('Failed to parse AI response:', clean.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse AI response', raw: clean }, { status: 500 })
    }
  } catch (e) {
    console.error('enrich-guidelines error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
