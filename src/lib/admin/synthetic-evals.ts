'use server'

/**
 * Synthetic eval suite. Canonical owner intents that the agent
 * should always handle reasonably. Run on demand from /admin/agent-evals
 * before every prompt/tool change to catch regressions early.
 *
 * Each case is one of:
 *   - 'tool_call'   : agent should call a specific tool
 *   - 'escalation'  : agent should call request_human_help
 *   - 'no_tool'     : agent should answer in text only
 *   - 'any_tool_from': agent should call a tool from a set
 *
 * Runs against a designated test client so we don't poison real data.
 * Cases are scored pass/fail by inspecting agent_tool_executions
 * created during the test conversation.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAgentTurn } from '@/lib/agent/runtime'
import { startConversation, cancelExecution } from '@/lib/agent/conversation'
// Import all tool handlers so they register before any eval runs.
import '@/lib/agent/tools/update-menu-item'
import '@/lib/agent/tools/update-page-copy'
import '@/lib/agent/tools/update-hours'
import '@/lib/agent/tools/post-to-gbp'
import '@/lib/agent/tools/request-human-help'
import '@/lib/agent/tools/tag-photo'
import '@/lib/agent/tools/search-business-data'
import '@/lib/agent/tools/draft-review-response'
import '@/lib/agent/tools/generate-post-ideas'
import '@/lib/agent/tools/weekly-recap'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

/* EvalCase + CANONICAL_SUITE + CaseResult + SuiteResult live in
   synthetic-evals-data.ts because a 'use server' module can only
   export async functions, not constants or interfaces. Type re-exports
   are erased at build time and don't violate the rule; the constant
   should be imported from synthetic-evals-data directly. */
export type { EvalCase, CaseResult, SuiteResult } from './synthetic-evals-data'
import { CANONICAL_SUITE, type EvalCase, type CaseResult, type SuiteResult } from './synthetic-evals-data'

/**
 * Run the canonical suite against the given test-client ID.
 * Creates a fresh conversation per case so cases don't bleed
 * state into each other. Always cancels any pending_confirmation
 * tool executions so we don't accidentally publish during tests.
 */
