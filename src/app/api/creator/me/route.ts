import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCreatorIdForUser, listWorkOrdersForCreator } from '@/lib/campaigns/work-orders'

// The logged-in creator's own inbox: resolves which creator this user IS
// (creator_logins) and returns their orders. No param to spoof, unlike the
// admin ?creator= preview.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const creatorId = await getCreatorIdForUser(user.id)
  if (!creatorId) return NextResponse.json({ creatorId: null, orders: [] })
  return NextResponse.json({ creatorId, orders: await listWorkOrdersForCreator(creatorId) })
}
