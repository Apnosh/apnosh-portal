'use client';

const PLATFORMS = [
  {
    id: 'google_business',
    name: 'Google Business Profile',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="#E4405F" strokeWidth="1.5"/>
        <circle cx="12" cy="12" r="5" stroke="#E4405F" strokeWidth="1.5"/>
        <circle cx="18" cy="6" r="1.5" fill="#E4405F"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z" fill="#1877F2"/>
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0A66C2"/>
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.93a8.26 8.26 0 004.84 1.56V7.05a4.84 4.84 0 01-1.08-.36z" fill="#000"/>
      </svg>
    ),
  },
];

interface Props {
  connectedPlatforms: string[];
  onToggle: (platformId: string) => void;
  onSkip: () => void;
}

export default function StepConnectAccounts({ connectedPlatforms, onToggle, onSkip }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500 mb-4">
          Optional. You can connect these later from your dashboard.
        </p>
      </div>

      <div className="space-y-3">
        {PLATFORMS.map((platform) => {
          const connected = connectedPlatforms.includes(platform.id);
          return (
            <div
              key={platform.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                connected ? 'border-[#4abd98] bg-[#eaf7f3]' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                {platform.icon}
                <span className="text-sm font-medium text-[#1d1d1f]">{platform.name}</span>
              </div>
              <button
                type="button"
                onClick={() => onToggle(platform.id)}
                className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-all ${
                  connected
                    ? 'bg-[#4abd98] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {connected ? 'Connected \u2713' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
