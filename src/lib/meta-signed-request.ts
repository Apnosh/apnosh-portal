/**
 * Helpers for Meta's "signed_request" callbacks (deauthorize +
 * data-deletion request URLs in the Meta App dashboard).
 *
 * Meta posts a form-encoded body with a single field `signed_request`
 * formatted as `<signature>.<base64url-json-payload>`. The signature is
 * HMAC-SHA256 of the payload string using the app secret.
 *
 * Reference:
 *   https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow#parsingsr
 */

import { createHmac, randomUUID } from 'node:crypto'

export interface MetaSignedRequest {
  algorithm: 'HMAC-SHA256'
  user_id: string
  issued_at?: number
  /* Meta sometimes includes a profile_id field on data-deletion requests. */
  profile_id?: string
}

/**
 * Verify the signed_request body and return the parsed payload, or null
 * if the signature is invalid. Caller should also check `algorithm`.
 */
export function verifyMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequest | null {
  const [encodedSig, payload] = signedRequest.split('.')
  if (!encodedSig || !payload) return null

  const expected = createHmac('sha256', appSecret)
    .update(payload)
    .digest('base64url')

  if (encodedSig !== expected) return null

  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as MetaSignedRequest
    if (parsed.algorithm !== 'HMAC-SHA256') return null
    if (!parsed.user_id) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Generate a confirmation code Meta can use to track the deletion.
 * Stable, URL-safe, short enough to display on the status page.
 */
export function newConfirmationCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

/**
 * Standard JSON shape Meta expects in response to both callbacks.
 */
export function buildMetaCallbackResponse(confirmationCode: string, statusUrl: string) {
  return {
    url: `${statusUrl}?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  }
}
