/**
 * Pure data + types for synthetic-evals.
 *
 * Lives outside the 'use server' module so the EvalCase constant can be
 * imported by both server actions and any client-side code without
 * violating Next.js's "server files can only export async functions" rule.
 */

export interface EvalCase {
  name: string
  prompt: string
  expectation:
    | { kind: 'tool_call'; tool: string }
    | { kind: 'any_tool_from'; tools: string[] }
    | { kind: 'escalation' }
    | { kind: 'no_tool' }
  notes?: string
}

/**
 * The canonical suite. Add cases here when the agent picks up a new
 * tool or when a regression sneaks in (the regression case is the
 * highest-value thing to add — it locks the behavior in).
 */
export const CANONICAL_SUITE: EvalCase[] = [
  {
    name: 'capability_question',
    prompt: 'What can you help me with right now? Keep it short.',
    expectation: { kind: 'no_tool' },
    notes: 'Pure intro question; should NOT call any tool.',
  },
  {
    name: 'menu_add_explicit',
    prompt: 'Add a new menu item called "Eval Test Banh Mi" for $12, category "Banh Mi", featured.',
    expectation: { kind: 'tool_call', tool: 'update_menu_item' },
  },
  {
    name: 'hours_change',
    prompt: 'Update our hours to 10am to 9pm every weekday, closed Sunday.',
    expectation: { kind: 'tool_call', tool: 'update_hours' },
  },
  {
    name: 'gbp_post_request',
    prompt: 'Post on Google about our weekend special: $2 off any banh mi.',
    expectation: { kind: 'any_tool_from', tools: ['post_to_gbp', 'generate_post_ideas'] },
    notes: 'Either drafting or directly posting is acceptable.',
  },
  {
    name: 'review_response_request',
    prompt: 'Draft me a response to my most recent unresponded review.',
    expectation: { kind: 'tool_call', tool: 'draft_review_response' },
  },
  {
    name: 'metrics_lookup',
    prompt: "What's our Google rating this month? How many reviews?",
    expectation: { kind: 'tool_call', tool: 'search_business_data' },
  },
  {
    name: 'weekly_recap_request',
    prompt: 'Give me a summary of what happened this week.',
    expectation: { kind: 'tool_call', tool: 'weekly_recap' },
  },
  {
    name: 'redesign_escalation',
    prompt: 'I want to redesign my homepage completely. Can you do that?',
    expectation: { kind: 'escalation' },
    notes: 'Out of scope; should escalate via request_human_help.',
  },
  {
    name: 'legal_copy_escalation',
    prompt: 'Write our privacy policy and terms of service.',
    expectation: { kind: 'escalation' },
    notes: 'Out of scope; legal copy requires human judgment.',
  },
  {
    name: 'tagline_change',
    prompt: 'Change the tagline on our homepage to "Bold flavors, fast service."',
    expectation: { kind: 'tool_call', tool: 'update_page_copy' },
    notes: 'Should attempt update_page_copy; the schema-refusal Layer 1 may still block with a clear error, which is acceptable.',
  },
]

export interface CaseResult {
  caseName: string
  prompt: string
  expected: EvalCase['expectation']
  toolsCalled: string[]
  passed: boolean
  failReason: string | null
  responseText: string | null
  conversationId: string
  durationMs: number
  inputTokens: number
  outputTokens: number
}

export interface SuiteResult {
  runId: string
  startedAt: string
  endedAt: string
  totalCases: number
  passedCases: number
  failedCases: number
  cases: CaseResult[]
}
