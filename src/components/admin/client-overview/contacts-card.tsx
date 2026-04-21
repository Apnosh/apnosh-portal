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
  Copy, ExternalLink, Check, X, AlertTriangle, Pencil, Trash2,
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
  const [editContact, setEditContact] = useState<ContactRow | null>(null)

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
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Contacts</h3>
          {contacts.length > 0 && (
            <span className="text-[10px] font-semibold text-ink-4 bg-bg-2 rounded-full px-1.5 py-0.5 tabular-nums">
              {contacts.length}
            </span>
          )}
        </div>
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
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
          <User className="w-6 h-6 text-ink-5 mb-2" />
          <p className="text-[12.5px] text-ink-3 font-medium">No contacts yet</p>
          <p className="text-[11px] text-ink-4 mt-0.5">Add the people we work with at this client</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map(contact => (
            <div key={contact.id} className="group border-b border-ink-6 last:border-0 pb-3 last:pb-0">
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
                <div className="flex items-center gap-1 flex-shrink-0">
                  {contact.role && contact.role !== 'other' && (
                    <span className="text-[10px] text-ink-3 font-medium bg-bg-2 rounded px-1.5 py-0.5">
                      {ROLE_LABEL[contact.role] ?? contact.role}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditContact(contact)}
                    className="text-ink-4 hover:text-ink-2 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit contact"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
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
        <ContactFormModal
          clientId={clientId}
          hasPrimary={contacts.some(c => c.is_primary)}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); void load() }}
        />
      )}

      {editContact && (
        <ContactFormModal
          clientId={clientId}
          hasPrimary={contacts.some(c => c.is_primary)}
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSaved={() => { setEditContact(null); void load() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contact form modal (add + edit)
// ---------------------------------------------------------------------------

type ContactRole = 'owner' | 'manager' | 'marketing_lead' | 'billing' | 'employee' | 'filming_contact' | 'other'
type PreferredMethod = 'email' | 'phone' | 'text' | 'portal'

function ContactFormModal({
  clientId,
  hasPrimary,
  contact,
  onClose,
  onSaved,
}: {
  clientId: string
  hasPrimary: boolean
  contact?: ContactRow
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!contact
  const [fullName, setFullName] = useState(contact?.full_name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [title, setTitle] = useState(contact?.title ?? '')
  const [role, setRole] = useState<ContactRole>((contact?.role as ContactRole) ?? 'other')
  const [preferred, setPreferred] = useState<PreferredMethod | ''>((contact?.preferred_contact_method as PreferredMethod) ?? '')
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? !hasPrimary)
  const [isBilling, setIsBilling] = useState(contact?.is_billing_contact ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true); setError(null)
    const supabase = createClient()

    // If this contact is being set as primary, unset any other primary on
    // the same client (but leave this row's own is_primary alone).
    if (isPrimary) {
      const q = supabase.from('client_contacts').update({ is_primary: false })
        .eq('client_id', clientId).eq('is_primary', true)
      if (contact) q.neq('id', contact.id)
      await q
    }

    const payload = {
      client_id: clientId,
      full_name: fullName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,
      role,
      preferred_contact_method: preferred || null,
      is_primary: isPrimary,
      is_billing_contact: isBilling,
    }

    const { error: saveErr } = isEdit
      ? await supabase.from('client_contacts').update(payload).eq('id', contact!.id)
      : await supabase.from('client_contacts').insert(payload)

    setSubmitting(false)
    if (saveErr) { setError(saveErr.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!contact) return
    setDeleting(true); setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('client_contacts').delete().eq('id', contact.id)
    setDeleting(false)
    if (delErr) { setError(delErr.message); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl max-w-md w-full my-8 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <h2 className="text-base font-semibold text-ink">{isEdit ? 'Edit contact' : 'Add contact'}</h2>
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

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-2">Delete this contact?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-ink-3 hover:text-ink px-2"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-[13px] text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 px-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )
          ) : <span />}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? 'Save changes' : 'Add contact'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
