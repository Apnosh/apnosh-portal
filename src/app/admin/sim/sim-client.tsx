'use client'

import { useState } from 'react'
import type { ShipSimReport } from '@/lib/campaigns/sim/ship-integration'

export default function SimClient() {
  const [report, setReport] = useState<ShipSimReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true); setReport(null); setError(null)
    try {
      const r = await fetch('/api/admin/sim', { method: 'POST' })
      if (!r.ok) { setError(r.status === 403 ? 'Admins only.' : `Failed (${r.status})`); return }
      setReport(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally { setRunning(false) }
  }

  const passed = report?.checks.filter((c) => c.ok).length ?? 0
  const failed = report ? report.checks.length - passed : 0

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Admin · lifecycle</p>
        <h1 className="mt-0.5 text-xl font-semibold text-neutral-900">Ship simulation</h1>
        <p className="mt-1 text-sm text-neutral-500">Runs the real ship path (create → materialize → mint → status machine) against a throwaway campaign, then deletes it. No browser clicking, no terminal.</p>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        <button
          onClick={run}
          disabled={running}
          className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run ship simulation'}
        </button>

        {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {report && (
          <div className="mt-6">
            <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-semibold ${report.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {report.ok ? '✅ All checks passed' : `❌ ${failed} failed`} · {passed}/{report.checks.length} · {new Date(report.ranAt).toLocaleTimeString()}
            </div>
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {report.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 text-sm ${c.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{c.ok ? '✓' : '✗'}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-800">{c.name}</p>
                    {!c.ok && c.detail && <p className="mt-0.5 text-xs text-rose-500">{c.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
