'use client'

import { type ReactNode } from 'react'
import { type OnboardingData, PLATFORMS } from '../data'
import { Question, Hint } from '../ui'

interface Props {
  data: OnboardingData
  update: <K extends keyof OnboardingData>(field: K, value: OnboardingData[K]) => void
  nav: ReactNode
}

export default function StepConnect({ data, update, nav }: Props) {
  function togglePlatform(name: string) {
    const connected = { ...data.connected }
    connected[name] = !connected[name]
    update('connected', connected)
  }

  return (
    <>
      <Question title="Connect your accounts" subtitle="Link the platforms you want us to manage" />
      <div className="mt-4 space-y-2">
        {PLATFORMS.map((p) => {
          const isConn = !!data.connected[p.name]
          return (
            <div
              key={p.name}
              className="flex items-center gap-3.5 px-4 py-3 rounded-[10px]"
              style={{
                border: isConn ? '1.5px solid #9fe1cb' : '1.5px solid #e0e0e0',
                background: isConn ? '#f0faf6' : 'white',
              }}
            >
              <div
                className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: p.color + '1a' }}
              >
                {p.emoji}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: '#111' }}>{p.name}</div>
                <div className="text-xs" style={{ color: '#999' }}>{p.desc}</div>
              </div>
              {isConn ? (
                <span
                  className="text-xs font-medium rounded-[20px] px-3 py-1 whitespace-nowrap"
                  style={{ color: '#0f6e56', background: '#f0faf6', border: '1px solid #9fe1cb' }}
                >
                  Connected
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => togglePlatform(p.name)}
                  className="text-xs font-semibold rounded-[20px] px-3.5 py-1 whitespace-nowrap transition-colors"
                  style={{ color: '#4abd98', border: '1.5px solid #4abd98' }}
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
        <Hint>You can always connect more accounts from your dashboard later.</Hint>
      </div>
      {nav}
    </>
  )
}
