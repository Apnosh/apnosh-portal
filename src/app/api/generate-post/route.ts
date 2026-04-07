import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const {
    brandMd,
    patternsMd,
    styleNotes,
    templateType,
    width,
    height,
    platform,
    contentFields,
    safeZoneRules,
  } = body

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const systemPrompt = `You are a social media graphic generator. You create branded social media graphics as standalone HTML files at exact pixel dimensions.

RULES:
- Output ONLY the complete HTML starting with <!DOCTYPE html>. No explanation, no markdown fences, no commentary.
- Body must be exactly ${width}x${height}px with margin:0, padding:0, overflow:hidden.
- Include Google Fonts <link> in <head>.
- All styles inline or in <style>. No external CSS.
- Client logo at bottom per brand spec.
- Safe zones: ${safeZoneRules}
- Scale text for social: headlines 48-72px, body 20-26px, tags 13-15px.
- Key content must be visible in center 1:1 crop for grid thumbnail.

CLIENT BRAND:
${brandMd}

CONTENT STRATEGY:
${patternsMd}

STYLE REFERENCES (last 10 approved posts):
${styleNotes || 'No previous posts yet.'}`

  const userMessage = `Generate a ${templateType} at ${width}x${height} for ${platform}.

${contentFields}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: `API error: ${response.status}`, details: errorText }, { status: 500 })
    }

    const data = await response.json()
    let html = data.content?.[0]?.text ?? ''

    // Strip markdown fences if present
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

    return NextResponse.json({ html })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate post' }, { status: 500 })
  }
}
