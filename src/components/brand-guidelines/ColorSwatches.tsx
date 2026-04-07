'use client'

interface ColorSwatchesProps {
  primary: string
  secondary: string
  accents?: string[]
  editable?: boolean
  onChange?: (colors: { primary: string; secondary: string; accents: string[] }) => void
}

export default function ColorSwatches({ primary, secondary, accents = [], editable, onChange }: ColorSwatchesProps) {
  const allColors = [
    { label: 'Primary', value: primary, key: 'primary' as const },
    { label: 'Secondary', value: secondary, key: 'secondary' as const },
    ...accents.map((c, i) => ({ label: `Accent ${i + 1}`, value: c, key: `accent-${i}` as const })),
  ]

  const handleChange = (key: string, newValue: string) => {
    if (!onChange) return
    if (key === 'primary') {
      onChange({ primary: newValue, secondary, accents })
    } else if (key === 'secondary') {
      onChange({ primary, secondary: newValue, accents })
    } else {
      const idx = parseInt(key.replace('accent-', ''))
      const newAccents = [...accents]
      newAccents[idx] = newValue
      onChange({ primary, secondary, accents: newAccents })
    }
  }

  return (
    <div className="flex flex-wrap gap-4">
      {allColors.map((color) => (
        <div key={color.key} className="flex flex-col items-center gap-1.5">
          <div className="relative">
            <div
              className="w-12 h-12 rounded-full border-2 border-ink-6 shadow-sm"
              style={{ backgroundColor: color.value || '#e5e5e5' }}
            />
            {editable && (
              <input
                type="color"
                value={color.value || '#000000'}
                onChange={(e) => handleChange(color.key, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            )}
          </div>
          <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wider">{color.label}</span>
          <span className="text-[10px] text-ink-3 font-mono">{color.value || 'None'}</span>
        </div>
      ))}
    </div>
  )
}
