/**
 * plan-inputs — everything the monthly plan needs to know, and where each piece came from.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: never ask an owner something the portal already knows.
 *
 * Onboarding already collects almost all of it — the goal, the budget, what they are known for, who
 * they are for, which nights are slow, the menu, what makes them different — and the connection
 * tables already know which channels are live. A form that asks those again is not thorough, it is
 * a form that did not read its own database, and it teaches the owner that answering questions here
 * does not stick.
 *
 * So every input carries its SOURCE, and the form does one of three things with it:
 *   known      we have it, from onboarding or a live connection -> SHOW it, let them change it
 *   guessed    we have a default standing in for a real answer   -> CONFIRM it, do not assume
 *   missing    genuinely absent                                  -> ASK, or RECOMMEND a fix
 *
 * `guessed` is the important one and the easiest to get wrong. getBusinessProfile().goalKey returns
 * 'new-customers' both when the owner really chose it and when no goal row exists at all, so a naive
 * read cannot tell a real answer from a fallback. Collapsing those two is how a form ends up
 * confidently building a plan around something nobody ever said.
 *
 * CLIENT-SAFE: types + pure resolvers only. The server reader that fills this lives in
 * src/lib/dashboard/get-plan-inputs.ts; this module never touches IO, so the form, the composer and
 * the tests all agree on one shape.
 */

import type { GoalKey } from '@/lib/campaigns/types'

export type Source = 'onboarding' | 'connection' | 'menu' | 'guessed' | 'missing'

/** One thing we need, plus an honest account of how we came by it. */
export interface Input<T> {
  value: T | null
  source: Source
  /** what to show the owner as the answer, in their words */
  label?: string
  /** where they set it, so "change this" goes somewhere real */
  href?: string
}

export const known = <T,>(value: T, source: Source, label?: string, href?: string): Input<T> => ({ value, source, label, href })
export const missing = <T,>(href?: string): Input<T> => ({ value: null, source: 'missing', href })

/** Do we actually have an answer, or are we standing in for one? */
export function isKnown(i: Input<unknown>): boolean {
  return i.value != null && i.source !== 'missing' && i.source !== 'guessed'
}

/* ── channels ───────────────────────────────────────────────────────────────────────────── */

export interface ChannelState {
  key: string
  name: string
  connected: boolean
  /** can we actually publish to it once connected, or is it read-only for us today */
  canPost: boolean
  /** plain sentence: what NOT connecting it costs them, in plan terms */
  costOfMissing: string
  href: string
}

/* ── the whole input set ────────────────────────────────────────────────────────────────── */

export interface PlanInputs {
  /** the enum the composer needs */
  goal: Input<GoalKey>
  /** the owner's own words for it, from the onboarding chip */
  goalWords: Input<string>
  /** dollars a month they said they could spend */
  budget: Input<number>
  /** what they are known for: signature items + anything flagged featured on the real menu */
  knownFor: Input<string[]>
  /** what makes them different, in their words */
  standsOut: Input<string>
  /** who they are for */
  audience: Input<string[]>
  /** which nights are slow, if they told us */
  slowDays: Input<string[]>
  channels: ChannelState[]
  /** the real menu, so "what should we lead with" can offer real dishes */
  menu: { id: string; name: string; featured: boolean }[]
}

/* ── what is still genuinely needed ─────────────────────────────────────────────────────── */

export interface Gap {
  key: 'goal' | 'budget' | 'knownFor' | 'audience'
  /** the question, in the owner's language */
  ask: string
  /** why the plan is worse without it, concretely. Never "to help us serve you better". */
  why: string
  /** true when we have a stand-in they should confirm rather than an empty field */
  confirm: boolean
}

/**
 * The only questions worth putting in front of someone.
 *
 * Ordered by how much the plan changes without them: the goal decides WHICH services get picked, the
 * budget decides HOW MANY, and the rest decide what the work says. A gap that only affects wording
 * should never be asked before one that affects the whole shape.
 */
export function gapsIn(inputs: PlanInputs): Gap[] {
  const out: Gap[] = []

  if (!isKnown(inputs.goal)) {
    out.push({
      key: 'goal',
      ask: 'What do you most want more of?',
      why: 'This decides which services go in the plan at all. It is the one answer that changes everything below it.',
      confirm: inputs.goal.source === 'guessed',
    })
  }
  if (!isKnown(inputs.budget)) {
    out.push({
      key: 'budget',
      ask: 'What can you spend a month?',
      why: 'This decides how much of the plan we can actually do. Without it we would be guessing at the size.',
      confirm: false,
    })
  }
  if (!isKnown(inputs.knownFor)) {
    out.push({
      key: 'knownFor',
      ask: 'What should we lead with?',
      why: 'Every post, photo and listing needs something specific to point at. Without it the work is generic, which is the most common reason this kind of plan does nothing.',
      confirm: false,
    })
  }
  if (!isKnown(inputs.audience)) {
    out.push({
      key: 'audience',
      ask: 'Who are you trying to reach?',
      why: 'Changes the wording and where things run. The plan still works without it, just blunter.',
      confirm: false,
    })
  }
  return out
}

/** Everything we DO know, ready to show back as facts rather than questions. */
export function knownIn(inputs: PlanInputs): { key: string; label: string; value: string; href?: string }[] {
  const rows: { key: string; label: string; value: string; href?: string }[] = []
  const push = <T,>(key: string, label: string, i: Input<T>, fmt: (v: T) => string) => {
    if (isKnown(i)) rows.push({ key, label, value: i.label ?? fmt(i.value as T), href: i.href })
  }
  push('goal', 'What you want', inputs.goalWords, String)
  push('budget', 'What you can spend', inputs.budget, (v) => '$' + Number(v).toLocaleString('en-US') + ' a month')
  push('knownFor', 'Known for', inputs.knownFor, (v) => (v as string[]).join(', '))
  push('standsOut', 'What makes you different', inputs.standsOut, String)
  push('audience', 'Who you are for', inputs.audience, (v) => (v as string[]).join(', '))
  push('slowDays', 'Your slow days', inputs.slowDays, (v) => (v as string[]).join(', '))
  return rows
}

/**
 * Channels worth connecting, and what each one costs the plan while it is not.
 *
 * This is the half of the old first question that was worth keeping. "What have you already got?"
 * was the wrong shape because we can see the answer; "this one is not connected, and here is
 * precisely what your plan loses because of it" is the same information pointed the right way.
 */
export function connectRecommendations(inputs: PlanInputs): ChannelState[] {
  return inputs.channels.filter((c) => !c.connected && c.canPost)
}

/** How much of what we need we actually have. Drives the "6 of 8" reassurance on the form. */
export function completeness(inputs: PlanInputs): { have: number; total: number } {
  const fields = [inputs.goal, inputs.budget, inputs.knownFor, inputs.standsOut, inputs.audience, inputs.slowDays]
  return { have: fields.filter(isKnown).length, total: fields.length }
}
