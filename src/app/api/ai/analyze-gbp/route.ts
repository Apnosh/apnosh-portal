import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are a senior marketing analyst and local SEO strategist specializing in restaurant and hospitality businesses. You work for Apnosh and are analyzing Google Business Profile performance data.

You think in layers: first the numbers, then the story behind the numbers, then specific actions that move those numbers. Every recommendation must be specific to this client's data.

NEVER give generic advice like "post regularly" or "respond to reviews." Every recommendation must reference something specific from the data.

You must respond with valid JSON only. No markdown, no backticks. Use this exact structure:

{
  "summary": "2-3 sentences telling the story of this period with specific numbers.",
  "whatsWorking": [
    { "metric": "name", "insight": "what and why it matters", "action": "specific action to amplify" }
  ],
  "areasOfConcern": [
    { "metric": "name", "observation": "what is concerning with numbers", "possibleReasons": "likely cause", "action": "specific fix" }
  ],
  "nextSteps": [
    { "priority": "High/Medium/Low", "action": "specific task", "why": "why now", "expectedImpact": "which metric and how much" }
  ],
  "anomalies": [
    { "metric": "name", "observation": "what looks unusual", "likelyCause": "probable explanation", "recommendation": "action" }
  ],
  "benchmarkContext": "1-2 sentences comparing to typical restaurant GBP performance.",
  "seoRecommendations": {
    "summary": "1-2 sentence SEO health assessment",
    "items": [
      { "title": "action title", "description": "specific action", "priority": "High/Medium/Low" }
    ]
  }
}

Rules:
- whatsWorking: 2-3 items
- areasOfConcern: 1-3 items (only real concerns)
- nextSteps: exactly 3, ranked by impact
- anomalies: only if genuinely unusual
- All text must be specific to this client and data`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientName, agencyName, period, calculatedMetrics, previousPeriodData, lastYearPeriodData, allHistoricalData } = body

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const userMessage = `Analyze this Google Business Profile data:

CLIENT: ${clientName}
AGENCY: ${agencyName}
PERIOD: ${period?.label || 'Unknown'}

CURRENT PERIOD METRICS:
Total Interactions: ${calculatedMetrics.totalInteractions}
vs Previous Period: ${calculatedMetrics.vsPrevious}%
vs Last Year: ${calculatedMetrics.vsLastYear}%
Maps Impressions: ${calculatedMetrics.mapsImpressions} (vs prev: ${calculatedMetrics.mapsVsPrevious}%)
Search Impressions: ${calculatedMetrics.searchImpressions} (vs prev: ${calculatedMetrics.searchVsPrevious}%)
Website Clicks: ${calculatedMetrics.websiteClicks} (vs prev: ${calculatedMetrics.websiteVsPrevious}%)
Phone Calls: ${calculatedMetrics.calls} (vs prev: ${calculatedMetrics.callsVsPrevious}%)
Direction Requests: ${calculatedMetrics.directions} (vs prev: ${calculatedMetrics.directionsVsPrevious}%)
Bookings: ${calculatedMetrics.bookings} (vs prev: ${calculatedMetrics.bookingsVsPrevious}%)
Food Orders: ${calculatedMetrics.foodOrders}

PREVIOUS PERIOD: ${JSON.stringify(previousPeriodData)}
LAST YEAR: ${JSON.stringify(lastYearPeriodData)}
FULL HISTORY: ${JSON.stringify(allHistoricalData)}

CONTEXT:
Peak month: ${calculatedMetrics.peakMonth} (${calculatedMetrics.peakValue} interactions)
3-month avg: ${calculatedMetrics.avg3Month} (prev: ${calculatedMetrics.prevAvg3Month})
Trend: ${calculatedMetrics.trend}

Provide your analysis now.`

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
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Anthropic API error:', response.status, errorText)
      return NextResponse.json({ error: 'AI analysis failed' }, { status: response.status })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()

    try {
      const analysis = JSON.parse(clean)
      return NextResponse.json({ analysis })
    } catch {
      console.error('Failed to parse AI response:', clean.slice(0, 500))
      return NextResponse.json({ error: 'Failed to parse AI analysis', raw: clean }, { status: 500 })
    }
  } catch (e) {
    console.error('analyze-gbp error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
