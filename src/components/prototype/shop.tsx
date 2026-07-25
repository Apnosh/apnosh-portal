'use client'

/**
 * THE SHOP — the whole flow, one state machine.
 *
 *   shelf → brief → spread ⇄ cast → relay → reckoning
 *
 * No database, no auth, no network. Everything lives in this component's state so the flow can
 * be walked end to end in a minute and thrown away. If a screen needs data it does not have,
 * that is a finding, not something to paper over.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CAMPAIGNS, GOODS } from './data'
import type { Campaign } from './data'
import { TOKENS, type Mode, type Tokens } from './kit'
import {
  Brief, Cast, Shelf, Spread, defaultPickFor, priceOf, type Pick, type Picks,
} from './screens-buy'
import { Relay, Reckoning, allDone, buildJobs, tick, type Job } from './screens-run'

type Step = 'shelf' | 'brief' | 'spread' | 'cast' | 'relay' | 'reckoning'
type Level = 'lean' | 'standard' | 'full' | 'custom'

/** A one-off is a real campaign with exactly one thing in it. Same machinery, smaller spread. */
function oneOffCampaign(goodId: string): Campaign {
  const g = GOODS[goodId]
  return {
    id: `one-${goodId}`,
    title: g.name,
    blurb: g.what,
    stage: 'found',
    dated: false,
    goods: [goodId],
    levels: { lean: [goodId], standard: [goodId], full: [goodId] },
  }
}

