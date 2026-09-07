import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /r/[code]
 *
 * Public redirect route for tracked links.
 * Increments click count and redirects to original URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  // Where "here" is. NEXT_PUBLIC_APP_URL when it is set, and otherwise the host this request came
  // in on — never the literal string "undefined", which is what an unset variable used to build
  // and which turned every mistyped code into a broken redirect instead of a not-found page.
  const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: link } = await supabase
    .from('tracked_links')
    .select('original_url, click_count')
    .eq('short_code', code)
    .single()

  if (!link) {
    // MOVE 8. No tracked link with this code — it may be an owner's referral code. Tracked links
    // are checked FIRST and are completely unchanged: a referral can never take over a link that
    // already exists. The friend goes to sign up, and the code rides with them in BOTH a query
    // param and a cookie, because signing up moves them to /onboarding/full and a query param does
    // not survive that hop.
    const ref = await referralRedirect(code, base)
    if (ref) return ref
    return NextResponse.redirect(`${base}/not-found`)
  }

  // Increment click count (fire and forget). The 196 RPC is atomic — the old
  // read-then-write lost concurrent clicks; keep it only as the pre-196 fallback.
  supabase
    .rpc('increment_link_clicks', { p_code: code })
    .then(({ error }) => {
      if (error) {
        return supabase
          .from('tracked_links')
          .update({ click_count: (link.click_count || 0) + 1 })
          .eq('short_code', code)
          .then(() => {})
      }
    })

  return NextResponse.redirect(link.original_url)
}

/**
 * An owner's referral link, or NULL when this code is not one (or the loop is shut, in which case
 * a code resolves to nothing and the link 404s exactly as it did before Move 8 existed).
 *
 * The cookie is the part that matters: /signup sends people on to /onboarding/full, and the finish
 * step reads the code back out to say who sent them and to write the referral. Thirty days,
 * lax, not httpOnly — the onboarding screen is the reader and it runs in the browser. It carries
 * a public code, nothing about a person.
 */
async function referralRedirect(rawCode: string, base: string) {
  const { referralsEnabled } = await import('@/lib/referral-gate')
  if (!referralsEnabled()) return null
  const { normalizeCode, isCodeShape } = await import('@/lib/referrals/model')
  const code = normalizeCode(rawCode)
  if (!isCodeShape(code)) return null
  const { clientForCode } = await import('@/lib/referrals/server')
  const from = await clientForCode(code)
  if (!from) return null
  const res = NextResponse.redirect(`${base}/signup?ref=${encodeURIComponent(code)}`)
  res.cookies.set('apnosh_ref', code, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
  return res
}
