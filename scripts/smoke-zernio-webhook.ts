/**
 * The webhook gate, proved rather than assumed.
 *
 * Zernio's spec says HMAC-SHA256 in X-Zernio-Signature and does not say the
 * encoding, so the route accepts hex, base64 and base64url. This asserts all
 * three are accepted, that a `sha256=` prefix is tolerated, and — the part that
 * matters — that a wrong secret, a tampered body and a truncated signature are
 * all rejected.
 */
import { createHmac } from 'node:crypto'
import { signatureMatches } from '../src/app/api/webhooks/zernio/route'

const SECRET = 'test-secret-do-not-use'
const BODY = JSON.stringify({ id: 'evt_1', event: 'webhook.test', account: { profileId: 'p1' } })
const mac = createHmac('sha256', SECRET).update(BODY, 'utf8').digest()

let pass = 0, fail = 0
const check = (name: string, got: boolean, want: boolean) => {
  if (got === want) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} — expected ${want}, got ${got}`) }
}

console.log('accepts:')
check('hex', signatureMatches(BODY, SECRET, mac.toString('hex')).ok, true)
check('base64', signatureMatches(BODY, SECRET, mac.toString('base64')).ok, true)
check('base64url', signatureMatches(BODY, SECRET, mac.toString('base64url')).ok, true)
check('sha256= prefix', signatureMatches(BODY, SECRET, `sha256=${mac.toString('hex')}`).ok, true)
check('surrounding whitespace', signatureMatches(BODY, SECRET, `  ${mac.toString('hex')}  `).ok, true)

console.log('rejects:')
check('wrong secret', signatureMatches(BODY, 'other-secret', mac.toString('hex')).ok, false)
check('tampered body', signatureMatches(BODY.replace('evt_1', 'evt_2'), SECRET, mac.toString('hex')).ok, false)
check('truncated signature', signatureMatches(BODY, SECRET, mac.toString('hex').slice(0, 40)).ok, false)
check('empty signature', signatureMatches(BODY, SECRET, '').ok, false)
check('one flipped char', signatureMatches(BODY, SECRET, 'f' + mac.toString('hex').slice(1)).ok, false)

console.log(`\nreported encoding for a hex signature: ${signatureMatches(BODY, SECRET, mac.toString('hex')).shape}`)
console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
