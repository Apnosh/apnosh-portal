/**
 * /preview/setup/gbp — the Google-profile walkthrough, on made-up data, with no login.
 *
 * This is the card every other setup service gets built from, and until now the only way to see it
 * was to sign in, connect a real Google account, and have a real profile behind it. So it got
 * reviewed as screenshots — and a screenshot cannot be tapped, which means everything that only
 * shows itself under interaction went unreviewed.
 *
 * IT MUST BE WRAPPED THE WAY THE REAL PAGE WRAPS IT. The first version of this route rendered the
 * walkthrough bare, and on a desktop window it sprawled edge to edge, which is not what any owner
 * sees. GbpFixer carries no width of its own on purpose: /dashboard/google-profile mounts it inside
 * MvpShell, the phone-shaped portal shell, and that is what holds it to a column. A preview that
 * skips the shell is not previewing the product, it is previewing a component — and it will lie to
 * you about layout every time. So this mirrors the real page: same shell, same detail header, same
 * `active` tab.
 *
 * WHY IT CAN BE PUBLIC. `AiReview` is exported separately from `GbpFixer` and takes its diagnosis
 * as a prop: no client context, no router, no fetching on load. So this route hands it a
 * hand-written fixture and renders. Nothing under /preview/setup constructs a Supabase client, so
 * there is no session to require and no client data to expose.
 *
 * WHAT IS REAL AND WHAT IS NOT. The component is the real one, byte for byte — this is not a copy.
 * The profile it is reading is invented. The save buttons post to /api/dashboard/gbp-apply, which
 * checks access server-side and will refuse, and that refusal is itself worth seeing: it is what an
 * owner without Pro would hit.
 */

import Link from 'next/link'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import PreviewGbpView from './preview-view'
import { PREVIEW_DIAGNOSIS } from '@/lib/campaigns/setup/preview-diagnosis'

export const metadata = { title: 'Google profile walkthrough, preview' }

export default function PreviewGbpPage() {
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="Fix your Google profile"
          subtitle="What Google shows customers today"
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      )}
    >
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ background: '#fbf0da', borderRadius: 13, padding: '10px 12px', fontSize: 12, color: '#8a5a0c', lineHeight: 1.45 }}>
          The real walkthrough, reading a made-up profile. Two parts are good, four need work, two
          are missing and one could not be read, so every state is on screen at once. Saving will be
          refused: that needs a real account.{' '}
          <Link href="/preview/campaign" style={{ color: '#8a5a0c', fontWeight: 640 }}>All screens</Link>
        </div>
      </div>
      <PreviewGbpView diag={PREVIEW_DIAGNOSIS} />
    </MvpShell>
  )
}
