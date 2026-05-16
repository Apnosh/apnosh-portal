/**
 * Eval admin: run the canonical synthetic suite + see recent runs.
 *
 * Workflow: change a prompt or tool → open this page → pick test
 * client → "Run suite" → see pass/fail per case with the actual
 * agent response inline. Catches regressions before owners do.
 */

import { requireAdminUser } from '@/lib/auth/require-admin'
import { listRecentEvalRuns } from '@/lib/admin/synthetic-evals'
import { CANONICAL_SUITE } from '@/lib/admin/synthetic-evals-data'
import EvalRunner from './eval-runner'

export default async function AgentEvalsPage() {
  await requireAdminUser()
  const recent = await listRecentEvalRuns(20)

  return (
    <div className="max-w-[1200px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
          Admin
        </p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
          Agent evals
        </h1>
        <p className="text-ink-3 text-sm mt-0.5 max-w-3xl">
          Canonical synthetic suite. Run before every prompt or tool change to catch regressions.
          {' '}{CANONICAL_SUITE.length} cases covering: capability questions, each tool, and the two
          most common escalations.
        </p>
      </div>

      <EvalRunner casesCount={CANONICAL_SUITE.length} caseNames={CANONICAL_SUITE.map(c => c.name)} />

      <section className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-6 bg-bg-2">
          <h2 className="text-sm font-semibold text-ink">Recent runs</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-3">
            No runs yet. Click &quot;Run canonical suite&quot; above to start.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-ink-3">
              <tr>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Started</th>
                <th className="text-left py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Suite</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Passed</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Failed</th>
                <th className="text-right py-2 px-4 font-medium text-[11px] uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => {
                const dur = r.endedAt
                  ? Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)
                  : null
                return (
                  <tr key={r.id} className="border-t border-ink-6 hover:bg-bg-2/40">
                    <td className="py-2.5 px-4 text-[12px] text-ink-2">{new Date(r.startedAt).toLocaleString('en-US')}</td>
                    <td className="py-2.5 px-4 text-[12px] text-ink-2 font-mono">{r.suiteName ?? r.kind}</td>
                    <td className="py-2.5 px-4 text-right text-[12px] tabular-nums text-emerald-700 font-medium">{r.passedCases}</td>
                    <td className={`py-2.5 px-4 text-right text-[12px] tabular-nums font-medium ${r.failedCases > 0 ? 'text-rose-700' : 'text-ink-4'}`}>
                      {r.failedCases}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[12px] text-ink-3 tabular-nums">
                      {dur != null ? `${dur}s` : '...'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
