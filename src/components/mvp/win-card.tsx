/**
 * WinCard — the shareable member of the ProofCard family.
 *
 * Same material as proof-card.tsx (white card, the mint label dot, the big number in the same
 * ink, the same shadow) laid out as a 1080 × 1080 square, which is what Instagram, WhatsApp and a
 * phone's photo roll all want. It is not a new component family: nothing here is a colour, a font
 * or a shape the deck does not already use.
 *
 * WHY IT IS HTML AND NOT A GENERATED PNG. Neither @vercel/og nor satori is in node_modules, and
 * the two fonts this kit is allowed to use — Cal Sans and Inter — live as web fonts (globals.css
 * @font-face for Cal Sans, next/font for Inter) with no file in the repo to hand a renderer. A
 * server-rendered PNG would have fallen back to a system font, which is exactly the thing the
 * design gate forbids. So the card is real HTML in the real fonts and the owner's own browser
 * makes the image: print / "save as PDF" on desktop, share sheet on a phone.
 *
 * IT SCALES BY CONTAINER, NOT BY SCREEN. Every size inside is in `cqw` — hundredths of the card's
 * own width — so the 1080-square layout is character-for-character the same on a phone, on a
 * desktop and on paper. One layout, no second set of numbers to keep in step.
 *
 * NO CLIENT DATA BEYOND THE CARD. Business name, the one number, the one line, the month. No
 * client id, no order, no ledger. The public page at /w/[token] renders this and nothing else.
 */

import { t, type Lang } from '@/lib/i18n/t'

export interface WinCardData {
  /** window + surface, e.g. "This week on Google" — written by the proof composer */
  label: string
  /** the number line, e.g. "9 calls · 31 direction taps" */
  big: string
  /** the comparison that gives it meaning */
  context: string
  /** the business, as the owner writes it */
  bizName: string
  /** the month the win happened in, already written out in the reader's language */
  monthLabel: string
}

const CARD_CSS = `
.wincard {
  width: 100%; max-width: 1080px; aspect-ratio: 1 / 1;
  container-type: inline-size;
  box-sizing: border-box;
  display: flex; flex-direction: column;
  background: #ffffff; border-radius: 3.4cqw; overflow: hidden;
  padding: 8cqw 7.4cqw 6.6cqw;
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
  font-family: 'Inter', system-ui, sans-serif;
}
.wincard-label { display: flex; align-items: center; gap: 1.6cqw; font-size: 2.6cqw; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #2e9a78; }
.wincard-dot { width: 1.6cqw; height: 1.6cqw; border-radius: 99px; background: #4abd98; flex: 0 0 auto; }
.wincard-big { font-family: 'Cal Sans', 'Inter', system-ui, sans-serif; font-size: 9.4cqw; line-height: 1.08; letter-spacing: -0.04em; color: #0f6e56; margin-top: 5.2cqw; font-variant-numeric: tabular-nums; }
.wincard-context { font-size: 4cqw; line-height: 1.45; color: #6e6e73; margin-top: 3.4cqw; }
.wincard-rule { height: 1px; background: #e6e6ea; margin-top: auto; }
.wincard-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 3cqw; padding-top: 4cqw; }
.wincard-biz { font-family: 'Cal Sans', 'Inter', system-ui, sans-serif; font-size: 4.4cqw; color: #1d1d1f; letter-spacing: -0.01em; }
.wincard-month { font-size: 3.2cqw; color: #aeaeb2; margin-top: 1cqw; }
.wincard-mark { font-size: 3.2cqw; font-weight: 700; color: #2e9a78; text-align: right; white-space: nowrap; }
@media print {
  .wincard { box-shadow: none; border: 1px solid #e6e6ea; width: 6.6in; max-width: 6.6in; }
}
`

export default function WinCard({ card, lang = 'en' }: { card: WinCardData; lang?: Lang }) {
  const T = (k: string, vars?: Record<string, string | number>) => t(k, lang, vars)
  return (
    <>
      <style>{CARD_CSS}</style>
      <div className="wincard">
        <div className="wincard-label"><span className="wincard-dot" />{card.label}</div>
        <div className="wincard-big">{card.big}</div>
        <div className="wincard-context">{card.context}</div>
        <div className="wincard-rule" />
        <div className="wincard-foot">
          <div>
            <div className="wincard-biz">{card.bizName}</div>
            <div className="wincard-month">{card.monthLabel}</div>
          </div>
          <div className="wincard-mark">{T('Counted by Apnosh')}</div>
        </div>
      </div>
    </>
  )
}
