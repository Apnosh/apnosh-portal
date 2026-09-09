/**
 * IS THE VENDOR'S SCHEMA STILL THE ONE WE BUILT AGAINST?
 * ======================================================
 * A plan in this project cited "checked against Zernio's OpenAPI schema on
 * 2026-09-09". Two rounds later it turned out the schema had 461 paths then and
 * 476 now, carries no date field, and was never stored anywhere -- so the claim
 * could not be checked by anyone, including the person who made it. Three numbers
 * in that plan were wrong and one platform capability was invented outright.
 *
 * So the schema is vendored at vendor/zernio-openapi.json with its sha256 beside
 * it, and this compares the live one against it.
 *
 *   npm run zernio:diff          report what changed
 *   npm run zernio:diff -- --write   accept the live one as the new baseline
 *
 * It reports paths and webhook events added or removed, an info.version change,
 * and -- the part that actually bit us -- changes to the platform DESCRIPTIONS,
 * because that is where Zernio keeps its media rules. "Reels require single
 * vertical video (9:16, 3-60s)" is a sentence in a description field, not a
 * typed constraint, and it is the sentence our composer's rules come from.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/* npm scripts run from the repo root, and import.meta.dirname is not populated
   under every loader this repo uses, so cwd is the reliable anchor. */
const ROOT = process.cwd()
const PINNED = resolve(ROOT, 'vendor/zernio-openapi.json')
const SHAFILE = resolve(ROOT, 'vendor/zernio-openapi.sha256')
const SOURCE = 'https://zernio.com/openapi.json'

/* The descriptions our composer's rules are read from. If one of these changes,
   a rule somewhere is now wrong and nothing else will tell us. */
const WATCHED = [
  'InstagramPlatformData', 'FacebookPlatformData', 'TikTokPlatformData',
  'YouTubePlatformData', 'LinkedInPlatformData', 'GoogleBusinessPlatformData',
  'MediaItem',
]

interface Spec {
  info?: { version?: string }
  paths?: Record<string, unknown>
  webhooks?: Record<string, unknown>
  components?: { schemas?: Record<string, { description?: string }> }
}

function sets(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b)
  return { added: b.filter((x) => !A.has(x)), removed: a.filter((x) => !B.has(x)) }
}

function report(label: string, added: string[], removed: string[]): boolean {
  if (!added.length && !removed.length) { console.log(`  ${label}: unchanged`); return false }
  console.log(`  ${label}: +${added.length} / -${removed.length}`)
  for (const x of added.slice(0, 40)) console.log(`      + ${x}`)
  if (added.length > 40) console.log(`      … ${added.length - 40} more added`)
  for (const x of removed.slice(0, 40)) console.log(`      - ${x}`)
  if (removed.length > 40) console.log(`      … ${removed.length - 40} more removed`)
  return true
}

async function main() {
  const write = process.argv.includes('--write')

  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) { console.error(`Could not fetch the schema: HTTP ${res.status}`); process.exit(2) }
  const liveRaw = Buffer.from(await res.arrayBuffer())
  const liveSha = createHash('sha256').update(liveRaw).digest('hex')

  if (!existsSync(PINNED)) {
    if (!write) { console.error('No pinned schema. Run with --write to create one.'); process.exit(2) }
    writeFileSync(PINNED, liveRaw)
    writeFileSync(SHAFILE, `${liveSha}  zernio-openapi.json\n`)
    console.log(`Pinned a first baseline: ${liveSha}`)
    return
  }

  const pinnedRaw = readFileSync(PINNED)
  const pinnedSha = createHash('sha256').update(pinnedRaw).digest('hex')

  console.log(`pinned  ${pinnedSha}`)
  console.log(`live    ${liveSha}`)
  if (pinnedSha === liveSha) { console.log('\n✓ Identical. Nothing to review.'); return }

  const a = JSON.parse(pinnedRaw.toString()) as Spec
  const b = JSON.parse(liveRaw.toString()) as Spec
  console.log('\nThe schema changed.\n')
  if (a.info?.version !== b.info?.version) {
    console.log(`  info.version: ${a.info?.version} → ${b.info?.version}`)
  } else {
    console.log(`  info.version: unchanged (${a.info?.version}) — a content change WITHOUT a version bump`)
  }

  const p = sets(Object.keys(a.paths ?? {}), Object.keys(b.paths ?? {}))
  report('paths', p.added, p.removed)
  const w = sets(Object.keys(a.webhooks ?? {}), Object.keys(b.webhooks ?? {}))
  report('webhook events', w.added, w.removed)

  console.log('\n  platform rules (the descriptions our composer reads):')
  let rulesMoved = false
  for (const name of WATCHED) {
    const before = a.components?.schemas?.[name]?.description ?? '(absent)'
    const after = b.components?.schemas?.[name]?.description ?? '(absent)'
    if (before === after) { console.log(`    ${name}: unchanged`); continue }
    rulesMoved = true
    console.log(`\n    ⚠ ${name} CHANGED`)
    console.log(`      was: ${before}`)
    console.log(`      now: ${after}\n`)
  }

  if (rulesMoved) {
    console.log('\n  A platform rule moved. Check src/lib/channels/post-rules.ts against it BEFORE accepting this baseline.')
  }
  console.log(`\n  To accept: npm run zernio:diff -- --write`)

  if (write) {
    writeFileSync(PINNED, liveRaw)
    writeFileSync(SHAFILE, `${liveSha}  zernio-openapi.json\n`)
    console.log(`\n✓ Baseline updated to ${liveSha}`)
  } else {
    process.exitCode = 1
  }
}

void main()
