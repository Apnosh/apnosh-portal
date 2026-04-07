'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  HelpCircle, CheckCircle, CreditCard, FileText, MessageSquare,
  ShoppingBag, Calendar, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react'

interface FAQ {
  question: string
  answer: string
}

const faqs: { category: string; icon: typeof HelpCircle; items: FAQ[] }[] = [
  {
    category: 'Getting Started',
    icon: CheckCircle,
    items: [
      {
        question: 'How do I set up my account?',
        answer: 'When you first sign in, you\'ll go through a quick onboarding process. Fill in your business details, brand preferences, and marketing goals. This helps us create better content for you. You can always update this later in your Business Profile.',
      },
      {
        question: 'What happens after I sign my agreement?',
        answer: 'Once your agreement is signed, our team gets to work. You\'ll start seeing content in your Approvals tab within a few days. We\'ll also reach out through Messages to introduce your account manager.',
      },
      {
        question: 'How do I complete my profile?',
        answer: 'Go to Business Profile from the sidebar. Fill in as much as you can about your restaurant, brand, and goals. The more we know, the better your content will be. Look for the completeness bar at the top to see what\'s left.',
      },
    ],
  },
  {
    category: 'Approving Content',
    icon: CheckCircle,
    items: [
      {
        question: 'How do I approve content?',
        answer: 'Go to Approvals from the sidebar. You\'ll see any content waiting for your review. Click on an item to see the full preview, then tap Approve or Request Changes. If you request changes, let us know what you\'d like different.',
      },
      {
        question: 'What if I don\'t approve in time?',
        answer: 'We\'ll send you a reminder. If content isn\'t approved by the scheduled date, we\'ll hold it until you review it. Nothing goes live without your approval.',
      },
      {
        question: 'Can I approve everything at once?',
        answer: 'Yes. If you have multiple items to approve, you can use the batch approve option to approve them all with one click.',
      },
    ],
  },
  {
    category: 'Billing & Payments',
    icon: CreditCard,
    items: [
      {
        question: 'When am I billed?',
        answer: 'Your invoice is generated on the 1st of each month (or the date specified in your agreement). Payment is due within 10 days. You can see your next payment date on the Billing page.',
      },
      {
        question: 'How do I update my payment method?',
        answer: 'Go to Billing and click "Manage Billing." This opens our secure payment portal where you can update your credit card or bank account.',
      },
      {
        question: 'Can I pay by bank transfer?',
        answer: 'Yes. We accept both credit/debit cards and ACH bank transfers. Bank transfers have lower processing fees. You can choose your payment method during checkout or in the billing portal.',
      },
      {
        question: 'Where can I find my invoices?',
        answer: 'All invoices are in the Billing section. You can view, download, or print any past invoice.',
      },
    ],
  },
  {
    category: 'Agreements & Contracts',
    icon: FileText,
    items: [
      {
        question: 'Where is my agreement?',
        answer: 'Go to Agreements from the sidebar. Your current service agreement and any past versions are listed there. You can view the full text or download a PDF.',
      },
      {
        question: 'How do I cancel?',
        answer: 'You can cancel with 30 days written notice (or the notice period in your agreement). Send a message through the portal or contact your account manager. You\'ll be billed for any work completed through the cancellation date.',
      },
      {
        question: 'Are there long-term commitments?',
        answer: 'No. All agreements are month-to-month. You can cancel anytime with the notice period specified in your agreement.',
      },
    ],
  },
  {
    category: 'Services & Orders',
    icon: ShoppingBag,
    items: [
      {
        question: 'What\'s included in my plan?',
        answer: 'Go to Orders (or Services) to see your active plan and what\'s included. Your plan details are also in your signed agreement.',
      },
      {
        question: 'How do I request extra work?',
        answer: 'Go to Orders and browse available add-on services. You can add items to your cart and check out, or send a message to your account manager to discuss custom work.',
      },
      {
        question: 'Can I change my plan?',
        answer: 'Yes. Contact your account manager through Messages or browse available plans in the Orders section. Changes take effect at the start of your next billing cycle.',
      },
    ],
  },
  {
    category: 'Communication',
    icon: MessageSquare,
    items: [
      {
        question: 'How do I contact my account manager?',
        answer: 'Go to Messages from the sidebar. You can start a new conversation or reply to an existing one. We typically respond within a few hours during business hours.',
      },
      {
        question: 'What if I have an urgent request?',
        answer: 'Send a message through the portal marked with your urgency level. For truly time-sensitive issues, your account manager\'s direct contact info is available in your welcome message.',
      },
    ],
  },
]

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-ink-6 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-bg-2/50 transition-colors"
      >
        <span className="text-sm font-medium text-ink">{faq.question}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-ink-4 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-ink-4 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-ink-3 leading-relaxed">{faq.answer}</p>
        </div>
      )}
    </div>
  )
}

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Help & Support</h1>
        <p className="text-ink-3 text-sm mt-1">Find answers or reach out to our team.</p>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/messages"
          className="bg-white rounded-xl border border-ink-6 p-5 hover:bg-bg-2/50 transition-colors"
        >
          <MessageSquare className="w-6 h-6 text-brand-dark mb-2" />
          <h3 className="text-sm font-medium text-ink">Message Your Team</h3>
          <p className="text-xs text-ink-4 mt-0.5">Chat directly with your account manager.</p>
        </Link>
        <Link
          href="/dashboard/orders"
          className="bg-white rounded-xl border border-ink-6 p-5 hover:bg-bg-2/50 transition-colors"
        >
          <ShoppingBag className="w-6 h-6 text-brand-dark mb-2" />
          <h3 className="text-sm font-medium text-ink">Request Work</h3>
          <p className="text-xs text-ink-4 mt-0.5">Browse services and add to your plan.</p>
        </Link>
      </div>

      {/* FAQ sections */}
      {faqs.map((section) => {
        const Icon = section.icon
        return (
          <div key={section.category} className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-ink-6 bg-bg-2">
              <Icon className="w-4 h-4 text-ink-3" />
              <h2 className="text-sm font-semibold text-ink">{section.category}</h2>
            </div>
            {section.items.map((faq) => (
              <FAQItem key={faq.question} faq={faq} />
            ))}
          </div>
        )
      })}

      {/* Footer */}
      <div className="bg-brand-tint/50 rounded-xl border border-brand/20 p-5 text-center">
        <p className="text-sm text-ink">Can&apos;t find what you need?</p>
        <Link
          href="/dashboard/messages"
          className="inline-block mt-2 px-5 py-2.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors"
        >
          Contact Support
        </Link>
      </div>
    </div>
  )
}
