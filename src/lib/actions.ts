'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// signOut — signs out the user and redirects to /login
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // await supabase.auth.signOut()
  void supabase

  redirect('/login')
}

// ---------------------------------------------------------------------------
// updateBusinessProfile — updates the user's business profile
// ---------------------------------------------------------------------------

export async function updateBusinessProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const industry = formData.get('industry') as string
  const description = formData.get('description') as string
  const website_url = formData.get('website_url') as string
  const phone = formData.get('phone') as string

  // TODO: Implement Supabase mutation
  // const { data: { user } } = await supabase.auth.getUser()
  // const { error } = await supabase
  //   .from('businesses')
  //   .update({ name, industry, description, website_url, phone, updated_at: new Date().toISOString() })
  //   .eq('owner_id', user.id)
  void supabase
  void name
  void industry
  void description
  void website_url
  void phone

  revalidatePath('/dashboard/profile')

  return { success: true }
}

// ---------------------------------------------------------------------------
// createOrder — creates a new order
// ---------------------------------------------------------------------------

export interface CreateOrderData {
  service_id: string
  service_name: string
  type: 'subscription' | 'one_time' | 'a_la_carte'
  quantity: number
  unit_price: number
  total_price: number
  special_instructions?: string
  deadline?: string
}

export async function createOrder(orderData: CreateOrderData): Promise<ActionResult> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // const { data: { user } } = await supabase.auth.getUser()
  // const { data: business } = await supabase
  //   .from('businesses')
  //   .select('id')
  //   .eq('owner_id', user.id)
  //   .single()
  // const { error } = await supabase.from('orders').insert({
  //   business_id: business.id,
  //   ...orderData,
  //   status: 'pending',
  // })
  void supabase
  void orderData

  revalidatePath('/dashboard/orders')

  return { success: true }
}

// ---------------------------------------------------------------------------
// approveDeliverable — approves a deliverable
// ---------------------------------------------------------------------------

export async function approveDeliverable(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // const { data: { user } } = await supabase.auth.getUser()
  // const { error } = await supabase
  //   .from('deliverables')
  //   .update({
  //     status: 'approved',
  //     approved_at: new Date().toISOString(),
  //     approved_by: user.id,
  //   })
  //   .eq('id', id)
  void supabase
  void id

  revalidatePath('/dashboard/approvals')

  return { success: true }
}

// ---------------------------------------------------------------------------
// requestRevision — requests changes on a deliverable
// ---------------------------------------------------------------------------

export async function requestRevision(id: string, feedback: string): Promise<ActionResult> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // const { error } = await supabase
  //   .from('deliverables')
  //   .update({
  //     status: 'revision_requested',
  //     client_feedback: feedback,
  //     updated_at: new Date().toISOString(),
  //   })
  //   .eq('id', id)
  void supabase
  void id
  void feedback

  revalidatePath('/dashboard/approvals')

  return { success: true }
}

// ---------------------------------------------------------------------------
// sendMessage — sends a message in a thread
// ---------------------------------------------------------------------------

export async function sendMessage(threadId: string, content: string): Promise<ActionResult> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // const { data: { user } } = await supabase.auth.getUser()
  // const { data: profile } = await supabase
  //   .from('profiles')
  //   .select('full_name, role')
  //   .eq('id', user.id)
  //   .single()
  // const { error } = await supabase.from('messages').insert({
  //   thread_id: threadId,
  //   sender_id: user.id,
  //   sender_name: profile.full_name,
  //   sender_role: profile.role,
  //   content,
  //   attachments: [],
  // })
  // Also update thread's last_message_at:
  // await supabase
  //   .from('message_threads')
  //   .update({ last_message_at: new Date().toISOString() })
  //   .eq('id', threadId)
  void supabase
  void threadId
  void content

  revalidatePath('/dashboard/messages')

  return { success: true }
}

// ---------------------------------------------------------------------------
// markNotificationRead — marks a notification as read
// ---------------------------------------------------------------------------

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  // TODO: Implement Supabase mutation
  // const { error } = await supabase
  //   .from('notifications')
  //   .update({ read_at: new Date().toISOString() })
  //   .eq('id', id)
  void supabase
  void id

  revalidatePath('/dashboard')

  return { success: true }
}
