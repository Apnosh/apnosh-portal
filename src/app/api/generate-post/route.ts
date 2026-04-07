import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const {
    brandMd,
    patternsMd,
    styleNotes,
    styleGuideHtml,
    goldenExamples,
    referenceImageUrls,
    logoUrl,
    templateType,
    width,
    height,
    platform,
    contentFields,
    safeZoneRules,
  } = body

  // Read API key
  let apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const envPath = path.join(process.cwd(), '.env.local')
      const envContent = fs.readFileSync(envPath, 'utf8')
      const match = envContent.match(/^ANTHROPIC_API_KEY=(.+)$/m)
      if (match) apiKey = match[1].trim()
    } catch { /* ignore */ }
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // Build golden examples section
  let goldenSection = ''
  if (goldenExamples && goldenExamples.length > 0) {
    goldenSection = `\n\nGOLDEN EXAMPLES FOR ${templateType.toUpperCase()} POSTS:
These are approved reference posts. Use them as the structural and visual starting point. Adapt the content but preserve the CSS patterns, layout structure, and visual treatment exactly.

${goldenExamples.map((g: { post_code: string; style_notes: string; html_source: string }, i: number) =>
  `--- Example ${i + 1}: ${g.post_code} ---
Notes: ${g.style_notes || 'No notes'}
HTML:
${g.html_source}
`).join('\n')}`
  }

  // Build style guide section
  let styleGuideSection = ''
  if (styleGuideHtml) {
    // Extract just the <style> and key structural elements, limit to ~4KB
    const styleMatch = styleGuideHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    if (styleMatch) {
      const css = styleMatch.map((m: string) => m.replace(/<\/?style[^>]*>/gi, '').trim()).join('\n')
      styleGuideSection = `\n\nCLIENT STYLE GUIDE CSS:
Use these exact CSS values. They are from the client's official style guide.

${css.slice(0, 4000)}
`
    }
  }

  // Logo instruction
  const logoInstruction = logoUrl
    ? `\n- Client logo: <img src="${logoUrl}" style="height:28px;"> placed at bottom center with 24px padding from edges.`
    : ''

  const systemPrompt = `You are a social media graphic generator. You create branded social media graphics as standalone HTML files at exact pixel dimensions.

CRITICAL RULES:
- Output ONLY the complete HTML starting with <!DOCTYPE html>. No explanation, no markdown fences, no commentary.
- Body must be exactly ${width}x${height}px with margin:0, padding:0, overflow:hidden.
- Include Google Fonts <link> tags in <head> for all fonts referenced.
- All styles inline or in <style>. No external CSS files.
- Never invent color values. Use ONLY the documented color tokens from the brand system.
- Glass morphism rgba values, blur amounts, and border-radius must match the brand specs exactly.
- Background gradient must use the documented body background CSS.${logoInstruction}
- Safe zones: ${safeZoneRules}
- Scale text for social: headlines 48-72px, body 20-26px, tags 13-15px.
- Key content must be visible in center 1:1 crop for grid thumbnail.
${goldenExamples && goldenExamples.length > 0
  ? '- GOLDEN EXAMPLES are provided below. Use them as the structural template. Match their CSS, layout, and visual treatment. Only change the content.'
  : '- Follow the CSS Design System specs exactly as documented in CLIENT BRAND.'}

CLIENT BRAND:
${brandMd}
${styleGuideSection}
${goldenSection}

CONTENT STRATEGY:
${patternsMd}

STYLE REFERENCES (recent approved posts):
${styleNotes || 'No previous posts yet.'}`

  // Build message content - text + optional reference images via vision
  const messageContent: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data?: string; url?: string } }> = []

  // Add reference images if any (via URL for vision)
  const refUrls = (referenceImageUrls || []) as string[]
  if (refUrls.length > 0) {
    messageContent.push({
      type: 'text',
      text: `Here are reference design images to match the visual style of. Study these and replicate their layout, color usage, typography, and overall feel:\n`,
    })
    for (const url of refUrls.slice(0, 3)) {
      messageContent.push({
        type: 'image' as string,
        source: { type: 'url', media_type: 'image/png', url },
      } as typeof messageContent[number])
    }
  }

  // Add the actual generation request
  messageContent.push({
    type: 'text',
    text: `Generate a ${templateType} post at ${width}x${height} for ${platform}.

${contentFields}`,
  })

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
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: messageContent.length === 1 ? messageContent[0].text : messageContent,
        }],
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
