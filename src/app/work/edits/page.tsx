/**
 * /work/edits — editor queue.
 *
 * Shoots with raw delivered ('uploaded') are the editor's work. Once
 * the cut ships and is uploaded, editor marks the shoot 'completed'.
 * AI helper drafts hook variations grounded in the brief + voice.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getEditQueue } from '@/lib/work/get-edit-queue'
import EditsView from './edits-view'

export const dynamic = 'force-dynamic'

export default async function EditsPage() {
  await requireAnyCapability(['editor'])
  const queue = await getEditQueue()
  return <EditsView initialQueue={queue} />
}
