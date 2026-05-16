/**
 * Run the canonical synthetic eval suite from CLI against a test client.
 *
 * Run: `set -a && source .env.local && set +a && npx tsx scripts/run-evals.ts`
 *
 * Hits the live agent (real Claude calls + real DB writes). Expect:
 *   - ~3-5 minutes total wall time for 10 cases
 *   - ~$0.05-$0.20 in Anthropic spend
 *   - One row in agent_eval_runs + one abandoned conversation per case
 *
 * The script:
 *   1. Picks yellowbee as the test client by default (override via CLI arg)
 *   2. Acts as admin@apnosh.com (no UI session needed)
 *   3. Prints pass/fail per case + tool call summary + token usage
 *   4. Exits 0 if all pass, 1 otherwise
 */

import { runSyntheticEvalsCore } from '../src/lib/admin/synthetic-evals'

const TEST_CLIENT_ID = process.argv[2] || 'b4857482-fe55-4f87-b09d-b346f625b994'
const ADMIN_USER_ID = '1923654c-b393-42bb-abd5-fc6f69faf87d'

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in env — eval suite requires live Claude calls')
  process.exit(1)
}

async function main() {
  console.log(`Running canonical eval suite against client ${TEST_CLIENT_ID.slice(0, 8)}...`)
  console.log('This makes real Claude API calls. ~3-5 min wall time, ~$0.05-$0.20.\n')

  const t0 = Date.now()
  const result = await runSyntheticEvalsCore({
    testClientId: TEST_CLIENT_ID,
    suiteName: 'canonical-cli',
    actingUserId: ADMIN_USER_ID,
  })

  if ('error' in result) {
    console.error(`\n✗ Suite failed to start: ${result.error}`)
    process.exit(1)
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  for (const c of result.cases) {
    const icon = c.passed ? '✓' : '✗'
    const tools = c.toolsCalled.length > 0 ? `[${c.toolsCalled.join(', ')}]` : '[no tools]'
    console.log(`${icon} ${c.caseName.padEnd(28)} ${tools}`)
    if (!c.passed && c.failReason) {
      console.log(`    reason: ${c.failReason}`)
    }
    if (c.responseText) {
      const trimmed = c.responseText.length > 120
        ? c.responseText.slice(0, 117) + '...'
        : c.responseText
      console.log(`    response: "${trimmed.replace(/\n/g, ' ')}"`)
    }
    console.log(`    ${c.durationMs}ms · in ${c.inputTokens} / out ${c.outputTokens} tokens`)
    totalInputTokens += c.inputTokens
    totalOutputTokens += c.outputTokens
  }

  const wallSec = ((Date.now() - t0) / 1000).toFixed(1)
  const cost = (totalInputTokens / 1_000_000) * 3 + (totalOutputTokens / 1_000_000) * 15
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`${result.passedCases}/${result.totalCases} passed in ${wallSec}s`)
  console.log(`Tokens: ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out  ($${cost.toFixed(3)})`)
  console.log(`Run id: ${result.runId}  →  /admin/agent-evals to view`)

  process.exit(result.failedCases === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('run-evals crashed:', err)
  process.exit(2)
})
