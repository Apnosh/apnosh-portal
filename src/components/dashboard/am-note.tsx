'use client'

import Link from 'next/link'

interface AMNoteProps {
  name: string
  initials: string
  role: string
  note: string
}

export default function AMNote({ name, initials, role, note }: AMNoteProps) {
  const firstName = name.split(' ')[0]

  return (
    <div className="rounded-[14px] p-6" style={{ background: 'var(--db-bg-2)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
          style={{ background: 'var(--db-black)' }}
        >
          {initials}
        </div>
        <div>
          <div className="text-[14px] font-bold" style={{ color: 'var(--db-black)' }}>
            {name}
          </div>
          <div className="text-[12px]" style={{ color: 'var(--db-ink-3)' }}>
            {role}
          </div>
        </div>
      </div>
      <div className="text-[14px] leading-[1.65] mb-4" style={{ color: 'var(--db-ink-2)' }}>
        {note}
      </div>
      <Link
        href="/dashboard/messages"
        className="inline-block text-[13px] font-semibold rounded-full transition-colors"
        style={{
          padding: '10px 20px',
          border: '1.5px solid var(--db-border)',
          color: 'var(--db-black)',
          background: 'var(--db-bg)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--db-black)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.borderColor = 'var(--db-black)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--db-bg)'
          e.currentTarget.style.color = 'var(--db-black)'
          e.currentTarget.style.borderColor = 'var(--db-border)'
        }}
      >
        Message {firstName}
      </Link>
    </div>
  )
}
