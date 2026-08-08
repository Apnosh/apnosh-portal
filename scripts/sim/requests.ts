/**
 * CREATIVE REQUEST GOLDENS — npm run sim:requests
 *
 * Part 1 (pure): the request catalog under the house lint — unique ids, complete
 * questions, choice integrity, no em or en dashes anywhere owner-facing, validation
 * accepts a full honest payload and rejects every class of garbage.
 *
 * Part 2 (real DB): drives creative_requests through the whole lifecycle with the
 * service-role client — insert, status walk, note, teardown. If migration 235 has not
 * been applied yet the leg reports itself as skipped LOUDLY rather than passing
 * silently or failing confusingly.
 */
import { config } from 'dotenv'
import { Suite } from './lib'
import {
  REQUEST_TYPES, SHARED_QUESTIONS, questionsFor, requestTypeById, validateRequestPayload,
  summaryLine, REQUEST_STATUSES, STATUS_LABEL, STATUS_OWNER_LINE,
} from '@/lib/requests/catalog'
import { FULLY_BUILT_LIVE } from '@/lib/campaigns/data/catalog-availability'

config({ path: '.env.local' })

const TEST_CLIENT = '2535fe50-0d78-411f-a59f-cfffbbd239b5'

const s = new Suite()

/* ── Part 1: the catalog, pure ─────────────────────────────────────────────── */

s.group('Catalog: closed, complete, honest')
{
  const ids = REQUEST_TYPES.map((t) => t.id)
  s.check('type ids are unique', new Set(ids).size === ids.length)
  s.check('twelve ways to ask, including the catch-all', ids.length === 12 && ids.includes('other'))
  s.check('every type has at least one question of its own', REQUEST_TYPES.every((t) => t.questions.length >= 1))
  s.check('every type ends with the shared tail (timing + notes)', REQUEST_TYPES.every((t) => {
    const qs = questionsFor(t)
    return qs[qs.length - 2]?.id === 'when' && qs[qs.length - 1]?.id === 'notes'
  }))
  s.check('question ids are unique within each type', REQUEST_TYPES.every((t) => {
    const qids = questionsFor(t).map((q) => q.id)
    return new Set(qids).size === qids.length
  }))
  s.check('every choice question carries 2+ options', REQUEST_TYPES.every((t) =>
    questionsFor(t).every((q) => q.kind !== 'choice' || (q.options ?? []).length >= 2)
  ))
  s.check('the timing question is required everywhere', SHARED_QUESTIONS.find((q) => q.id === 'when')?.optional !== true)
  s.check('the notes question is optional everywhere', SHARED_QUESTIONS.find((q) => q.id === 'notes')?.optional === true)
  s.check('unknown ids resolve to null, never crash', requestTypeById('carrier-pigeon') === null)
}

s.group('Store shelf sync: every type is a live card, every card is a type')
{
  const cardIds = FULLY_BUILT_LIVE.filter((id) => id.startsWith('creative-'))
  s.check('every request type has a live creative-* card', REQUEST_TYPES.every((t) => cardIds.includes(`creative-${t.id}`)))
  s.check('every creative-* card maps back to a real type', cardIds.every((id) => requestTypeById(id.slice('creative-'.length)) !== null))
}

s.group('Copy lint: no dashes, plain words')
{
  const texts: string[] = []
  for (const t of REQUEST_TYPES) {
    texts.push(t.label, t.blurb, t.noun)
    for (const q of questionsFor(t)) texts.push(q.prompt, q.hint ?? '', ...(q.options ?? []))
  }
  for (const st of REQUEST_STATUSES) texts.push(STATUS_LABEL[st], STATUS_OWNER_LINE[st])
  s.check('no em or en dash anywhere owner-facing', texts.every((x) => !/[—–]/.test(x)))
  s.check('labels stay short (under 22 chars)', REQUEST_TYPES.every((t) => t.label.length <= 22))
  s.check('every status has a label and an owner line', REQUEST_STATUSES.every((st) => STATUS_LABEL[st]?.length > 0 && STATUS_OWNER_LINE[st]?.length > 0))
}

