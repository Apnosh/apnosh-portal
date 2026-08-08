import 'server-only'
/**
 * email/send — the thinnest possible outbound email helper.
 *
 * Inert until RESEND_API_KEY is configured: without it every call is a logged
 * no-op ({ sent: false }), so callers can wire email today and it simply starts
 * working the day the key lands in Vercel. Sender defaults to EMAIL_FROM.
 *
 * Never throws — email is always best-effort beside an in-portal notification.
 */

const FROM_FALLBACK = 'Apnosh <team@apnosh.com>'

export async function sendEmailIfConfigured(args: {
  to: string[]
  subject: string
  text: string
}): Promise<{ sent: boolean }> {
  const key = process.env.RESEND_API_KEY
  const to = args.to.filter((e) => typeof e === 'string' && e.includes('@')).slice(0, 5)
  if (!to.length) return { sent: false }
  if (!key) {
    console.log('[email] RESEND_API_KEY not set; skipped:', args.subject)
    return { sent: false }
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || FROM_FALLBACK,
        to,
        subject: args.subject.slice(0, 200),
        text: args.text.slice(0, 10000),
      }),
    })
    if (!r.ok) {
      console.error('[email] send failed', r.status, await r.text().catch(() => ''))
      return { sent: false }
    }
    return { sent: true }
  } catch (e) {
    console.error('[email] send threw', e)
    return { sent: false }
  }
}

/** The email addresses behind a client's owner users (client_users + businesses). */
export async function ownerEmailsForClient(clientId: string): Promise<string[]> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const [cuRes, bizRes] = await Promise.all([
      admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
      admin.from('businesses').select('owner_id').eq('client_id', clientId),
    ])
    const ids = new Set<string>()
    for (const r of cuRes.data ?? []) if (r.auth_user_id) ids.add(r.auth_user_id as string)
    for (const r of bizRes.data ?? []) if (r.owner_id) ids.add(r.owner_id as string)
    const emails: string[] = []
    for (const id of [...ids].slice(0, 5)) {
      const { data } = await admin.auth.admin.getUserById(id)
      if (data?.user?.email) emails.push(data.user.email)
    }
    return emails
  } catch {
    return []
  }
}
