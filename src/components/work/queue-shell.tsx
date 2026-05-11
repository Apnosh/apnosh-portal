/**
 * Shared shell for /work/* queue pages (boosts, edits, briefs, engage,
 * marketplace). Same layout, different accent + copy. Reduces churn
 * so adding a new role lens stays one-file cheap.
 */

import { type ReactNode } from 'react'

interface Props {
  icon: ReactNode
  accent: 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo' | 'sky' | 'teal' | 'pink'
  eyebrow: string
  title: string
  description: string
  empty?: ReactNode
  children?: ReactNode
}

const ACCENTS: Record<Props['accent'], { bg: string; text: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-100' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-100' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-100' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',    ring: 'ring-pink-100' },
}

export default function QueueShell({ icon, accent, eyebrow, title, description, empty, children }: Props) {
  const a = ACCENTS[accent]
  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ring-1 ${a.bg} ${a.text} ${a.ring}`}>
            {icon}
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            {eyebrow}
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          {title}
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          {description}
        </p>
      </header>
      {children}
      {!children && empty}
    </div>
  )
}

export function ComingSoonState({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <p className="text-[14px] font-semibold text-ink leading-tight">Nothing in your queue</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        {children}
      </p>
    </div>
  )
}
