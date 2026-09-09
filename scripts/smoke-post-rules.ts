/**
 * The rules file, exercised. Owner decision 2026-09-09: Zernio's numbers are the
 * rule, and anything that does not fit is handed back rather than reshaped. So
 * what matters most here is the SECOND half — that we do not block things we
 * cannot measure, because a false stop looks like a broken feature.
 */
import { blockersFor, willBecome, RULES, type MediaFacts, type Platform } from '../src/lib/channels/post-rules'

const photo = (w = 1080, h = 1350): MediaFacts => ({ isVideo: false, width: w, height: h, duration: 0, size: 2e6 })
const video = (d: number, w = 1080, h = 1920): MediaFacts => ({ isVideo: true, width: w, height: h, duration: d, size: 2e7 })
const ALL: Platform[] = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']

let pass = 0, fail = 0
const t = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a === b) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}\n      want ${b}\n      got  ${a}`) }
}
const names = (m: MediaFacts | null, p = ALL, o = {}) => blockersFor(p, m, o).map((b) => b.platform).sort()

console.log('blocks what it should:')
t('photo: youtube refuses it', names(photo()), ['youtube'])
t('no media: ig, tiktok and youtube refuse', names(null), ['instagram', 'tiktok', 'youtube'])
t('11 photos: ig and fb over their cap', names(photo(), ALL, { imageCount: 11 }), ['facebook', 'instagram', 'youtube'])
t('fb reel, 75s: too long', names(video(75), ['facebook'], { wantsReel: true }), ['facebook'])
t('fb reel, 2s: too short', names(video(2), ['facebook'], { wantsReel: true }), ['facebook'])
t('fb reel, landscape: wrong shape', names(video(20, 1920, 1080), ['facebook'], { wantsReel: true }), ['facebook'])

console.log('does NOT block what it should not:')
t('a normal video is fine everywhere', names(video(30)), [])
t('fb reel, 20s vertical: fine', names(video(20), ['facebook'], { wantsReel: true }), [])
t('unknown duration is not blocked', names(video(0), ['facebook'], { wantsReel: true }), [])
t('unknown dimensions are not blocked', names(video(20, 0, 0), ['facebook'], { wantsReel: true }), [])
t('a photo is fine on ig, fb, tiktok, linkedin', names(photo(), ['instagram', 'facebook', 'tiktok', 'linkedin']), [])
t('text only is fine on fb and linkedin', names(null, ['facebook', 'linkedin']), [])
t('35 photos still fine on tiktok', names(photo(), ['tiktok'], { imageCount: 35 }), [])
t('36 photos is not', names(photo(), ['tiktok'], { imageCount: 36 }), ['tiktok'])

console.log('predicts what a file becomes:')
t('video on instagram', willBecome('instagram', video(30)), 'a Reel')
t('short video on youtube', willBecome('youtube', video(45)), 'a Short')
t('long video on youtube', willBecome('youtube', video(600)), 'a video')
t('photo on instagram', willBecome('instagram', photo()), 'a feed post')
t('story overrides', willBecome('instagram', photo(), { story: true }), 'a Story')

console.log('the rules agree with the schema quotes they carry:')
t('nobody can pick a Reel on instagram', RULES.instagram.selectable, ['Story'])
t('youtube offers no selectable format', RULES.youtube.selectable, [])
t('youtube is video only', RULES.youtube.videoOnly, true)
t('facebook can pick Story and Reel', RULES.facebook.selectable, ['Story', 'Reel'])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
