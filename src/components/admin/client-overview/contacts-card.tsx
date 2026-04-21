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
  Copy, ExternalLink, Check,
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
          className="text-ink-4 hover:text-brand-dark text-[11px] font-medium inline-flex items-center gap-1 opacity-50 cursor-not-allowed"
          title="Coming soon"
          disabled
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
    </div>
  )
}
