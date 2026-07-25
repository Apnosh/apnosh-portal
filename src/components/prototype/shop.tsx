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
import { DISPLAY, Motion, TOKENS, UI, type Mode, type Tokens } from './kit'
import {
  Brief, Browse, Cast, Shelf, Spread, defaultPickFor, priceOf, type Pick, type Picks,
} from './screens-buy'
import { Relay, Reckoning, allDone, buildJobs, tick, type Job } from './screens-run'

type Step = 'shelf' | 'brief' | 'browse' | 'spread' | 'cast' | 'relay' | 'reckoning'
type Level = 'lean' | 'standard' | 'full' | 'custom'

/** A one-off is a real campaign with exactly one thing in it. Same machinery, smaller spread. */
function oneOffCampaign(goodId: string): Campaign {
  const g = GOODS[goodId]
  return {
    id: `one-${goodId}`,
    title: g.name,
    // A single piece has no campaign of its own to borrow a colour world from, so it gets
    // the house one: warm, neutral, and clearly not one of the five outcomes.
    hue: ['#241d16', '#8a7350'],
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
      minHeight: '100dvh', background: C.paper, color: C.ink, fontFamily: UI,
      WebkitFontSmoothing: 'antialiased',
      // a soft warm bloom at the top, so the page has a light source rather than a flat fill
      backgroundImage: mode === 'dark'
        ? `radial-gradient(120% 46% at 50% -8%, ${C.brassSoft} 0%, transparent 62%)`
        : `radial-gradient(120% 46% at 50% -8%, #FFFDF6 0%, transparent 62%)`,
    }}>
      <Motion />
      {/* A phone column, because this is an owner surface and owners are on a phone. */}
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '16px 18px 64px' }}>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, paddingBottom: 20,
        }}>
          <button type="button" onClick={restart}
            style={{
              border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              display: 'flex', alignItems: 'center', gap: 7, color: C.ink,
            }}>
            <span style={{
              width: 25, height: 25, borderRadius: 8, background: C.ink, color: C.paper,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: DISPLAY, fontSize: 14, lineHeight: 1,
            }}>A</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 17, letterSpacing: '-.01em' }}>Apnosh</span>
            <span style={{
              fontFamily: UI, fontSize: 8.5, fontWeight: 700, letterSpacing: '.16em',
              textTransform: 'uppercase', color: C.brass, border: `1px solid ${C.line}`,
              padding: '3px 7px', borderRadius: 99,
            }}>Prototype</span>
          </button>

          <button type="button" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            className="px-tap"
            style={{
              border: `1px solid ${C.line}`, background: C.card, cursor: 'pointer', borderRadius: 99,
              width: 34, height: 34, fontSize: 14, lineHeight: 1, color: C.ink2, fontFamily: 'inherit',
              boxShadow: C.lift,
            }} aria-label="Switch theme">
            {mode === 'light' ? '☾' : '☀'}
          </button>
        </div>

        {step === 'shelf' && (
          <Shelf C={C} onPick={openCampaign} onOneOff={openOneOff}
            onBrowse={() => { setPicks({}); setStep('browse') }} />
        )}

        {step === 'browse' && (
          <Browse
            C={C} picks={picks} onSet={setPick}
            onBack={() => setStep('shelf')}
            onDone={() => {
              // Whatever they picked IS the campaign. Same spread, same relay, same reckoning.
              const ids = Object.keys(picks).filter((id) => picks[id])
              setCampaign({
                id: 'own', hue: ['#241d16', '#8a7350'], title: 'Your own plan',
                blurb: 'Everything you picked, scheduled in the right order.',
                stage: 'found', dated: true, goods: ids,
                levels: { lean: ids, standard: ids, full: ids },
              })
              setLevel('custom')
              setStep('spread')
            }}
          />
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
          marginTop: 40, paddingTop: 18, borderTop: `1px solid ${C.line}`,
          fontFamily: UI, fontSize: 10.5, color: C.faint, lineHeight: 1.6,
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
