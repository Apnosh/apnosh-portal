/**
 * Client-safe tracker types (shared by the server readers + the client components). Kept out of the
 * server-only readers so the UI can import them without pulling in the admin client.
 */
import type { Stage } from './stages'

/** One campaign piece, merged from whichever lane it lives in, deduped so a bridged creator piece
 *  appears exactly once. Every field is real or explicitly null — nothing fabricated. */
export interface TrackerPiece {
  id: string
  orderId: string | null            // the work order, when one backs this piece (drives approve/changes)
  /** the stable campaign piece key this row was minted with (campaign_piece_key): a Content-Menu
   *  line id ('L#0') or the legacy positional 'Video:0'. Lets the per-item detail page find THIS
   *  line's pieces. Null on rows minted before the key existed. */
  pieceKey: string | null
  label: string
  channel: string                   // discipline (Video/Photo/Social/Design)
  who: string                       // real creator name, or the literal "Your team"
  lane: 'creator' | 'team'
  stage: Stage
  stageAtISO: string | null         // the real timestamp that stamped the current stage
  stageAtPrecise: boolean           // false when it came from updated_at (approximate)
  goLiveISO: string | null          // the target/scheduled post date (scheduled_for / target_publish_date / due_date)
  conceptStatus: 'approved' | 'pending' | 'changes' | null
  previewUrl: string | null         // the actual delivered work to view (delivered_url)
  postLink: string | null           // the real live post URL (social_posts.permalink), once posted
  canApprove: boolean               // creator lane + delivered only
  canReviewConcept: boolean
  reach: number | null
  readoutValue: string | null       // e.g. "4.2k reached", once live
  readoutVerdict: 'working' | 'watch' | 'drop' | null
  note: string | null               // owner's last change ask (current note only)
  /** the owner can rate this delivered work now: creator-lane order made by a REAL
   *  vendor (never the internal team), delivered/approved, not yet rated. */
  ratable: boolean
  /** the owner's existing rating for this order (1..5), null when unrated. */
  myStars: number | null
  /** the maker's live rating aggregate — present ONLY when the creator is a real
   *  vendor row with >=1 real rating; null otherwise (nothing is ever fabricated). */
  creatorRating: { avg: number; count: number } | null
}

/** A real, timestamped production event for the activity feed. Derived from real columns; an event
 *  with no backing timestamp is never emitted. `precise=false` means it came from updated_at. */
export interface ActivityEvent {
  id: string
  atISO: string
  precise: boolean
  kind: 'sent' | 'making' | 'delivered' | 'approved' | 'revision' | 'scheduled' | 'posted' | 'started' | 'dropped'
  text: string
  piece: string | null
  link: string | null
}
