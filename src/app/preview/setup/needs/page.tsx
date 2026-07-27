/**
 * /preview/setup/needs — "what we will need from you", before you buy, with no login.
 *
 * Same rule as the gbp preview next door: mounted inside MvpShell, because that is what holds it to
 * a phone-shaped column. A preview that skips the shell previews a component, not the product, and
 * lies about layout on a desktop window every time.
 *
 * The vault it reads is a hand-written pair, not a query. Nothing here constructs a Supabase client,
 * so there is no session to require and no client data to expose.
 */

import Link from 'next/link'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'
import PreviewNeedsView from './preview-view'

export const metadata = { title: 'What it takes, preview' }

export default function PreviewNeedsPage() {
  return (
    <MvpShell
      active="more"
      header={(
        <MvpDetailHeader
          title="What it takes"
          subtitle="Shown before you buy, not after"
          backHref="/preview/campaign"
          backLabel="All screens"
        />
      )}
    >
      <div style={{ padding: '10px 14px 0' }}>
        <div style={{ background: '#fbf0da', borderRadius: 13, padding: '10px 12px', fontSize: 12, color: '#8a5a0c', lineHeight: 1.45 }}>
          Switch the version to see the list change: the free lane wants less than the done-for-you
          lane of the same card, because it genuinely does. Switch the vault to see what a returning
          client is not asked for twice.{' '}
          <Link href="/preview/campaign" style={{ color: '#8a5a0c', fontWeight: 640 }}>All screens</Link>
        </div>
      </div>
      <PreviewNeedsView />
    </MvpShell>
  )
}
