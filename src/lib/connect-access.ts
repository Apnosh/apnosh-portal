/**
 * Who may CONNECT (or finish connecting) a channel for a client.
 * ==============================================================
 * Every connect lane takes a clientId from the browser: the header switcher
 * puts it in the hub's connect links, and the GBP/GA/GSC pickers carry it
 * through the OAuth round trip. The write side must prove the caller can act
 * for that client before honoring it — otherwise the tenant fork returns as a
 * cross-tenant WRITE (any signed-in user could park connections on, or read
 * Google listings of, any client by editing a URL).
 *
 * Access = a client_users link, ownership of a business on the client, or a
 * staff role (everyone on the team may act for clients; the two client roles
 * may not cross tenants). This is the same proof the read side uses in
 * connection-actions resolveClientId, widened for staff.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const CLIENT_ROLES = new Set(['client_owner', 'client_manager'])

export async function userMayConnectClient(userId: string, clientId: string): Promise<boolean> {
  if (!userId || !clientId) return false
  const admin = createAdminClient()
  const [{ data: link }, { data: owned }, { data: profile }] = await Promise.all([
    admin.from('client_users').select('client_id')
      .eq('auth_user_id', userId).eq('client_id', clientId).maybeSingle(),
    admin.from('businesses').select('client_id')
      .eq('owner_id', userId).eq('client_id', clientId).maybeSingle(),
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
  ])
  if (link?.client_id || owned?.client_id) return true
  const role = (profile?.role as string | null) ?? null
  return !!role && !CLIENT_ROLES.has(role)
}
