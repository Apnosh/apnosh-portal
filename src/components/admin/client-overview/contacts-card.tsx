'use client'

/**
 * Contacts card for the client detail page sidebar.
 *
 * Shows all people linked to this client (client_contacts rows) with
 * inline actions: email, call, copy phone. Primary contact is pinned
 * to the top. Roles shown with icon-badges for scan-ability.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  User, Mail, Phone, MessageSquare, Star, Loader2, Plus,
  Copy, ExternalLink, Check, X, AlertTriangle,
} from 'lucide-react'

interface ContactRow {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string | null
  title: string | null
  pronouns: string | null
  is_primary: boolean
  is_billing_contact: boolean
  preferred_contact_method: string | null
  notes: string | null
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  marketing_lead: 'Marketing',
  billing: 'Billing',
  employee: 'Employee',
  filming_contact: 'Filming',
  other: 'Other',
}

const METHOD_ICON: Record<string, typeof Mail> = {
  email: Mail, phone: Phone, text: MessageSquare, portal: User,
}

export default function ContactsCard({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('client_contacts')
      .select('id, full_name, email, phone, role, title, pronouns, is_primary, is_billing_contact, preferred_contact_method, notes')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('full_name')
    setContacts((data ?? []) as ContactRow[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  async function copyToClipboard(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Best-effort only; if clipboard is blocked, fall back silently.
    }
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">
          Contacts
          {contacts.length > 0 && <span className="ml-1.5 text-ink-4 normal-case tracking-normal">({contacts.length})</span>}
        </h3>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-ink-4 hover:text-brand-dark text-[11px] font-medium inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-ink-4" />
        </div>
      ) : contacts.length === 0 ? (
        <p className="text-[12px] text-ink-4 py-2">No contacts yet.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map(contact => (
            <div key={contact.id} className="border-b border-ink-6 last:border-0 pb-3 last:pb-0">
              {/* Name + role */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {contact.is_primary && (
                    <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
                  )}
                  <span className="text-[13px] font-medium text-ink">{contact.full_name}</span>
                  {contact.pronouns && (
                    <span className="text-[10px] text-ink-4">({contact.pronouns})</span>
                  )}
                </div>
                {contact.role && contact.role !== 'other' && (
                  <span className="text-[10px] text-ink-3 font-medium bg-bg-2 rounded px-1.5 py-0.5 flex-shrink-0">
                    {ROLE_LABEL[contact.role] ?? contact.role}
                  </span>
                )}
              </div>
              {contact.title && (
                <p className="text-[11px] text-ink-4 mb-1.5">{contact.title}</p>
              )}

              {/* Email + phone with click-to-copy */}
              <div className="space-y-1 text-[12px]">
                {contact.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-ink-4 flex-shrink-0" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-ink-2 hover:text-brand-dark truncate flex-1 min-w-0"
                    >
                      {contact.email}
                    </a>
                    <button
                      onClick={() => copyToClipboard(contact.email!, `${contact.id}-email`)}
                      className="text-ink-4 hover:text-ink p-0.5"
                      title="Copy email"
                    >
                      {copied === `${contact.id}-email` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-ink-4 flex-shrink-0" />
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-ink-2 hover:text-brand-dark truncate flex-1 min-w-0"
                    >
                      {contact.phone}
                    </a>
                    <button
                      onClick={() => copyToClipboard(contact.phone!, `${contact.id}-phone`)}
                      className="text-ink-4 hover:text-ink p-0.5"
                      title="Copy phone"
                    >
                      {copied === `${contact.id}-phone` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
                {contact.preferred_contact_method && (() => {
                  const Icon = METHOD_ICON[contact.preferred_contact_method] ?? User
                  return (
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                      <Icon className="w-3 h-3" />
                      Prefers {contact.preferred_contact_method}
                    </div>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <AddContactModal
          clientId={clientId}
          hasPrimary={contacts.some(c => c.is_primary)}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); void load() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add-contact modal
// ---------------------------------------------------------------------------

type ContactRole = 'owner' | 'manager' | 'marketing_lead' | 'billing' | 'employee' | 'filming_contact' | 'other'
type PreferredMethod = 'email' | 'phone' | 'text' | 'portal'

function AddContactModal({
  clientId,
  hasPrimary,
  onClose,
  onSaved,
}: {
  clientId: string
  hasPrimary: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState<ContactRole>('other')
  const [preferred, setPreferred] = useState<PreferredMethod | ''>('')
  const [isPrimary, setIsPrimary] = useState(!hasPrimary)
  const [isBilling, setIsBilling] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true); setError(null)
    const supabase = createClient()

    // If this new contact is being set as primary, unset any existing primary
    if (isPrimary) {
      await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', clientId).eq('is_primary', true)
    }

    const { error: insertErr } = await supabase.from('client_contacts').insert({
      client_id: clientId,
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,
      role,
      preferred_contact_method: preferred || null,
      is_primary: isPrimary,
      is_billing_contact: isBilling,
    })

    setSubmitting(false)
    if (insertErr) { setError(insertErr.message); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl max-w-md w-full my-8 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <h2 className="text-base font-semibold text-ink">Add contact</h2>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">
              Name <span className="text-red-600 normal-case">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as ContactRole)}
                className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
              >
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="marketing_lead">Marketing lead</option>
                <option value="billing">Billing</option>
                <option value="employee">Employee</option>
                <option value="filming_contact">Filming</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. GM, Owner"
                className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Prefers</label>
            <select
              value={preferred}
              onChange={e => setPreferred(e.target.value as PreferredMethod | '')}
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
            >
              <option value="">—</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="text">Text</option>
              <option value="portal">Portal</option>
            </select>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
              Primary contact
            </label>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={isBilling} onChange={e => setIsBilling(e.target.checked)} />
              Billing contact
            </label>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
          <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">Cancel</button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Add contact
          </button>
        </div>
      </form>
    </div>
  )
}
