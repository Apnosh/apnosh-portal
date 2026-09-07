/**
 * auth/roles — who is STAFF, in one place.
 *
 * profiles.role carries two staff roles, 'admin' and 'super_admin', and every route that cared
 * wrote its own list. They had already drifted: the share route counted a super_admin as staff and
 * the monthly report's open-stamp did not, so a super_admin opening a client's report from the
 * email link stamped it as the OWNER having read it — a number staff then read back as "they saw
 * it". One list, so a check can never mean two things.
 *
 * Pure and client-safe: no server imports, no database. Note this says what a role IS, not what a
 * person may READ — that is userMayReadClient (src/lib/auth/client-access.ts).
 */

export const STAFF_ROLES = ['admin', 'super_admin'] as const

export type StaffRole = typeof STAFF_ROLES[number]

/** Apnosh staff, not the business. Anything unknown, missing or misspelled is NOT staff. */
export function isStaffRole(role: unknown): boolean {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)
}
