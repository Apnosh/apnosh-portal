export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f5f7' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-5 border-b bg-white"
        style={{ borderColor: '#e6e6ea' }}
      >
        <span
          className="text-[22px] font-semibold tracking-tight"
          style={{ fontFamily: 'Playfair Display, serif', color: '#2e9a78', letterSpacing: '-0.02em' }}
        >
          Apnosh
        </span>
        <span className="text-xs" style={{ color: '#6e6e73' }}>
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
