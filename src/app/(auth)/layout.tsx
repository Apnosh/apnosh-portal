export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-bg-2 via-bg to-brand-tint p-4">
      {children}
    </div>
  )
}
