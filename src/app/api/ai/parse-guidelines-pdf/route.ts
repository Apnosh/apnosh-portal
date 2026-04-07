import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a brand strategist extracting structured data from uploaded brand guidelines documents. Parse the text carefully and extract all relevant brand information.

You must respond with valid JSON only. No markdown, no backticks. Use this structure (omit fields you cannot find):

{
  "brand_overview": {
    "mission": "extracted mission statement",
    "story": "extracted brand story",
    "what_we_do": "extracted description",
    "tagline": "extracted tagline"
  },
  "visual_identity": {
    "primary_color": "#hex if found",
    "secondary_color": "#hex if found",
    "accent_colors": ["#hex"],
    "fonts": { "primary": "font name", "secondary": "font name", "body": "font name" },
    "logo_usage_notes": "extracted logo rules",
    "imagery_style": "extracted imagery guidelines"
  },
  "voice_and_tone": {
    "voice_words": [
      { "word": "adjective", "description": "meaning", "examples": ["example"] }
    ],
    "tone_description": "extracted tone description",
    "sample_phrases": ["phrase"],
    "sample_ctas": ["cta"],
    "do_nots": ["don't"]
  },
  "audience_profile": {
    "persona": "extracted persona",
    "age_range": "extracted age range",
    "location": "extracted location",
    "pain_points": ["pain point"],
    "motivations": ["motivation"],
    "where_they_hang_out": "extracted info"
  },
  "competitive_positioning": {
    "positioning_statement": "extracted statement",
    "differentiators": ["differentiator"],
    "competitor_awareness": "extracted info",
    "unique_value": "extracted UVP"
  },
  "content_guidelines": {
    "topics": ["topic"],
    "avoid_topics": ["avoid"],
    "posting_frequency": "extracted frequency",
    "best_platforms": ["platform"],
    "content_pillars": ["pillar"]
  },
  "extracted_sections": ["list of section names that had extractable data"]
}

Rules:
- Only include fields where you found actual data in the document
- Convert color names to hex codes when possible
- Be precise — do not fabricate information not found in the text
- If voice words are not explicitly listed, try to infer them from tone descriptions`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pdfText } = body

    if (!pdfText || typeof pdfText !== 'string') {
      return NextResponse.json({ error: 'pdfText is required' }, { status: 400 })
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const userMessage = `Extract structured brand guidelines from this document text:\n\n${pdfText.slice(0, 15000)}`

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
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', response.status, errorText)
      return NextResponse.json({ error: 'AI parsing failed' }, { status: response.status })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()

    try {
      const extracted = JSON.parse(clean)
      return NextResponse.json({ extracted })
    } catch {
      console.error('Failed to parse AI response:', clean.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse AI response', raw: clean }, { status: 500 })
    }
  } catch (e) {
    console.error('parse-guidelines-pdf error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
