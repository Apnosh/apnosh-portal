'use client'

/**
 * The thin client wrapper the preview needs, and nothing more.
 *
 * `AiReview` requires four drafting props that are normally supplied by `GbpFixer` from its live
 * `/api/dashboard/gbp-draft` state, and one of them is a callback — which cannot cross a server
 * boundary. So the page stays a server component (it can still export metadata) and this supplies
 * them from here.
 *
 * They are deliberately inert rather than faked. Drafting calls a model, the Anthropic balance is
 * empty, and a preview that mimed a successful draft would be showing something the product cannot
 * currently do. `drafting: false` with no draft is the honest state, and it is also exactly what an
 * owner sees today.
 */

import { useState } from 'react'
import { AiReview } from '@/components/mvp/gbp-fixer'
import type { GbpDiagnosis } from '@/lib/gbp-diagnose'

export default function PreviewGbpView({ diag }: { diag: GbpDiagnosis }) {
  /* Pressing "Draft it for me" says why nothing happened rather than failing silently. */
  const [draftError, setDraftError] = useState<string | null>(null)

  return (
    <AiReview
      diag={diag}
      clientId="preview"
      drafting={false}
      draft={null}
      draftError={draftError}
      onDraft={() => setDraftError('Drafting needs a real account, so it is switched off in this preview.')}
    />
  )
}
