'use client'

interface VoiceWordCardProps {
  word: string
  description: string
  examples: string[]
  editable?: boolean
  onChange?: (data: { word: string; description: string; examples: string[] }) => void
}

export default function VoiceWordCard({ word, description, examples, editable, onChange }: VoiceWordCardProps) {
  if (editable && onChange) {
    return (
      <div className="p-4 rounded-lg border border-ink-6 bg-bg-2 space-y-3">
        <input
          value={word}
          onChange={(e) => onChange({ word: e.target.value, description, examples })}
          placeholder="Voice word"
          className="w-full text-sm font-semibold text-ink border border-ink-6 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
        <textarea
          value={description}
          onChange={(e) => onChange({ word, description: e.target.value, examples })}
          placeholder="What this means for your brand..."
          rows={2}
          className="w-full text-sm text-ink-2 border border-ink-6 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
        />
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wider">Examples</span>
          {examples.map((ex, i) => (
            <input
              key={i}
              value={ex}
              onChange={(e) => {
                const newExamples = [...examples]
                newExamples[i] = e.target.value
                onChange({ word, description, examples: newExamples })
              }}
              placeholder={`Example ${i + 1}`}
              className="w-full text-xs text-ink-2 border border-ink-6 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg border border-ink-6 bg-bg-2">
      <h4 className="text-sm font-semibold text-ink capitalize">{word}</h4>
      <p className="text-sm text-ink-2 mt-1">{description}</p>
      {examples.length > 0 && (
        <div className="mt-2.5 space-y-1">
          <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wider">Examples</span>
          {examples.map((ex, i) => (
            <p key={i} className="text-xs text-ink-3 italic pl-3 border-l-2 border-brand/20">{ex}</p>
          ))}
        </div>
      )}
    </div>
  )
}
