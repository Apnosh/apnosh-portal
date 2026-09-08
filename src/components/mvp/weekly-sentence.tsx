'use client'
/**
 * WeeklySentence — one true line about this week, under the funnel.
 *
 * The whole of Move 7's love idea in one row: an owner who opens the app should be told, in a
 * sentence, what happened. Not a chart, not a percentage — the thing they would say out loud.
 * "This week your Google listing got 41 taps. Last week it was 33."
 *
 * NOTHING TO SAY MEANS NOTHING DRAWN. The reader (src/lib/love/sentence.ts) returns null when
 * Google has not reported this week or there are no posts, and null renders no row at all — no
 * skeleton, no "no data yet" placeholder. A line that says nothing is worse than a page that is
 * quiet, and the funnel above already says when the numbers are missing.
 *
 * THE NUMBERS ARE THE LEDGER'S. The sentence is built from the same reported Google days the
 * promises ledger counts by, and it never says up or down: it puts the two weeks side by side.
 * It arrives as a key plus two raw numbers so it can be drawn in the owner's own language and
 * their own grouping.
 *
 * Tap opens Insights, which is where the week's detail lives.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMvpTheme } from './mvp-theme'
import { useLang } from './mvp-language'
import { num } from '@/lib/i18n/t'

interface Line { key: string; vars: { n: number; prev: number } }

export default function WeeklySentence({ clientId }: { clientId?: string }) {
  const { C } = useMvpTheme()
  const { T, lang } = useLang()
  const [line, setLine] = useState<Line | null>(null)

  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetch(`/api/dashboard/love?clientId=${clientId}&with=sentence`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j?.line?.key) setLine(j.line as Line) })
      .catch(() => { /* a quiet week is the same as a failed read: draw nothing */ })
    return () => { alive = false }
  }, [clientId])

  if (!line) return null
  return (
    <Link
      href="/dashboard/insights"
      style={{
        display: 'block', textDecoration: 'none',
        fontSize: 13, lineHeight: 1.45, color: C.mute,
        padding: '2px 2px 8px',
      }}
    >
      {T(line.key, { n: num(line.vars.n, lang), prev: num(line.vars.prev, lang) })}
    </Link>
  )
}
