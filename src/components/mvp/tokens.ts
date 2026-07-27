/**
 * THE PALETTE. One file, so "change the design" is one edit rather than a search.
 *
 * WHY THIS EXISTS, in the exact words of the problem it solves. walkthrough-kit.tsx was written to
 * stop the setup lanes drifting apart, and its own header says why: without it the third card would
 * "have made three versions of 'the look' that drift apart the first time anyone adjusts a radius."
 * That was right. But the kit then declared its own palette, verbatim-copied from one screen, while
 * the portal shell in mvp-detail.tsx kept a different one under the same name `C` — and the drift
 * the kit prevented one level down happened one level up instead:
 *
 *     greenDk    kit #2f8f70   shell #2e9a78
 *     greenSoft  kit #eef8f4   shell #eaf7f3
 *
 * Nobody chose those differences. They are the residue of two honest copy-pastes, and with nine more
 * setup cards coming they would have become the thing every new card copied from whichever file it
 * happened to import.
 *
 * The shell's values win, on weight: 37 files import the shell's `C`, four import the kit's. So the
 * four walkthroughs shift by a hair on two greens, deliberately, once.
 *
 * NOT A CLIENT MODULE, and that is load-bearing. mvp-detail.tsx carries 'use client', which means a
 * SERVER component importing `C` from it gets `undefined` — silently, rendering
 * `border: 0.5px solid undefined` with no complaint from tsc or the build. That has already
 * happened once. Plain constants belong in a plain module so either side can read them.
 */

/** The one palette. Everything owner-facing draws from here. */
export const C = {
  /* brand */
  green: '#4abd98',
  greenDk: '#2e9a78',
  greenSoft: '#eaf7f3',

  /* type + rules */
  ink: '#1d1d1f',
  mute: '#6e6e73',
  faint: '#aeaeb2',
  line: '#e6e6ea',
  bg: '#f5f5f7',

  /* something is wrong. `red` and `coral` are the same colour under two names, kept because 41
   * files between them already say one or the other; new code should prefer `coral`. */
  coral: '#c0564f',
  coralSoft: '#fdeeee',
  red: '#c0564f',
  redSoft: '#fdeeee',

  /* something needs attention. These two ambers are genuinely different shades doing different
   * jobs — the walkthroughs use a lighter one inside panels, the shell a darker one for pill text
   * on a soft fill — so they are named apart rather than silently merged. Worth an owner's eye at
   * some point; not worth guessing at now. */
  amber: '#e0a13a',
  amberSoft: '#fdf6e9',

  /* ── roles the setup walkthroughs actually need ──────────────────────────────────────────────
   * These came out of gbp-fixer, where they were loose hex values. They are named for the job they
   * do rather than the colour they are, because the next card needs the same jobs: a status chip on
   * a diagnosed section, an unfilled progress rail, and the two row states. */

  /** A diagnosed section that works but could be better. A THIRD amber, and the honest note is that
   *  nobody chose to have three: `amber` above is the kit's, `AMBER_DK` below is the shell's, and
   *  this is the one the profile walkthrough has always used for its status chips. Unifying them is
   *  a visible brand change, so they are named apart and left for an owner's eye rather than
   *  merged on a guess. */
  warnInk: '#9a6b17',
  warnFill: '#faf1de',
  /** A section we could not read at all. Deliberately grey, not amber: unknown is not a warning. */
  unknownFill: '#f0f0f3',

  /** The unfilled part of a progress rail. */
  track: '#e9e9ee',
  /** A tappable row, under the finger and under the pointer. */
  rowActive: '#f1f5f4',
  rowHover: '#f7faf9',
} as const

/** The display face. Falls back through Inter to the system stack. */
export const DISPLAY = "'Cal Sans','Inter',sans-serif"

/** Amber for warning / due / pending states in the portal shell. Kept out of `C` so the core token
 *  map stays the brand greens plus coral, which is how the shell has always read. */
export const AMBER = '#bd7e16'
export const AMBER_DK = '#8a5a0c'
export const AMBER_SOFT = '#fbf0da'
