'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Building2,
  FileText,
  Bell,
  Plug,
  ScrollText,
  ExternalLink,
  Pencil,
  X,
  Check,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string
  legalName: string
  address: string
  phone: string
  email: string
  website: string
}

interface NotificationSetting {
  key: string
  label: string
  enabled: boolean
}

interface AuditEntry {
  id: string
  created_at: string
  action_type: string
  description: string
  performed_by?: string
  businesses?: { name: string } | null
}

// ── Defaults ──────────────────────────────────────────────────────────

const defaultCompanyInfo: CompanyInfo = {
  name: 'Apnosh',
  legalName: 'Apnosh LLC',
  address: '123 Creative Blvd, Suite 200, Atlanta, GA 30301',
  phone: '(404) 555-0199',
  email: 'hello@apnosh.com',
  website: 'https://apnosh.com',
}

const defaultNotifications: NotificationSetting[] = [
  { key: 'new_client', label: 'New client signup', enabled: true },
  { key: 'agreement_signed', label: 'Agreement signed', enabled: true },
  { key: 'invoice_paid', label: 'Invoice paid', enabled: true },
  { key: 'invoice_overdue', label: 'Invoice overdue', enabled: true },
  { key: 'new_message', label: 'New message', enabled: true },
  { key: 'content_approved', label: 'Content approved', enabled: false },
  { key: 'weekly_summary', label: 'Weekly summary email', enabled: true },
]

