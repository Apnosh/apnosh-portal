/**
 * ai-transport — proves the AI choke point degrades gracefully AND classifies loudly.
 *
 * The outage this guards against already happened: the prod key ran out of credits and 54
 * surfaces failed silently for days. The permanent fix has two halves, and this sim pins both:
 *  - GRACEFUL: callStructuredOutput returns null on every failure shape; it never throws.
 *  - LOUD: every failure maps to the right class, and the alert policy is exactly what the owner
 *    approved: dead key/credits interrupt every time, rate limits dedupe, noise stays in the log.
 *
 * fetch is mocked, so nothing here touches the network or spends a cent. The DB writes inside the
 * transport are fire-and-forget by contract, so their absence here is the contract working.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/ai-transport.ts
 */
import { Suite } from './lib'
import { callStructuredOutput, failClassForStatus } from '../../src/lib/campaigns/planning/anthropic'
import { alertPolicy, estimateCost, type FailClass } from '../../src/lib/campaigns/planning/ai-log'

const s = new Suite()

/* A fake key so readApiKey never falls through to .env.local: these tests must not depend on
 * what secrets happen to exist on the machine running them. */
process.env.ANTHROPIC_API_KEY = 'sim-fake-key-never-sent-anywhere'

const realFetch = globalThis.fetch
function mockFetch(handler: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => handler()) as typeof fetch
}
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function run() {
  s.group('Every HTTP failure returns null and never throws')
  for (const status of [401, 402, 429, 500, 529]) {
    mockFetch(() => jsonResponse(status, { error: 'x' }))
    const out = await callStructuredOutput<{ a: number }>({ system: 's', user: 'u', schema: {}, tag: { kind: 'sim' } })
    s.check(`HTTP ${status} → null`, out === null)
  }

  s.group('The real out-of-credits shape degrades gracefully')
  {
    mockFetch(() => jsonResponse(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.' } }))
    const out = await callStructuredOutput<{ a: number }>({ system: 's', user: 'u', schema: {}, tag: { kind: 'sim' } })
    s.check('the exact live 400-credit response returns null, never throws', out === null)
  }

  s.group('Success and garbage both resolve correctly')
  {
    mockFetch(() => jsonResponse(200, {
      usage: { input_tokens: 900, output_tokens: 150 },
      content: [{ type: 'text', text: JSON.stringify({ mix: ['a', 'b'] }) }],
    }))
    const ok = await callStructuredOutput<{ mix: string[] }>({ system: 's', user: 'u', schema: {}, tag: { kind: 'sim' } })
    s.check('a well-formed answer parses', !!ok && ok.mix.length === 2)

    mockFetch(() => jsonResponse(200, { content: [{ type: 'text', text: 'not json {' }] }))
    const bad = await callStructuredOutput<{ mix: string[] }>({ system: 's', user: 'u', schema: {} })
    s.check('a garbage answer is null, not a crash', bad === null)

    mockFetch(() => jsonResponse(200, { content: [] }))
    const empty = await callStructuredOutput<{ mix: string[] }>({ system: 's', user: 'u', schema: {} })
    s.check('an empty answer is null', empty === null)
  }

  s.group('The failure classes are exact')
  {
    s.check('401 is a dead key', failClassForStatus(401) === 'http-401')
    s.check('402 is out of credits, never lumped into 5xx', failClassForStatus(402) === 'http-402')
    // The case that actually happens: Anthropic answers 400 with "credit balance is too low"
    // (probed live 2026-07-28). Status alone would file the one outage that already bit us
    // under log-only 5xx.
    s.check('400 + "credit balance" body is out of credits', failClassForStatus(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}') === 'http-402')
    s.check('a plain 400 without that body stays 5xx-class', failClassForStatus(400, '{"error":{"message":"bad schema"}}') === 'http-5xx')
    s.check('429 is rate limiting', failClassForStatus(429) === 'http-429')
    s.check('everything else is 5xx', failClassForStatus(500) === 'http-5xx' && failClassForStatus(529) === 'http-5xx')
  }

  s.group('The alert policy is exactly what the owner approved')
  {
    const want: Record<FailClass, ReturnType<typeof alertPolicy>> = {
      'no-key': 'always',
      'http-401': 'always',
      'http-402': 'always',
      'http-429': 'dedupe-window',
      'http-5xx': 'log-only',
      timeout: 'log-only',
      unparseable: 'log-only',
    }
    for (const [cls, policy] of Object.entries(want) as [FailClass, ReturnType<typeof alertPolicy>][]) {
      s.check(`${cls} → ${policy}`, alertPolicy(cls) === policy)
    }
  }

  s.group('Cost estimates are honest arithmetic')
  {
    // opus-4-8: $5/M in, $25/M out. 900 in + 150 out = 0.0045 + 0.00375 = 0.00825.
    s.check('900 in + 150 out ≈ $0.00825', estimateCost('claude-opus-4-8', 900, 150) === 0.00825)
    s.check('an unknown model estimates nothing rather than guessing', estimateCost('some-model', 1000, 1000) === null)
    s.check('no usage block estimates nothing', estimateCost('claude-opus-4-8') === null)
  }

  globalThis.fetch = realFetch
  s.report('AI transport')
}

void run()
