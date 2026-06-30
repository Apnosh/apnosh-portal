/**
 * The Content Menu manifest — the per-type config that drives the menu cards and the
 * add-piece modal. Pure + client-safe (no server imports). One source so the menu, the
 * modal, and the cart agree on what each piece asks for, who can make it, and whether it
 * needs a visit.
 *
 * Design rules (from the design panel):
 *  - ONE required field gates Add per type (the dish for a shot, the offer for a send).
 *  - Who-makes-it is the required modifier, shown LAST, pre-defaulted.
 *  - First iteration: everything is serviced by us or a contractor — no self-service.
 *    Shots (reel/photo/story) can go to a creator or your team. Remote pieces
 *    (post/email/sms) are your team or an AI draft (creator needs a shoot).
 *  - On-site pieces (reel/photo, a story filmed on location) share a Shoot Day.
 */
import { CONTENT_META, isOnSitePiece } from '@/lib/campaigns/catalog'
import type { PieceBrief, PieceProducer } from '@/lib/campaigns/types'

export type BriefFieldKey = 'featuring' | 'offer' | 'subject' | 'cta' | 'mustSay' | 'avoid' | 'notes'

export interface BriefField {
  key: BriefFieldKey
  label: string
  placeholder?: string
  /** 'dish' renders the menu-item picker (with free-text fallback); others are inputs. */
  kind: 'dish' | 'line' | 'multiline'
}

export interface HandlerOption {
  value: PieceProducer
  label: string
  /** Sub-label, e.g. the creator name or "Apnosh makes it for you". */
  sub: string
  /** 'piece' = the piece price; 'free' = $0 (DIY); 'ai' = the flat AI-draft fee. */
  cost: 'piece' | 'free' | 'ai'
}

export interface PieceTypeDef {
  type: string
  /** Owner-language name, e.g. "A reel". */
  label: string
  group: 'get-seen' | 'reach-list'
  /** Tabler icon name (ti-…). */
  icon: string
  /** Plain "what it does". */
  does: string
  /** The piece price in dollars (from CONTENT_META). */
  price: number
  /** Always on-site (a person films it) — reel/photo. Story is conditional (see toggle). */
  onSiteAlways: boolean
  /** Story only: offer a "film it here / I'll send a clip" toggle that sets captureMode. */
  captureToggle: boolean
  /** The fields that hard-block Add (the one execution-blocking input, + subject/cta on sends). */
  required: BriefField[]
  /** Optional refinements behind the "Add details" drawer. */
  optional: BriefField[]
  /** Who can make this piece, in display order. The first is the default. */
  handlers: HandlerOption[]
}

const F = {
  featuringDish: { key: 'featuring', label: "What's the star?", placeholder: 'Pick a dish', kind: 'dish' } as BriefField,
  offerRequired: { key: 'offer', label: "What's the reason to come?", placeholder: 'e.g. $1 oysters til 6pm', kind: 'line' } as BriefField,
  offerOptional: { key: 'offer', label: 'The hook / offer', placeholder: 'optional, e.g. $1 oysters til 6pm', kind: 'line' } as BriefField,
  subject: { key: 'subject', label: 'Subject line', placeholder: 'What lands in the inbox', kind: 'line' } as BriefField,
  cta: { key: 'cta', label: 'What should they do?', placeholder: 'e.g. a link, or "reply to book"', kind: 'line' } as BriefField,
  mustSay: { key: 'mustSay', label: 'Must say', placeholder: 'anything that has to be in it', kind: 'line' } as BriefField,
  avoid: { key: 'avoid', label: 'Avoid', placeholder: 'anything to keep out', kind: 'line' } as BriefField,
  notes: { key: 'notes', label: 'Notes', placeholder: 'timing, posting preferences…', kind: 'multiline' } as BriefField,
}

/** A creator handler shows the real top creator's name at the modal; the manifest holds
 *  the generic label and the modal enriches `sub` when it can. */
const creator = (sub = 'a marketplace creator'): HandlerOption => ({ value: 'creator', label: 'A creator', sub, cost: 'piece' })
const team = (sub = 'Apnosh makes it for you'): HandlerOption => ({ value: 'team', label: 'Your team', sub, cost: 'piece' })
const ai = (): HandlerOption => ({ value: 'ai', label: 'AI draft', sub: 'free on premium · a small fee otherwise', cost: 'ai' })

function def(type: string, partial: Omit<PieceTypeDef, 'price' | 'does'>): PieceTypeDef {
  const m = CONTENT_META[type]
  return { ...partial, price: m?.price ?? 0, does: m?.does ?? '' }
}

export const PIECE_DEFS: PieceTypeDef[] = [
  def('reel', {
    type: 'reel', label: 'A reel', group: 'get-seen', icon: 'ti-video', onSiteAlways: true, captureToggle: false,
    required: [F.featuringDish], optional: [F.offerOptional, F.mustSay, F.avoid, F.notes],
    handlers: [creator(), team()],
  }),
  def('photo', {
    type: 'photo', label: 'A photo', group: 'get-seen', icon: 'ti-photo', onSiteAlways: true, captureToggle: false,
    required: [F.featuringDish], optional: [F.mustSay, F.avoid, F.notes],
    handlers: [creator(), team()],
  }),
  def('story', {
    type: 'story', label: 'A story', group: 'get-seen', icon: 'ti-circle-dashed', onSiteAlways: false, captureToggle: true,
    required: [F.featuringDish], optional: [F.offerOptional, F.notes],
    handlers: [creator(), team()],
  }),
  def('post', {
    type: 'post', label: 'A post', group: 'get-seen', icon: 'ti-layout-grid', onSiteAlways: false, captureToggle: false,
    required: [], optional: [F.offerOptional, F.mustSay, F.avoid, F.notes],
    handlers: [team(), ai()],
  }),
  def('email', {
    type: 'email', label: 'An email', group: 'reach-list', icon: 'ti-mail', onSiteAlways: false, captureToggle: false,
    required: [F.offerRequired, F.subject], optional: [F.mustSay, F.avoid, F.notes],
    handlers: [team(), ai()],
  }),
  def('sms', {
    type: 'sms', label: 'A text', group: 'reach-list', icon: 'ti-message', onSiteAlways: false, captureToggle: false,
    required: [F.offerRequired, F.cta], optional: [F.notes],
    handlers: [team(), ai()],
  }),
]

export const PIECE_BY_TYPE: Record<string, PieceTypeDef> = Object.fromEntries(PIECE_DEFS.map((d) => [d.type, d]))

export const MENU_GROUPS: { key: 'get-seen' | 'reach-list'; label: string; defs: PieceTypeDef[] }[] = [
  { key: 'get-seen', label: 'Get seen', defs: PIECE_DEFS.filter((d) => d.group === 'get-seen') },
  { key: 'reach-list', label: 'Reach your list', defs: PIECE_DEFS.filter((d) => d.group === 'reach-list') },
]

/** Whether THIS piece, with the brief it currently has, needs an on-site visit. Wraps
 *  isOnSitePiece so the menu/modal/cart all classify a piece the same way. */
export function pieceNeedsVisit(type: string, brief?: PieceBrief | null): boolean {
  return isOnSitePiece(type, brief)
}
