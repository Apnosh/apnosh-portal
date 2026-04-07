import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Server-side notification helper
// Used inside server actions to create notifications for users
// ---------------------------------------------------------------------------

type NotificationType =
  | 'approval_needed'
  | 'deliverable_ready'
  | 'order_confirmed'
  | 'message'
  | 'report_ready'
  | 'payment'
  | 'system'

interface NotifyOptions {
  supabase: SupabaseClient
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

export async function createNotification({
  supabase, userId, type, title, body, link,
}: NotifyOptions) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    link: link || null,
  })
  if (error) console.error('Failed to create notification:', error.message)
}

// ---------------------------------------------------------------------------
// Convenience helpers for common notification types
// ---------------------------------------------------------------------------

export async function notifyAgreementSent(
  supabase: SupabaseClient,
  clientUserId: string,
  businessName: string
) {
  await createNotification({
    supabase,
    userId: clientUserId,
    type: 'system',
    title: 'New agreement ready to sign',
    body: `A service agreement has been sent for ${businessName}. Please review and sign it.`,
    link: '/dashboard/agreements',
  })
}

export async function notifyAgreementSigned(
  supabase: SupabaseClient,
  adminUserIds: string[],
  businessName: string,
  signerName: string
) {
  for (const adminId of adminUserIds) {
    await createNotification({
      supabase,
      userId: adminId,
      type: 'system',
      title: 'Agreement signed',
      body: `${signerName} signed the agreement for ${businessName}.`,
      link: '/admin/agreements',
    })
  }
}

export async function notifyInvoiceCreated(
  supabase: SupabaseClient,
  clientUserId: string,
  amount: number,
  invoiceNumber?: string
) {
  await createNotification({
    supabase,
    userId: clientUserId,
    type: 'payment',
    title: 'New invoice',
    body: `You have a new invoice${invoiceNumber ? ` #${invoiceNumber}` : ''} for $${amount.toFixed(2)}.`,
    link: '/dashboard/billing',
  })
}

export async function notifyInvoicePaid(
  supabase: SupabaseClient,
  adminUserIds: string[],
  businessName: string,
  amount: number
) {
  for (const adminId of adminUserIds) {
    await createNotification({
      supabase,
      userId: adminId,
      type: 'payment',
      title: 'Payment received',
      body: `${businessName} paid $${amount.toFixed(2)}.`,
      link: '/admin/billing',
    })
  }
}

export async function notifyNewMessage(
  supabase: SupabaseClient,
  recipientUserId: string,
  senderName: string,
  threadSubject: string
) {
  await createNotification({
    supabase,
    userId: recipientUserId,
    type: 'message',
    title: `New message from ${senderName}`,
    body: `Re: ${threadSubject}`,
    link: '/dashboard/messages',
  })
}

export async function notifyApprovalNeeded(
  supabase: SupabaseClient,
  clientUserId: string,
  deliverableTitle: string
) {
  await createNotification({
    supabase,
    userId: clientUserId,
    type: 'approval_needed',
    title: 'Content ready for your review',
    body: `"${deliverableTitle}" is ready for you to approve.`,
    link: '/dashboard/approvals',
  })
}

export async function notifyDeliverableApproved(
  supabase: SupabaseClient,
  adminUserIds: string[],
  businessName: string,
  deliverableTitle: string
) {
  for (const adminId of adminUserIds) {
    await createNotification({
      supabase,
      userId: adminId,
      type: 'deliverable_ready',
      title: 'Content approved',
      body: `${businessName} approved "${deliverableTitle}".`,
      link: '/admin/pipeline',
    })
  }
}

export async function notifyOrderCreated(
  supabase: SupabaseClient,
  adminUserIds: string[],
  businessName: string,
  serviceName: string
) {
  for (const adminId of adminUserIds) {
    await createNotification({
      supabase,
      userId: adminId,
      type: 'order_confirmed',
      title: 'New order',
      body: `${businessName} ordered "${serviceName}".`,
      link: '/admin/orders',
    })
  }
}

// ---------------------------------------------------------------------------
// Get all admin user IDs (for broadcasting admin notifications)
// ---------------------------------------------------------------------------

export async function getAdminUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  return (data || []).map((p) => p.id)
}