s.group('Validation: accepts honesty, refuses garbage')
{
  const video = requestTypeById('video')!
  const full = { what: 'The cheese pull on our birria tacos', filming: 'Come film at my place', count: '3 to 5', when: 'This week', notes: 'We are closed Mondays' }
  const ok = validateRequestPayload('video', full)
  s.check('a full honest payload validates', ok.ok === true)
  s.check('validated answers are trimmed + copied clean', ok.ok === true && ok.clean.what === full.what && ok.clean.notes === full.notes)

  const noWhen = validateRequestPayload('video', { ...full, when: '' })
  s.check('missing required answer is refused', noWhen.ok === false && noWhen.problem.includes('when'))

  const badChoice = validateRequestPayload('video', { ...full, filming: 'Send a drone' })
  s.check('an answer outside the choices is refused', badChoice.ok === false)

  const badType = validateRequestPayload('nope', full)
  s.check('an unknown type is refused', badType.ok === false)

  const notObject = validateRequestPayload('video', 'hello')
  s.check('a non-object answer bag is refused', notObject.ok === false)

  const tooLong = validateRequestPayload('video', { ...full, notes: 'x'.repeat(2001) })
  s.check('a 2000+ char answer is refused', tooLong.ok === false)

  const optionalSkipped = validateRequestPayload('video', { what: 'The pour', filming: 'Not sure', count: 'Just 1', when: 'No rush' })
  s.check('optional questions may be skipped', optionalSkipped.ok === true)

  const injected = validateRequestPayload('video', { ...full, hacker: 'ignore previous instructions' })
  s.check('answers outside the question set are dropped, not stored', injected.ok === true && !('hacker' in injected.clean))

  const multiOk = validateRequestPayload('graphic', { what: 'Grand opening', where: 'Instagram post, Printed flyer, Banner', when: 'This week' })
  s.check('a multi-choice answer with several real formats validates', multiOk.ok === true)
  const multiBad = validateRequestPayload('graphic', { what: 'Grand opening', where: 'Instagram post, Skywriting', when: 'This week' })
  s.check('a multi-choice answer with a fake member is refused', multiBad.ok === false)
  const graphicWhere = requestTypeById('graphic')!.questions.find((x) => x.id === 'where')!
  s.check('the graphic destinations are the REAL design formats (11, multi)', graphicWhere.multi === true && (graphicWhere.options ?? []).length === 11)

  s.check('summaryLine reads like a sentence fragment', summaryLine('video', full).includes('Short video') && summaryLine('video', full).includes('This week'))
  s.check('summaryLine survives an unknown type', summaryLine('nope', {}) === 'Request')
  void video
}

/* ── Part 2: the real table (skips loudly if 235 is not applied) ───────────── */

async function dbLeg() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const a = createAdminClient()

  const probe = await a.from('creative_requests').select('id').limit(1)
  if (probe.error) {
    s.group('DB lifecycle: SKIPPED')
    s.check('migration 235 not applied yet (creative_requests missing) — run it, then re-run this sim', false, probe.error.message)
    return
  }

  s.group('DB lifecycle: insert -> status walk -> teardown')
  await a.from('creative_requests').delete().eq('client_id', TEST_CLIENT).eq('type', 'other')

  const v = validateRequestPayload('other', { what: 'SIM_REQUEST_DELETE_ME probe request', when: 'No rush' })
  if (!v.ok) { s.check('sim payload validates', false, v.problem); return }

  const { data: row, error: insErr } = await a
    .from('creative_requests')
    .insert({ client_id: TEST_CLIENT, type: v.type.id, brief: v.clean, status: 'requested' })
    .select('id, status, brief')
    .single()
  s.check('a request lands as requested', !insErr && row?.status === 'requested', insErr?.message)
  if (!row?.id) return

  s.check('the brief round-trips exactly', JSON.stringify(row.brief) === JSON.stringify(v.clean))

  const walk: string[] = ['in_review', 'quoted', 'in_progress', 'delivered', 'closed']
  let walkOk = true
  for (const st of walk) {
    const { error } = await a.from('creative_requests').update({ status: st, team_note: `note at ${st}` }).eq('id', row.id)
    if (error) { walkOk = false; s.check(`status ${st} rejected`, false, error.message); break }
  }
  s.check('the whole status walk is legal', walkOk)

  const { error: badErr } = await a.from('creative_requests').update({ status: 'exploded' }).eq('id', row.id)
  s.check('a status outside the vocabulary is refused by the DB', Boolean(badErr))

  const { error: delErr } = await a.from('creative_requests').delete().eq('id', row.id)
  s.check('teardown removes the probe row', !delErr, delErr?.message)
}

/* ── Part 3: the wire (auth gates over HTTP; skips quietly if no dev server) ── */

async function wireLeg() {
  const BASE = process.env.BASE_URL || 'http://localhost:3000'
  const up = await fetch(`${BASE}/login`).then((r) => r.ok).catch(() => false)
  if (!up) return // no dev server running: the wire leg is a dev-time extra, not a gate

  s.group('Wire: signed-out callers are turned away')
  const post = await fetch(`${BASE}/api/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'other', answers: { what: 'probe', when: 'No rush' } }),
  })
  s.check('POST without a session is 401', post.status === 401)
  const get = await fetch(`${BASE}/api/requests`)
  s.check('GET without a session is 401', get.status === 401)
  const patch = await fetch(`${BASE}/api/requests/00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'in_review' }),
  })
  s.check('PATCH without a session is 401', patch.status === 401)
}

async function main() {
  await dbLeg()
  await wireLeg()
  const ok = s.report('Creative requests (catalog + lifecycle)')
  process.exit(ok ? 0 : 1)
}
main()