// ── Toggle Component ──────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        enabled ? 'bg-brand' : 'bg-ink-5'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 mt-0.5 ${
          enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const supabase = createClient()

  // Company profile
  const [company, setCompany] = useState<CompanyInfo>(defaultCompanyInfo)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<CompanyInfo>(defaultCompanyInfo)

  // Notifications
  const [notifications, setNotifications] = useState<NotificationSetting[]>(defaultNotifications)
  const [notifSaved, setNotifSaved] = useState(false)

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)

  // ── Fetch audit log ─────────────────────────────────────────────────
  useEffect(() => {
    async function fetchAuditLog() {
      setAuditLoading(true)
      const { data } = await supabase
        .from('client_activity_log')
        .select('id, created_at, action_type, description, performed_by, businesses(name)')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) {
        const mapped = data.map((d: Record<string, unknown>) => ({
          ...d,
          businesses: Array.isArray(d.businesses) ? d.businesses[0] ?? null : d.businesses ?? null,
        })) as AuditEntry[]
        setAuditLog(mapped)
      }
      setAuditLoading(false)
    }
    fetchAuditLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────

  function startEdit() {
    setEditDraft({ ...company })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function saveCompany() {
    setCompany({ ...editDraft })
    setEditing(false)
  }

  function toggleNotification(key: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.key === key ? { ...n, enabled: !n.enabled } : n))
    )
    setNotifSaved(false)
  }

  function saveNotifications() {
    setNotifSaved(true)
    setTimeout(() => setNotifSaved(false), 3000)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatActionType(type: string) {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  // ── Render ──────────────────────────────────────────────────────────

  const companyFields: { key: keyof CompanyInfo; label: string }[] = [
    { key: 'name', label: 'Company Name' },
    { key: 'legalName', label: 'Legal Name' },
    { key: 'address', label: 'Address' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'website', label: 'Website' },
  ]

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
          Settings
        </h1>
        <p className="text-ink-3 text-sm mt-1">
          Manage your company profile, templates, notifications, and integrations.
        </p>
      </div>

      {/* ── Company Profile ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-ink-3" />
            <h2 className="text-sm font-semibold text-ink">Company Profile</h2>
          </div>
          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark font-medium"
            >
              <Pencil size={14} />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 text-sm text-ink-3 hover:text-ink font-medium"
              >
                <X size={14} />
                Cancel
              </button>
              <button
                onClick={saveCompany}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-1.5"
              >
                <Check size={14} />
                Save
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {companyFields.map(({ key, label }) => (
            <div key={key}>
              <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">
                {label}
              </label>
              {editing ? (
                <input
                  type="text"
                  value={editDraft[key]}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 mt-1"
                />
              ) : (
                <p className="text-sm text-ink mt-1">{company[key]}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Default Templates ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={16} className="text-ink-3" />
          <h2 className="text-sm font-semibold text-ink">Default Templates</h2>
        </div>

        <div className="space-y-3">
          <Link
            href="/admin/agreements/templates"
            className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 hover:bg-bg-2 transition-colors group"
          >
            <div>
              <p className="text-sm font-medium text-ink">Agreement Templates</p>
              <p className="text-ink-3 text-xs mt-0.5">
                Manage reusable agreement templates for clients
              </p>
            </div>
            <ExternalLink
              size={14}
              className="text-ink-4 group-hover:text-brand transition-colors"
            />
          </Link>

          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 opacity-60">
            <div>
              <p className="text-sm font-medium text-ink">Invoice Templates</p>
              <p className="text-ink-3 text-xs mt-0.5">
                Customize invoice layouts and payment terms
              </p>
            </div>
            <span className="bg-ink-6 text-ink-3 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 opacity-60">
            <div>
              <p className="text-sm font-medium text-ink">Email Templates</p>
              <p className="text-ink-3 text-xs mt-0.5">
                Set up automated email templates for client communication
              </p>
            </div>
            <span className="bg-ink-6 text-ink-3 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>
        </div>
      </div>

      {/* ── Notification Settings ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-ink-3" />
            <h2 className="text-sm font-semibold text-ink">Notification Settings</h2>
          </div>
          <button
            onClick={saveNotifications}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {notifSaved ? 'Saved!' : 'Save'}
          </button>
        </div>

        {notifSaved && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">
            Notification preferences saved.
          </div>
        )}

        <div className="space-y-1">
          {notifications.map((n) => (
            <div
              key={n.key}
              className="flex items-center justify-between py-2.5 px-1"
            >
              <span className="text-sm text-ink">{n.label}</span>
              <Toggle
                enabled={n.enabled}
                onChange={() => toggleNotification(n.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Integrations ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plug size={16} className="text-ink-3" />
          <h2 className="text-sm font-semibold text-ink">Integrations</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Stripe</p>
              <p className="text-ink-3 text-xs mt-0.5">Payment processing and invoicing</p>
            </div>
            <span className="bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Connected
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 opacity-60">
            <div>
              <p className="text-sm font-medium text-ink">DocuSign</p>
              <p className="text-ink-3 text-xs mt-0.5">Digital document signing</p>
            </div>
            <span className="bg-ink-6 text-ink-3 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 opacity-60">
            <div>
              <p className="text-sm font-medium text-ink">Social Media APIs</p>
              <p className="text-ink-3 text-xs mt-0.5">
                Instagram, Facebook, TikTok, and LinkedIn
              </p>
            </div>
            <span className="bg-ink-6 text-ink-3 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-ink-6 px-4 py-3 opacity-60">
            <div>
              <p className="text-sm font-medium text-ink">Google APIs</p>
              <p className="text-ink-3 text-xs mt-0.5">
                Google Business Profile, Analytics, and Search Console
              </p>
            </div>
            <span className="bg-ink-6 text-ink-3 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Coming soon
            </span>
          </div>
        </div>
      </div>

      {/* ── Audit Log ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="flex items-center gap-2 p-5 pb-0 mb-4">
          <ScrollText size={16} className="text-ink-3" />
          <h2 className="text-sm font-semibold text-ink">Audit Log</h2>
          <span className="text-ink-4 text-xs ml-1">Last 20 entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6">
                  Action
                </th>
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6">
                  Description
                </th>
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6">
                  Performed By
                </th>
              </tr>
            </thead>
            <tbody>
              {auditLoading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-ink-6 last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="h-4 w-32 bg-ink-6 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-24 bg-ink-6 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-48 bg-ink-6 rounded animate-pulse" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-20 bg-ink-6 rounded animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </>
              ) : auditLog.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-ink-3"
                  >
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                auditLog.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-ink-6 last:border-b-0 hover:bg-bg-2 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-ink-3 whitespace-nowrap">
                      {formatDate(entry.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-ink-6 px-2.5 py-0.5 text-xs font-medium text-ink-2">
                        {formatActionType(entry.action_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink">
                      {entry.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-3">
                      {entry.businesses?.name || entry.performed_by || '--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
