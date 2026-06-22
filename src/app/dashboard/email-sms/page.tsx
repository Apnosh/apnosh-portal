'use client'

/**
 * Owner Email & SMS hub — apnosh-mvp surface. Reached from More -> Your channels.
 *
 * A transparency + approval surface, NOT a composer: the team drafts and sends
 * campaigns; the owner sees their list, what is coming up, and approves. There
 * is no live ESP connection check, so "connected" is inferred from data
 * presence. Approvals are not wired to an in-app action yet, so a campaign that
 * needs the owner deep-links to Messages (where approval happens today).
 */

import { useState, useEffect, useCallback } from 'react'
import { Mail, Send, Users, BarChart3, MessageSquare, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { EmailCampaign, EmailListSnapshot } from '@/types/database'
import MvpShell from '@/components/mvp/mvp-shell'
import {
  MvpDetailHeader, MvpGroup, MvpRow, MvpPill, MvpStat, MvpStatGrid, MvpSectionLabel, MvpEmpty, StatusPill,
  C, type PillTone,
} from '@/components/mvp/mvp-detail'

function statusPill(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case 'in_review': return { label: 'Needs your OK', tone: 'warn' }
    case 'scheduled': return { label: 'Scheduled', tone: 'good' }
    case 'approved': return { label: 'Approved', tone: 'good' }
    case 'sent': return { label: 'Sent', tone: 'good' }
    default: return { label: 'Draft', tone: 'neutral' }
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

export default function EmailSmsHubPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [upcoming, setUpcoming] = useState<EmailCampaign[]>([])
  const [latestList, setLatestList] = useState<EmailListSnapshot | null>(null)
  const [sentThisMonth, setSentThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [upcomingRes, sentCountRes, listRes] = await Promise.all([
      supabase.from('email_campaigns').select('*').eq('client_id', client.id)
        .in('status', ['draft', 'in_review', 'approved', 'scheduled'])
        .order('scheduled_for', { ascending: true, nullsFirst: false }).limit(5),
      supabase.from('email_campaigns').select('id', { count: 'exact', head: true })
        .eq('client_id', client.id).eq('status', 'sent').gte('sent_at', monthStart),
      supabase.from('email_list_snapshot').select('*').eq('client_id', client.id)
        .order('year', { ascending: false }).order('month', { ascending: false }).limit(1).maybeSingle(),
    ])

    setUpcoming((upcomingRes.data ?? []) as EmailCampaign[])
    setSentThisMonth(sentCountRes.count ?? 0)
    setLatestList(listRes.data as EmailListSnapshot | null)
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['email_campaigns', 'email_list_snapshot'], load)

  const needsReview = upcoming.filter((c) => c.status === 'in_review')
  const subscribers = latestList?.active_subscribers ?? 0
  const newSubs = latestList?.new_subscribers ?? 0
  const isEmpty = upcoming.length === 0 && sentThisMonth === 0 && !latestList

  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Email & SMS" subtitle="Campaigns your team sends for you" />}>
      <div style={{ background: C.bg, minHeight: '100%', padding: '14px 14px 28px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        {clientLoading || loading ? (
          <Skeleton />
        ) : isEmpty ? (
          <>
            <MvpEmpty icon={<Mail size={20} color={C.green} />} title="No campaigns yet" text="Your team will draft email and text campaigns here. You review and approve." />
            <MvpGroup>
              <MvpRow icon={<MessageSquare size={18} />} label="Talk to your team" sub="Ask for an email or text campaign" href="/dashboard/messages" />
            </MvpGroup>
          </>
        ) : (
          <>
            {/* Connection */}
            <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
              <StatusPill label="Email list" on={!!latestList} onText="Connected" offText="Not set up yet" />
            </div>

            {/* Needs you */}
            {needsReview.length > 0 && (
              <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
                <MvpPill tone="warn" label={`${needsReview.length} need${needsReview.length > 1 ? '' : 's'} your OK`} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, marginTop: 9 }}>A campaign is waiting on you</div>
                <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>Reply in Messages to approve it.</div>
                <a href="/dashboard/messages" className="mvp-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, height: 44, borderRadius: 12, background: C.green, color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                  <MessageSquare size={17} /> Approve in Messages
                </a>
              </div>
            )}

            {/* Snapshot */}
            <MvpSectionLabel>Your list</MvpSectionLabel>
            <div style={{ marginBottom: 18 }}>
              <MvpStatGrid>
                <MvpStat icon={<Users size={14} />} value={subscribers.toLocaleString()} label="Subscribers" delta={newSubs > 0 ? { dir: 'up', text: `+${newSubs}` } : undefined} />
                <MvpStat icon={<Send size={14} />} value={String(sentThisMonth)} label="Sent this month" />
                <MvpStat icon={<Mail size={14} />} value={String(upcoming.length)} label="Coming up" />
              </MvpStatGrid>
            </div>

            {/* Coming up */}
            {upcoming.length > 0 && (
              <>
                <MvpSectionLabel>Coming up</MvpSectionLabel>
                <MvpGroup>
                  {upcoming.map((c) => {
                    const st = statusPill(c.status)
                    const date = fmtDate(c.scheduled_for)
                    return (
                      <MvpRow
                        key={c.id}
                        icon={<Mail size={18} />}
                        label={c.name || c.subject || 'Campaign'}
                        sub={[c.subject && c.subject !== c.name ? c.subject : '', date].filter(Boolean).join(' · ') || undefined}
                        right={<MvpPill tone={st.tone} label={st.label} />}
                      />
                    )
                  })}
                </MvpGroup>
              </>
            )}

            {/* Dig deeper */}
            <MvpGroup title="Dig deeper">
              <MvpRow icon={<BarChart3 size={18} />} label="Performance" sub="Opens, clicks, revenue" href="/dashboard/email-sms/performance" />
              <MvpRow icon={<Users size={18} />} label="Subscriber list" sub="Audience and segments" href="/dashboard/email-sms/list" />
              <MvpRow icon={<Megaphone size={18} />} label="All campaigns" sub="Upcoming and sent" href="/dashboard/email-sms/campaigns" />
              <MvpRow icon={<MessageSquare size={18} />} label="Request or approve" sub="Through your team" href="/dashboard/messages" />
            </MvpGroup>
          </>
        )}
      </div>
    </MvpShell>
  )
}

function Skeleton() {
  return (
    <div style={{ marginTop: 4 }}>
      {[56, 90, 150].map((h, i) => <div key={i} style={{ height: h, background: '#ececef', borderRadius: 16, marginBottom: 14, animation: 'mvpPulse 1.2s ease-in-out infinite' }} />)}
      <style>{`@keyframes mvpPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
    </div>
  )
}
