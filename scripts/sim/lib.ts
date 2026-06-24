/**
 * Tiny zero-dependency assertion + reporting framework for the lifecycle
 * simulator. No browser, no test runner — just `npx tsx scripts/sim/<file>.ts`.
 * Each check records a pass/fail; the runner prints a grouped report and exits
 * non-zero if anything failed, so it doubles as a CI gate.
 */

export interface CheckResult { name: string; ok: boolean; detail?: string | null }

export class Suite {
  private results: { group: string; checks: CheckResult[] }[] = []
  private current: { group: string; checks: CheckResult[] } | null = null

  group(name: string) {
    this.current = { group: name, checks: [] }
    this.results.push(this.current)
  }

  /** Assert a boolean. `detail` is shown only on failure (or always for context). */
  check(name: string, ok: boolean, detail?: string | null) {
    if (!this.current) this.group('ungrouped')
    this.current!.checks.push({ name, ok, detail })
  }

  /** Assert two values equal (deep-ish via JSON for objects). */
  eq(name: string, actual: unknown, expected: unknown) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    this.check(name, ok, ok ? undefined : `got ${j(actual)} · want ${j(expected)}`)
  }

  /** Run an assertion body that may throw; a throw is a failed check, not a crash. */
  safe(name: string, body: () => void) {
    try { body(); this.check(name, true) }
    catch (e) { this.check(name, false, e instanceof Error ? e.message : String(e)) }
  }

  /** Print the report and return true if everything passed. */
  report(title: string): boolean {
    let pass = 0, fail = 0
    const lines: string[] = ['', `━━━ ${title} ━━━`]
    for (const g of this.results) {
      const gFail = g.checks.filter((c) => !c.ok).length
      lines.push(`\n${gFail ? '✗' : '✓'} ${g.group}  (${g.checks.length - gFail}/${g.checks.length})`)
      for (const c of g.checks) {
        if (c.ok) { pass++; } else { fail++; lines.push(`    ✗ ${c.name}${c.detail ? `  →  ${c.detail}` : ''}`) }
      }
    }
    lines.push('', `${fail === 0 ? '✅ ALL PASS' : `❌ ${fail} FAILED`} · ${pass} passed, ${fail} failed`, '')
    console.log(lines.join('\n'))
    return fail === 0
  }
}

function j(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s && s.length > 80 ? s.slice(0, 77) + '…' : String(s)
}

/** Deterministic per-index variety without Math.random (which is banned in some envs). */
export function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }
