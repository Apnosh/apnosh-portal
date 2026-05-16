'use client'

import { useState } from 'react'
import { Loader2, Play, CheckCircle2, XCircle } from 'lucide-react'
import { runSyntheticEvals, type SuiteResult } from '@/lib/admin/synthetic-evals'

export default function EvalRunner({ casesCount, caseNames }: { casesCount: number; caseNames: string[] }) {
  const [testClientId, setTestClientId] = useState('b4857482-fe55-4f87-b09d-b346f625b994')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SuiteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!testClientId.trim()) {
      setError('Test client ID is required')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await runSyntheticEvals({ testClientId: testClientId.trim() })
      if ('error' in res) setError(res.error)
      else setResult(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={testClientId}
          onChange={e => setTestClientId(e.target.value)}
          placeholder="Test client UUID (yellowbee by default)"
          className="flex-1 px-3 py-2 rounded-lg border border-ink-6 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? 'Running...' : `Run canonical suite (${casesCount} cases)`}
        </button>
      </div>
      <div className="text-[11px] text-ink-3">
        Cases: <span className="font-mono text-ink-2">{caseNames.join(', ')}</span>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[12px]">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-[14px] font-semibold text-ink">
              {result.passedCases} / {result.totalCases} passed
            </div>
            <div className="text-[12px] text-ink-3">
              Took {Math.round((new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime()) / 1000)}s
            </div>
          </div>
          <div className="space-y-2">
            {result.cases.map(c => (
              <div
                key={c.caseName}
                className={`rounded-lg border p-3 ${c.passed ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'}`}
              >
                <div className="flex items-start gap-2">
                  {c.passed
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-ink font-mono">{c.caseName}</div>
                    <div className="text-[11.5px] text-ink-3 mt-0.5 italic">&quot;{c.prompt}&quot;</div>
                    <div className="text-[11px] text-ink-3 mt-1.5 flex items-center gap-3 flex-wrap">
                      <span>tools: {c.toolsCalled.length === 0 ? <em>(none)</em> : <span className="font-mono">{c.toolsCalled.join(', ')}</span>}</span>
                      <span>{c.inputTokens}↓{c.outputTokens}↑ tokens</span>
                      <span>{c.durationMs}ms</span>
                    </div>
                    {!c.passed && c.failReason && (
                      <div className="mt-1.5 text-[11.5px] text-rose-700">{c.failReason}</div>
                    )}
                    {c.responseText && (
                      <details className="mt-2 text-[11.5px]">
                        <summary className="cursor-pointer text-ink-3 hover:text-ink-2">View response</summary>
                        <div className="mt-1 text-ink-2 whitespace-pre-wrap bg-white/60 rounded p-2 max-h-48 overflow-y-auto">
                          {c.responseText}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
