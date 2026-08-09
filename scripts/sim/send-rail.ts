/**
 * SEND RAIL GOLDENS — npm run sim:send-rail
 *
 * Pure locks on rail-core: the kill switch fails closed, unsubscribe tokens
 * are tamper-evident, every rendered email carries its unsubscribe link and
 * escapes owner content, preflight refuses exactly the unfixable states, and
 * only a pure-email draft rides the rail.
 */
import { Suite } from './lib'
import {
  emailRailEnabled, unsubToken, verifyUnsubToken, chunk, escapeHtml,
  renderEmailHtml, isEmailDraft, emailPreflight,
} from '@/lib/email/rail-core'

const s = new Suite()

s.group('Kill switch: fails closed, opens only on purpose')
{
  s.check('key + switch on -> open', emailRailEnabled({ RESEND_API_KEY: 'k', EMAIL_SEND_ENABLED: 'true' }) === true)
  s.check('key alone -> shut (a key is not consent to blast)', emailRailEnabled({ RESEND_API_KEY: 'k' }) === false)
  s.check('switch alone -> shut (nothing to send with)', emailRailEnabled({ EMAIL_SEND_ENABLED: 'true' }) === false)
  s.check('typo value -> shut', emailRailEnabled({ RESEND_API_KEY: 'k', EMAIL_SEND_ENABLED: 'True' }) === false)
  s.check('empty env -> shut', emailRailEnabled({}) === false)
}

s.group('Unsubscribe tokens: signed, tamper-evident, forever')
{
  const id = '85330edd-d7a6-4ff6-96d0-85b8ae8f70aa'
  const t = unsubToken(id, 'secret-a')
  s.check('roundtrip returns the contact id', verifyUnsubToken(t, 'secret-a') === id)
  s.check('wrong secret refuses', verifyUnsubToken(t, 'secret-b') === null)
  s.check('tampered id refuses', verifyUnsubToken(`x${t.slice(1)}`, 'secret-a') === null)
  s.check('tampered signature refuses', verifyUnsubToken(t.slice(0, -2) + 'zz', 'secret-a') === null)
  s.check('garbage refuses without crashing', verifyUnsubToken('nope', 'secret-a') === null && verifyUnsubToken('', 'secret-a') === null && verifyUnsubToken('.', 'secret-a') === null)
}

s.group('The template: unsubscribe always present, owner words always escaped')
{
  const html = renderEmailHtml({
    bodyText: 'Taco night is back!\n\nCome see us <Friday> & Saturday.',
    businessName: 'Yellowbee Market & Cafe',
    unsubUrl: 'https://portal.apnosh.com/u/tok.sig',
  })
  s.check('unsubscribe link is in every email', html.includes('https://portal.apnosh.com/u/tok.sig') && html.includes('Unsubscribe'))
  s.check('the sender line names the business', html.includes('Yellowbee Market &amp; Cafe'))
  s.check('owner content is escaped, not injected', html.includes('&lt;Friday&gt;') && !html.includes('<Friday>'))
  s.check('paragraph breaks become paragraphs', (html.match(/<p /g) ?? []).length >= 2)
  s.check('escapeHtml covers the four', escapeHtml('<&">') === '&lt;&amp;&quot;&gt;')
}

s.group('Only a pure email draft rides the rail')
{
  s.check('exactly [email] -> yes', isEmailDraft(['email']) === true)
  s.check('email mixed with social -> no (different shapes)', isEmailDraft(['email', 'instagram']) === false)
  s.check('social only -> no', isEmailDraft(['instagram']) === false)
  s.check('empty / null -> no', isEmailDraft([]) === false && isEmailDraft(null) === false && isEmailDraft(undefined) === false)
}

s.group('Preflight: refuses exactly what a retry cannot fix')
{
  const good = { subject: 'Taco night', body: 'Come on down.' }
  s.check('rail shut -> rail_closed even with a perfect draft', (() => {
    const r = emailPreflight(good, 10, false)
    return !r.ok && r.code === 'rail_closed'
  })())
  s.check('no subject -> no_subject', (() => {
    const r = emailPreflight({ subject: '  ', body: 'x' }, 10, true)
    return !r.ok && r.code === 'no_subject'
  })())
  s.check('no body -> no_caption', (() => {
    const r = emailPreflight({ subject: 'x', body: null }, 10, true)
    return !r.ok && r.code === 'no_caption'
  })())
  s.check('empty list -> no_audience', (() => {
    const r = emailPreflight(good, 0, true)
    return !r.ok && r.code === 'no_audience'
  })())
  s.check('all good -> ok', emailPreflight(good, 1, true).ok === true)
}

s.group('Batching: chunks of 100, nothing dropped')
{
  const arr = Array.from({ length: 250 }, (_, i) => i)
  const groups = chunk(arr, 100)
  s.check('250 -> 100 + 100 + 50', groups.length === 3 && groups[0].length === 100 && groups[2].length === 50)
  s.check('order and total preserved', groups.flat().length === 250 && groups.flat()[249] === 249)
  s.check('empty stays empty', chunk([], 100).length === 0)
}

const ok = s.report('Send rail (pure core)')
process.exit(ok ? 0 : 1)
