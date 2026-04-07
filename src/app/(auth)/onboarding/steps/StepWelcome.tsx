'use client';

export default function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center py-8">
      {/* Apnosh logo mark */}
      <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#eaf7f3]">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 4C9.4 4 4 9.4 4 16s5.4 12 12 12 12-5.4 12-12S22.6 4 16 4zm0 20c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8z"
            fill="#4abd98"
          />
          <circle cx="16" cy="16" r="4" fill="#2e9a78" />
        </svg>
      </div>

      <h1
        className="text-3xl sm:text-4xl font-bold mb-4"
        style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
      >
        Welcome to Apnosh
      </h1>

      <p
        className="text-base mb-8 max-w-md mx-auto"
        style={{ fontFamily: 'Inter, sans-serif', color: '#424245', lineHeight: 1.7 }}
      >
        Your AI-powered marketing team. Let&apos;s set up your business profile so we can start
        creating content that grows your business.
      </p>

      <button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, #4abd98, #2e9a78)' }}
      >
        Let&apos;s get started
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
