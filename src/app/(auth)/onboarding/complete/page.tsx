'use client';

import { useRouter } from 'next/navigation';

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 sm:px-6"
      style={{ background: 'linear-gradient(180deg, #f8fafb 0%, #eaf7f3 100%)' }}
    >
      <div className="max-w-md w-full text-center">
        {/* Celebration icon */}
        <div className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#eaf7f3]">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 4L23.09 13.26L33 14.27L25.89 20.14L28.18 30L20 25.27L11.82 30L14.11 20.14L7 14.27L16.91 13.26L20 4Z"
              fill="#4abd98"
              stroke="#2e9a78"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1
          className="text-3xl sm:text-4xl font-bold mb-3"
          style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f' }}
        >
          You&apos;re all set!
        </h1>

        <p
          className="text-base mb-8"
          style={{ fontFamily: 'Inter, sans-serif', color: '#424245' }}
        >
          Your business profile is complete. We&apos;re ready to build your marketing strategy.
        </p>

        {/* What happens next card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-8 text-left">
          <h2
            className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ fontFamily: 'Inter, sans-serif', color: '#4abd98' }}
          >
            What happens next
          </h2>
          <ul className="space-y-4">
            {[
              {
                title: 'Strategy generation',
                desc: 'We\u2019ll analyze your profile and create a tailored marketing plan.',
              },
              {
                title: 'Content calendar',
                desc: 'A customized posting schedule will be ready for your review.',
              },
              {
                title: 'Brand assets',
                desc: 'Templates and copy aligned to your brand voice will be prepared.',
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  <div className="w-6 h-6 rounded-full bg-[#eaf7f3] flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2.5 6.5L4.5 8.5L9.5 3.5"
                        stroke="#4abd98"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ fontFamily: 'Inter, sans-serif', color: '#1d1d1f' }}
                  >
                    {item.title}
                  </p>
                  <p
                    className="text-sm mt-0.5"
                    style={{ fontFamily: 'Inter, sans-serif', color: '#424245' }}
                  >
                    {item.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#4abd98]/25 active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #4abd98, #2e9a78)',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Go to Dashboard
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8H13M13 8L9 4M13 8L9 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <p
          className="text-xs mt-6"
          style={{ fontFamily: 'Inter, sans-serif', color: '#9ca3af' }}
        >
          You can update your profile anytime from your dashboard settings.
        </p>
      </div>
    </div>
  );
}
