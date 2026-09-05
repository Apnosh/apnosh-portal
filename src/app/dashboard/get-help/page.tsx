'use client'
/**
 * /dashboard/get-help — one door for help (owner 2026-09-05): message us, the questions page,
 * share feedback (a message to your strategist with the subject filled in), and the papers.
 */
import { MessageCircle, HelpCircle, Megaphone, FileText } from 'lucide-react'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader, MvpGroup, MvpRow } from '@/components/mvp/mvp-detail'

export default function GetHelpPage() {
  return (
    <MvpShell active="more" header={<MvpDetailHeader title="Get help" subtitle="A real person answers" />}>
      <div style={{ background: '#fff', minHeight: '100%', padding: '10px 16px 24px', fontFamily: "'Inter',system-ui,sans-serif", boxSizing: 'border-box' }}>
        <MvpGroup title="Talk to us" hue="mint">
          <MvpRow icon={<MessageCircle size={18} />} hue="mint" label="Message us" sub="We reply within the hour" href="/dashboard/messages?to=support" />
          <MvpRow icon={<Megaphone size={18} />} hue="announce" label="Share feedback" sub="Tell us what to make better" href={`/dashboard/messages?to=strategist&draft=${encodeURIComponent('Feedback: ')}`} />
        </MvpGroup>
        <MvpGroup title="Find it yourself" hue="nights">
          <MvpRow icon={<HelpCircle size={18} />} hue="nights" label="Questions and answers" href="/dashboard/help" />
        </MvpGroup>
        <MvpGroup title="The papers" hue="grey">
          <MvpRow icon={<FileText size={18} />} hue="grey" label="Your agreements" href="/dashboard/agreements" />
        </MvpGroup>
      </div>
    </MvpShell>
  )
}
