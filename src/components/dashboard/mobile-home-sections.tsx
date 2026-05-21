'use client'

/**
 * Mobile home sections — live React port of the approved preview:
 * Needs you → This week → Your channels → Plan.
 *
 * Every section is data-driven and handles its real-world states:
 *   Needs you   — empty ("all caught up") / 1–3 / overflow ("View all N")
 *   This week   — paid (named strategist) / self-serve / zero week
 *   Channels    — connected (sparkline + delta) / not connected (Connect)
 *   Plan        — opportunity cards / empty ("Plan your next move")
 */

import { MhIcon, MhSpark } from './mh-icons'

export interface NeedItem { title: string; time?: string | null; icon: string }
export interface PlanItem { when: string; title: string; hint: string; cta: string; icon: string }
export interface Channel { name: string; sub: string; value: string; delta: string; dir: 'up' | 'down'; spark: number[]; connected: boolean; href?: string }
export interface WeekRecap { shipped: number; items: string; strategist: string | null }
export interface HomeSectionsData { needs: NeedItem[]; plan: PlanItem[]; channels: Channel[]; week: WeekRecap }

function NeedsSection({ needs }: { needs: NeedItem[] }) {
  const n = needs.length
  return (
    <section className="sx">
      <div className="sx-head">
        <p className="t-eyebrow">{n ? `Needs you · ${n}` : 'Needs you'}</p>
        {n > 0 && <button className="btn-quiet" type="button">Inbox <MhIcon name="chevRight" sw={2.2} /></button>}
      </div>
      {n === 0 ? (
        <div className="allclear">
          <span className="ac-ic"><MhIcon name="check" sw={2.4} /></span>
          <div><p className="ac-t">You&rsquo;re all caught up</p><p className="ac-s">Nothing needs your attention right now</p></div>
        </div>
      ) : (
        <>
          <ul className="list">
            {needs.slice(0, 3).map((t, i) => (
              <li key={i}>
                <button className="row" type="button">
                  <span className="row-ic"><MhIcon name={t.icon} /></span>
                  <p className="rowt">{t.title}</p>
                  {t.time ? <span className="chip">{t.time}</span> : null}
                  <MhIcon name="chevRight" className="rchev" sw={1.8} />
                </button>
              </li>
            ))}
          </ul>
          {n > 3 && <button className="morebtn" type="button">View all {n}<MhIcon name="chevRight" sw={2.2} /></button>}
        </>
      )}
    </section>
  )
}

function WeekSection({ week }: { week: WeekRecap }) {
  const paid = !!week.strategist
  const lead = paid
    ? <span className="avatar">{week.strategist!.charAt(0)}</span>
    : <span className="recap-ic"><MhIcon name="check" sw={1.9} /></span>
  let line: React.ReactNode, brk: React.ReactNode
  if (week.shipped > 0) {
    const n = <b className="hl">{week.shipped} update{week.shipped === 1 ? '' : 's'}</b>
    line = paid ? <><b>{week.strategist}</b> shipped {n} for you this week</> : <>You shipped {n} this week</>
    brk = <p className="recap-break">{week.items}</p>
  } else {
    line = paid ? <><b>{week.strategist}</b> is working on this week&rsquo;s updates</> : <>Your week is just getting started</>
    brk = <p className="recap-break">We&rsquo;ll recap what gets done right here.</p>
  }
  const cta = paid ? `Message ${week.strategist}` : 'See your activity'
  return (
    <section className="sx">
      <div className="sx-head"><p className="t-eyebrow">This week</p></div>
      <div className="recap">
        <div className="recap-body">
          {lead}
          <div className="recap-txt"><p className="recap-line">{line}</p>{brk}</div>
        </div>
        <button className="recap-cta" type="button">{cta}<MhIcon name="chevRight" sw={2.2} /></button>
      </div>
    </section>
  )
}

function ChannelsSection({ channels }: { channels: Channel[] }) {
  if (!channels.length) return null
  return (
    <section className="sx">
      <div className="sx-head"><p className="t-eyebrow">Your channels</p><button className="btn-quiet" type="button">Analytics <MhIcon name="chevRight" sw={2.2} /></button></div>
      <div className="channels">
        {channels.map((c, i) => (
          c.connected ? (
            <a key={i} className="chan" href={c.href ?? '#'}>
              <div className="chan-l"><span className="chan-n">{c.name}</span><span className="chan-s">{c.sub}</span></div>
              <div className="chan-spark"><MhSpark vals={c.spark} dir={c.dir} /></div>
              <div className="chan-r"><span className="chan-v">{c.value}</span><span className={`chan-d ${c.dir}`}>{c.delta}</span></div>
              <MhIcon name="chevRight" className="chan-chev" sw={1.8} />
            </a>
          ) : (
            <a key={i} className="chan chan-off" href={c.href ?? '#'}>
              <div className="chan-l"><span className="chan-n">{c.name}</span><span className="chan-s">Not connected</span></div>
              <span className="chan-connect">Connect</span>
            </a>
          )
        ))}
      </div>
    </section>
  )
}

function PlanSection({ plan }: { plan: PlanItem[] }) {
  return (
    <section className="plan">
      <div className="plan-head"><p className="t-eyebrow">Plan</p><button className="btn-quiet" type="button">Calendar <MhIcon name="chevRight" sw={2.2} /></button></div>
      {plan.length === 0 ? (
        <div className="plan-scroll">
          <button className="planempty" type="button">
            <span className="pe-ic"><MhIcon name="calplus" sw={2} /></span>
            <div><p className="pe-t">Plan your next move</p><p className="pe-s">Get ahead of holidays and slow days</p></div>
          </button>
        </div>
      ) : (
        <div className="plan-scroll">
          {plan.map((p, i) => (
            <div key={i} className="plan-card">
              <div className="plan-top"><span className="plan-ic"><MhIcon name={p.icon} sw={1.9} /></span><span className="plan-when">{p.when}</span></div>
              <p className="plan-title">{p.title}</p>
              <p className="plan-hint">{p.hint}</p>
              <span className="plan-cta">{p.cta} ›</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function MobileHomeSections({ data }: { data: HomeSectionsData }) {
  return (
    <div className="m-home">
      <NeedsSection needs={data.needs} />
      <WeekSection week={data.week} />
      <ChannelsSection channels={data.channels} />
      <PlanSection plan={data.plan} />
    </div>
  )
}
