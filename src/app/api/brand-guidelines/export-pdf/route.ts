import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function esc(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colorSwatch(hex: string, label: string): string {
  if (!hex) return ''
  return `
    <div style="display:inline-flex;align-items:center;gap:8px;margin-right:16px;margin-bottom:8px">
      <div style="width:32px;height:32px;border-radius:6px;background:${esc(hex)};border:1px solid #e5e7eb"></div>
      <div>
        <div style="font-size:12px;font-weight:600;color:#111">${esc(label)}</div>
        <div style="font-size:11px;color:#666">${esc(hex)}</div>
      </div>
    </div>`
}

function listItems(items: string[] | undefined, fallback = 'Not set'): string {
  if (!items || items.length === 0) return `<p style="color:#999;font-style:italic">${fallback}</p>`
  return '<ul style="margin:4px 0 0 0;padding-left:20px">' +
    items.map(i => `<li style="font-size:13px;color:#333;margin-bottom:4px">${esc(i)}</li>`).join('') +
    '</ul>'
}

function sectionHtml(title: string, content: string): string {
  return `
    <div class="section" style="margin-bottom:28px;page-break-inside:avoid">
      <h2 style="font-size:16px;font-weight:700;color:#111;border-bottom:2px solid var(--accent);padding-bottom:6px;margin-bottom:12px">${esc(title)}</h2>
      ${content}
    </div>`
}

function fieldHtml(label: string, value: string | undefined | null): string {
  if (!value) return ''
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">${esc(label)}</div>
      <div style="font-size:13px;color:#333;line-height:1.5">${esc(value)}</div>
    </div>`
}

export async function GET(request: NextRequest) {
  const guidelineId = request.nextUrl.searchParams.get('guidelineId')
  if (!guidelineId) {
    return NextResponse.json({ error: 'guidelineId is required' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: guideline, error: gErr } = await supabase
    .from('brand_guidelines')
    .select('*')
    .eq('id', guidelineId)
    .single()

  if (gErr || !guideline) {
    return NextResponse.json({ error: 'Guideline not found' }, { status: 404 })
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('name, industry')
    .eq('id', guideline.business_id)
    .single()

  const biz = business || { name: 'Unknown Business', industry: '' }
  const bo = guideline.brand_overview || {}
  const vi = guideline.visual_identity || {}
  const vt = guideline.voice_and_tone || {}
  const ap = guideline.audience_profile || {}
  const cp = guideline.competitive_positioning || {}
  const cg = guideline.content_guidelines || {}

  const accent = vi.primary_color || '#2563eb'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Build color swatches
  let colorSwatches = ''
  if (vi.primary_color) colorSwatches += colorSwatch(vi.primary_color, 'Primary')
  if (vi.secondary_color) colorSwatches += colorSwatch(vi.secondary_color, 'Secondary')
  if (vi.accent_colors?.length) {
    vi.accent_colors.forEach((c: string, i: number) => {
      colorSwatches += colorSwatch(c, `Accent ${i + 1}`)
    })
  }

  // Build voice words
  let voiceWordsHtml = ''
  if (vt.voice_words?.length) {
    voiceWordsHtml = '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:8px">' +
      vt.voice_words.map((w: { word: string; description: string }) =>
        `<div style="flex:1;min-width:140px;padding:10px;border:1px solid #e5e7eb;border-radius:8px">
          <div style="font-size:14px;font-weight:600;color:#111">${esc(w.word)}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">${esc(w.description)}</div>
        </div>`
      ).join('') +
      '</div>'
  }

  // Build fonts
  let fontsHtml = ''
  if (vi.fonts) {
    const f = vi.fonts as { primary?: string; secondary?: string; body?: string }
    const parts: string[] = []
    if (f.primary) parts.push(`<strong>Primary:</strong> ${esc(f.primary)}`)
    if (f.secondary) parts.push(`<strong>Secondary:</strong> ${esc(f.secondary)}`)
    if (f.body) parts.push(`<strong>Body:</strong> ${esc(f.body)}`)
    if (parts.length) {
      fontsHtml = `<div style="margin-bottom:10px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:4px">Fonts</div>
        <div style="font-size:13px;color:#333">${parts.join(' &nbsp;|&nbsp; ')}</div>
      </div>`
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Brand Guidelines - ${esc(biz.name)}</title>
  <style>
    :root { --accent: ${accent}; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #333; margin: 0; padding: 0; background: #fff;
    }
    .container { max-width: 780px; margin: 0 auto; padding: 40px 32px; }
    .print-banner {
      background: #f0f4ff; border: 1px solid #c7d2fe; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 24px; text-align: center;
      font-size: 13px; color: #4338ca;
    }
    @media print {
      .print-banner { display: none !important; }
      body { padding: 0; }
      .container { padding: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="print-banner">
      Press <strong>Ctrl+P</strong> (or <strong>Cmd+P</strong> on Mac) to save as PDF. This banner will not appear in the printout.
    </div>

    <div style="margin-bottom:32px">
      <h1 style="font-size:24px;font-weight:800;color:#111;margin:0">${esc(biz.name)}</h1>
      <p style="font-size:14px;color:#666;margin:4px 0 0 0">Brand Guidelines${biz.industry ? ` &mdash; ${esc(biz.industry)}` : ''}</p>
    </div>

    ${bo.mission || bo.story || bo.what_we_do || bo.tagline ? sectionHtml('Brand Overview',
      fieldHtml('Mission', bo.mission) +
      fieldHtml('Brand Story', bo.story) +
      fieldHtml('What We Do', bo.what_we_do) +
      fieldHtml('Tagline', bo.tagline)
    ) : ''}

    ${colorSwatches || fontsHtml || vi.logo_usage_notes || vi.imagery_style ? sectionHtml('Visual Identity',
      (colorSwatches ? `<div style="margin-bottom:12px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:6px">Brand Colors</div><div>${colorSwatches}</div></div>` : '') +
      fontsHtml +
      fieldHtml('Logo Usage', vi.logo_usage_notes) +
      fieldHtml('Imagery Style', vi.imagery_style)
    ) : ''}

    ${voiceWordsHtml || vt.tone_description || vt.sample_phrases?.length || vt.do_nots?.length ? sectionHtml('Voice & Tone',
      voiceWordsHtml +
      fieldHtml('Tone Description', vt.tone_description) +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Sample Phrases</div>${listItems(vt.sample_phrases)}</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Sample CTAs</div>${listItems(vt.sample_ctas)}</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Do Nots</div>${listItems(vt.do_nots)}</div>`
    ) : ''}

    ${ap.persona || ap.age_range || ap.pain_points?.length ? sectionHtml('Audience Profile',
      fieldHtml('Ideal Customer Persona', ap.persona) +
      fieldHtml('Age Range', ap.age_range) +
      fieldHtml('Location', ap.location) +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Pain Points</div>${listItems(ap.pain_points)}</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Motivations</div>${listItems(ap.motivations)}</div>` +
      fieldHtml('Where They Hang Out', ap.where_they_hang_out)
    ) : ''}

    ${cp.positioning_statement || cp.differentiators?.length || cp.unique_value ? sectionHtml('Competitive Positioning',
      fieldHtml('Positioning Statement', cp.positioning_statement) +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Differentiators</div>${listItems(cp.differentiators)}</div>` +
      fieldHtml('Competitive Landscape', cp.competitor_awareness) +
      fieldHtml('Unique Value', cp.unique_value)
    ) : ''}

    ${cg.topics?.length || cg.content_pillars?.length || cg.posting_frequency ? sectionHtml('Content Guidelines',
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Topics to Cover</div>${listItems(cg.topics)}</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Topics to Avoid</div>${listItems(cg.avoid_topics)}</div>` +
      fieldHtml('Posting Frequency', cg.posting_frequency) +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Best Platforms</div>${listItems(cg.best_platforms)}</div>` +
      `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">Content Pillars</div>${listItems(cg.content_pillars)}</div>`
    ) : ''}

    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="font-size:11px;color:#999;margin:0">Prepared by Apnosh for ${esc(biz.name)}</p>
      <p style="font-size:11px;color:#bbb;margin:4px 0 0 0">Generated ${today}</p>
    </div>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
