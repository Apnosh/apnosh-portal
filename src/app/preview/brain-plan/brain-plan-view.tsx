'use client'
/**
 * BrainPlanView — the owner-facing presentation of a brain-built plan.
 *
 * The audit's UI call: collapse to a decision view. Lead with the RESULT the plan is built to move
 * (the AI-determined outcome, stated plainly), show the focused live core that runs now, and tuck
 * everything else behind one honest "unlock" tray (connect a channel / more budget / coming soon).
 * Reasons explain the lead lines. Reusable: feed it a BrainPlanVM (the dev /preview/plan route does;
 * the live builder will next).
 */
import { useState } from 'react'

export type LineStatus = 'ready' | 'connect' | 'budget' | 'soon'

export interface PlanLine {
  serviceId: string
  title: string
  stageTitle: string
  status: LineStatus
  reason?: string
}

export interface BrainPlanVM {
  outcomeLabel: string
  tierLabel: string
  tierReason: string
  live: PlanLine[]
  unlock: PlanLine[]
}

const UNLOCK: Record<Exclude<LineStatus, 'ready'>, { label: string; icon: string; bg: string; fg: string }> = {
  connect: { label: 'Connect to unlock', icon: 'M13 7l-2 2m-2 2l-2 2', bg: 'var(--color-brand-tint)', fg: 'var(--color-brand-dark)' },
  budget: { label: 'More budget', icon: '', bg: '#faeeda', fg: '#854f0b' },
  soon: { label: 'Coming soon', icon: '', bg: '#f0f0f5', fg: '#6e6e73' },
}

export function BrainPlanView({ vm, defaultOpen = false }: { vm: BrainPlanVM; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const liveByStage = groupByStage(vm.live)

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 text-ink">
      {/* Built-to-result header */}
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Your plan</p>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">
          Built to <span className="text-brand-dark">{vm.outcomeLabel}</span>
        </h1>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-bg px-3 py-1.5 text-[13px] ring-1 ring-ink-6">
          <span className="font-medium">{vm.tierLabel} plan</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-3">{vm.tierReason}</span>
        </div>
      </header>

      {/* Running now */}
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand" />
        <span className="text-[15px] font-semibold">Running now</span>
        <span className="text-[13px] text-ink-3">{vm.live.length} steps</span>
      </div>
      <div className="space-y-4">
        {liveByStage.map((g) => (
          <div key={g.stageTitle}>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-4">{g.stageTitle}</div>
            <div className="space-y-1.5">
              {g.lines.map((l) => (
                <div key={l.serviceId} className="rounded-xl bg-bg p-3 ring-1 ring-ink-6">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-dark">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] leading-snug">{l.title}</div>
                      {l.reason && <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{l.reason}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unlock tray */}
      {vm.unlock.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl bg-bg-2 px-3.5 py-3 text-left ring-1 ring-ink-6 hover:ring-ink-5"
          >
            <span className="grid h-5 w-5 place-items-center text-ink-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0" strokeLinecap="round" /></svg>
            </span>
            <span className="text-[14px] font-medium">Unlock {vm.unlock.length} more</span>
            <span className="text-[12px] text-ink-3">connect a channel or raise your budget</span>
            <span className="ml-auto text-ink-4">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <div className="mt-2 space-y-1.5">
              {vm.unlock.map((l) => {
                const u = UNLOCK[l.status as Exclude<LineStatus, 'ready'>]
                return (
                  <div key={l.serviceId} className="flex items-center gap-2.5 rounded-xl bg-bg p-3 ring-1 ring-dashed ring-ink-5">
                    <span className="text-[14px] text-ink-2">{l.title}</span>
                    <span className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: u.bg, color: u.fg }}>
                      {u.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-[12px] text-ink-4">The AI picks the result this goal drives and the steps that get there. You stay in control.</p>
    </div>
  )
}

function groupByStage(lines: PlanLine[]): { stageTitle: string; lines: PlanLine[] }[] {
  const out: { stageTitle: string; lines: PlanLine[] }[] = []
  for (const l of lines) {
    let g = out.find((x) => x.stageTitle === l.stageTitle)
    if (!g) { g = { stageTitle: l.stageTitle, lines: [] }; out.push(g) }
    g.lines.push(l)
  }
  return out
}