export default function Shop() {
  const [mode, setMode] = useState<Mode>('light')
  const C: Tokens = TOKENS[mode]

  const [step, setStep] = useState<Step>('shelf')
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [picks, setPicks] = useState<Picks>({})
  const [level, setLevel] = useState<Level>('standard')
  const [date, setDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 15); return d
  })
  const [note, setNote] = useState('')
  const [casting, setCasting] = useState<string | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [day, setDay] = useState(0)

  /* Follow the OS on first paint only. After that the toggle wins, so flipping it does not
     get stomped the next time a media query fires. */
  useEffect(() => {
    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) setMode('dark')
    } catch { /* no matchMedia, stay light */ }
  }, [])

  const applyLevel = useCallback((c: Campaign, l: 'lean' | 'standard' | 'full') => {
    const next: Picks = {}
    c.goods.forEach((id) => { next[id] = null })
    c.levels[l].forEach((id) => { next[id] = defaultPickFor(GOODS[id], l) })
    setPicks(next)
    setLevel(l)
  }, [])

  const openCampaign = useCallback((c: Campaign) => {
    setCampaign(c)
    applyLevel(c, 'standard')
    setStep('brief')
  }, [applyLevel])

  const openOneOff = useCallback((goodId: string) => {
    const c = oneOffCampaign(goodId)
    setCampaign(c)
    setPicks({ [goodId]: defaultPickFor(GOODS[goodId]) })
    setLevel('custom')
    setStep('spread')
  }, [])

  const setPick = useCallback((goodId: string, pick: Pick | null) => {
    setPicks((p) => ({ ...p, [goodId]: pick }))
    setLevel('custom')
  }, [])

  const book = useCallback(() => {
    if (!campaign) return
    setJobs(buildJobs(campaign.goods, picks))
    setDay(0)
    setStep('relay')
  }, [campaign, picks])

  const advance = useCallback(() => {
    setDay((d) => {
      const next = d + 1
      setJobs((js) => tick(js, next))
      return next
    })
  }, [])

  /** The owner's answer to a downstream flag. Proceeding unblocks; a reshoot costs a day. */
  const resolve = useCallback((goodId: string, choice: 'proceed' | 'reshoot') => {
    setJobs((js) => js.map((j) => {
      if (j.goodId !== goodId) return j
      return {
        ...j,
        state: 'doing',
        flag: null,
        startedDay: choice === 'reshoot' ? day + 1 : (j.startedDay ?? day),
      }
    }))
    if (choice === 'reshoot') setDay((d) => d + 1)
  }, [day])

  const finished = useMemo(() => allDone(jobs), [jobs])
  useEffect(() => {
    if (finished && step === 'relay') { /* owner taps through; never auto-advance past a result */ }
  }, [finished, step])

  const restart = useCallback(() => {
    setStep('shelf'); setCampaign(null); setPicks({}); setJobs([]); setDay(0); setNote('')
    setLevel('standard')
  }, [])

  return (
    <div style={{
      minHeight: '100dvh', background: C.paper, color: C.ink,
      fontFamily: "ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      {/* A phone column, because this is an owner surface and owners are on a phone. */}
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '14px 16px 60px' }}>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, paddingBottom: 14,
        }}>
          <button type="button" onClick={restart}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              display: 'flex', alignItems: 'center', gap: 7, color: C.ink,
            }}>
            <span style={{
              width: 22, height: 22, borderRadius: 7, background: C.green, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 820,
            }}>A</span>
            <span style={{ fontSize: 13, fontWeight: 740, letterSpacing: '-.01em' }}>Apnosh</span>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase',
              color: C.gold, background: C.goldWash, padding: '2px 6px', borderRadius: 99,
            }}>Prototype</span>
          </button>

          <button type="button" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            style={{
              border: `1px solid ${C.line}`, background: C.card, cursor: 'pointer', borderRadius: 99,
              width: 30, height: 30, fontSize: 13, lineHeight: 1, color: C.ink2, fontFamily: 'inherit',
            }} aria-label="Switch theme">
            {mode === 'light' ? '☾' : '☀'}
          </button>
        </div>

        {step === 'shelf' && (
          <Shelf C={C} onPick={openCampaign} onOneOff={openOneOff} />
        )}

        {step === 'brief' && campaign && (
          <Brief
            C={C} campaign={campaign}
            onBack={() => setStep('shelf')}
            onBuild={({ door, budget, date: d, note: n }) => {
              setDate(d); setNote(n)
              // "I have a number" trims from the full plan down until it fits, cheapest-first.
              if (door === 'budget') {
                const chosen: Picks = {}
                campaign.goods.forEach((id) => { chosen[id] = null })
                let spend = 0
                const ordered = [...campaign.levels.full].sort(
                  (a, b) => GOODS[b].lead - GOODS[a].lead,
                )
                ordered.forEach((id) => {
                  const p = defaultPickFor(GOODS[id])
                  const cost = priceOf(id, p)
                  if (spend + cost <= budget) { chosen[id] = p; spend += cost }
                })
                setPicks(chosen)
                setLevel('custom')
              } else {
                applyLevel(campaign, 'standard')
              }
              setStep('spread')
            }}
          />
        )}

        {step === 'spread' && campaign && (
          <Spread
            C={C} campaign={campaign} picks={picks} date={date} note={note}
            level={level}
            onLevel={(l) => applyLevel(campaign, l)}
            onSet={setPick}
            onCast={(id) => { setCasting(id); setStep('cast') }}
            onBook={book}
            onBack={() => setStep(campaign.id.startsWith('one-') ? 'shelf' : 'brief')}
          />
        )}

        {step === 'cast' && casting && (
          <Cast
            C={C} goodId={casting} picks={picks} date={date} note={note}
            onSet={setPick}
            onDone={() => { setCasting(null); setStep('spread') }}
          />
        )}

        {step === 'relay' && (
          <Relay
            C={C} jobs={jobs} picks={picks} day={day} date={date}
            onAdvance={advance} onResolve={resolve}
            onFinish={() => setStep('reckoning')}
          />
        )}

        {step === 'reckoning' && (
          <Reckoning C={C} jobs={jobs} picks={picks} date={date} onAgain={restart} />
        )}

        <div style={{
          marginTop: 30, paddingTop: 16, borderTop: `1px solid ${C.line}`,
          fontSize: 11, color: C.faint, lineHeight: 1.55,
        }}>
          Every price, creator and number here is invented. Nothing forecasts a result: the shop
          shows what gets made, by whom and when, and the reckoning only counts things that
          actually happened.
        </div>
      </div>
    </div>
  )
}

export { CAMPAIGNS }
