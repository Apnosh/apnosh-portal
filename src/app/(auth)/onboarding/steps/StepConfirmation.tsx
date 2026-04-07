'use client';

interface Props {
  businessName: string;
  industry: string;
  goalsCount: number;
  platformsCount: number;
  onComplete: () => void;
}

export default function StepConfirmation({
  businessName,
  industry,
  goalsCount,
  platformsCount,
  onComplete,
}: Props) {
  return (
    <div className="space-y-6 text-center">
      {/* Check icon */}
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#eaf7f3] mx-auto">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M8 16.5L13 21.5L24 10.5"
            stroke="#4abd98"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2
        className="text-2xl font-bold"
        style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
      >
        Looking good!
      </h2>

      {/* Summary card */}
      <div className="bg-gray-50 rounded-xl p-5 text-left space-y-3">
        <SummaryRow label="Business" value={businessName || 'Not set'} />
        <SummaryRow label="Industry" value={industry || 'Not set'} />
        <SummaryRow label="Goals selected" value={String(goalsCount)} />
        <SummaryRow label="Platforms connected" value={String(platformsCount)} />
      </div>

      <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
        Your strategist will reach out within 24 hours.
      </p>

      <button
        type="button"
        onClick={onComplete}
        className="inline-flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)' }}
      >
        Enter Dashboard
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-[#1d1d1f]">{value}</span>
    </div>
  );
}
