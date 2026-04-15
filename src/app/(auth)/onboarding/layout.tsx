export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fafaf8' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b bg-white"
        style={{ borderColor: '#f0f0f0' }}
      >
        <span
          className="text-[22px] font-semibold tracking-tight"
          style={{ fontFamily: 'Playfair Display, serif', color: '#2e9a78', letterSpacing: '-0.3px' }}
        >
          Apnosh
        </span>
        <span className="text-xs" style={{ color: '#999' }}>
          Account setup
        </span>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-5 pt-10 pb-20">
        {children}
      </main>
    </div>
  )
}