export async function runSyntheticEvals(args: {
  testClientId: string
  suiteName?: string
  cases?: EvalCase[]
}): Promise<SuiteResult | { error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const admin = createAdminClient()
  const cases = args.cases ?? CANONICAL_SUITE
  const startedAt = new Date()

  /* Create the run row up front so we have an id to associate
     results with as they come in. */
  const { data: runRow, error: insErr } = await admin
    .from('agent_eval_runs')
    .insert({
      kind: 'synthetic',
      suite_name: args.suiteName ?? 'canonical',
      total_cases: cases.length,
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single()
  if (insErr || !runRow) return { error: `Could not create eval run: ${insErr?.message}` }

  /* Verify the test client exists. */
  const { data: client } = await admin.from('clients').select('id, name').eq('id', args.testClientId).maybeSingle()
  if (!client) return { error: 'Test client not found' }

  const results: CaseResult[] = []
  for (const c of cases) {
    const caseStart = Date.now()
    try {
      const { id: conversationId } = await startConversation({
        clientId: args.testClientId,
        startedBy: ctx.userId,
        title: `eval:${c.name}`,
      })

      const turnResult = await runAgentTurn({
        conversationId,
        clientId: args.testClientId,
        userMessage: c.prompt,
      })

      /* Look up tool executions for this conversation, including
         pending. */
      const { data: execs } = await admin
        .from('agent_tool_executions')
        .select('tool_name, status')
        .eq('conversation_id', conversationId)
      const toolsCalled = ((execs ?? []) as Array<{ tool_name: string; status: string }>)
        .map(e => e.tool_name)

      /* Cancel anything still pending so we don't publish. */
      for (const e of (execs ?? []) as Array<{ id?: string; tool_name: string; status: string }>) {
        if (e.status === 'pending_confirmation' && e.id) {
          await cancelExecution(e.id)
        }
      }

      const { passed, reason } = scoreCase(c, toolsCalled)
      results.push({
        caseName: c.name,
        prompt: c.prompt,
        expected: c.expectation,
        toolsCalled,
        passed,
        failReason: reason,
        responseText: turnResult.text,
        conversationId,
        durationMs: Date.now() - caseStart,
        inputTokens: turnResult.usage.inputTokens,
        outputTokens: turnResult.usage.outputTokens,
      })

      /* Mark the test conversation abandoned so it doesn't pollute
         the strategist queue. */
      await admin.from('agent_conversations').update({ status: 'abandoned', ended_at: new Date().toISOString() }).eq('id', conversationId)
    } catch (err) {
      results.push({
        caseName: c.name,
        prompt: c.prompt,
        expected: c.expectation,
        toolsCalled: [],
        passed: false,
        failReason: `Runtime error: ${(err as Error).message}`,
        responseText: null,
        conversationId: '',
        durationMs: Date.now() - caseStart,
        inputTokens: 0,
        outputTokens: 0,
      })
    }
  }

  const endedAt = new Date()
  const passed = results.filter(r => r.passed).length

  await admin.from('agent_eval_runs').update({
    ended_at: endedAt.toISOString(),
    passed_cases: passed,
    failed_cases: results.length - passed,
    results: results,
  }).eq('id', runRow.id)

  return {
    runId: runRow.id as string,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    totalCases: results.length,
    passedCases: passed,
    failedCases: results.length - passed,
    cases: results,
  }
}

function scoreCase(c: EvalCase, toolsCalled: string[]): { passed: boolean; reason: string | null } {
  switch (c.expectation.kind) {
    case 'no_tool':
      if (toolsCalled.length === 0) return { passed: true, reason: null }
      return { passed: false, reason: `Expected no tool call; got: ${toolsCalled.join(', ')}` }
    case 'tool_call': {
      const want = c.expectation.tool
      if (toolsCalled.includes(want)) return { passed: true, reason: null }
      return { passed: false, reason: `Expected ${want}; got: ${toolsCalled.join(', ') || '(no tools)'}` }
    }
    case 'any_tool_from': {
      const allowed = c.expectation.tools
      if (toolsCalled.some(t => allowed.includes(t))) return { passed: true, reason: null }
      return { passed: false, reason: `Expected one of [${allowed.join(', ')}]; got: ${toolsCalled.join(', ') || '(no tools)'}` }
    }
    case 'escalation':
      if (toolsCalled.includes('request_human_help')) return { passed: true, reason: null }
      return { passed: false, reason: `Expected escalation; got: ${toolsCalled.join(', ') || '(no tools)'}` }
  }
}

export async function listRecentEvalRuns(limit = 20): Promise<Array<{
  id: string; kind: string; suiteName: string | null; startedAt: string; endedAt: string | null;
  totalCases: number; passedCases: number; failedCases: number;
}>> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_eval_runs')
    .select('id, kind, suite_name, started_at, ended_at, total_cases, passed_cases, failed_cases')
    .order('started_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as Array<{
    id: string; kind: string; suite_name: string | null; started_at: string; ended_at: string | null;
    total_cases: number; passed_cases: number; failed_cases: number;
  }>).map(r => ({
    id: r.id,
    kind: r.kind,
    suiteName: r.suite_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    totalCases: r.total_cases,
    passedCases: r.passed_cases,
    failedCases: r.failed_cases,
  }))
}

export async function getEvalRun(runId: string): Promise<SuiteResult | null> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_eval_runs')
    .select('id, started_at, ended_at, total_cases, passed_cases, failed_cases, results')
    .eq('id', runId)
    .maybeSingle()
  if (!data) return null
  return {
    runId: data.id as string,
    startedAt: data.started_at as string,
    endedAt: data.ended_at as string,
    totalCases: data.total_cases as number,
    passedCases: data.passed_cases as number,
    failedCases: data.failed_cases as number,
    cases: (data.results as CaseResult[] | null) ?? [],
  }
}
