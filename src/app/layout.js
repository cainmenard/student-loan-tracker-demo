import '@/app/globals.css'
import Navigation from '@/components/Navigation'

export const metadata = {
  title: 'Student Loan Payoff Tracker — Portfolio Demo',
  description: 'A full-stack student loan payoff tracker built with Next.js, Supabase, and Recharts. Interactive demo with simulated data.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        {/* Portfolio banner */}
        <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-navy-700 via-blue-600 to-navy-700 text-white">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="bg-amber-400 text-navy-700 text-xs font-bold px-2 py-0.5 rounded">DEMO</span>
              <span className="font-medium">Student Loan Payoff Tracker</span>
              <span className="text-blue-200 hidden md:inline">— Full-stack Next.js + PostgreSQL application</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-blue-200 text-xs hidden sm:inline">Interactive — try editing data, running scenarios</span>
              <a href="https://github.com/cainmenard" target="_blank" rel="noopener noreferrer"
                className="text-blue-200 hover:text-white text-xs font-medium transition">
                GitHub ↗
              </a>
            </div>
          </div>
        </div>

        <Navigation />

        <main className="ml-64 pt-14 p-8 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
